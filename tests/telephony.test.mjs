import Twilio from "twilio";

import { GET as recordingRoute } from "../src/app/api/calls/[id]/recording/route.ts";
import { PATCH as patchCall } from "../src/app/api/calls/[id]/route.ts";
import { POST as createCall, GET as listCalls } from "../src/app/api/calls/route.ts";
import { POST as statusWebhook } from "../src/app/api/webhooks/twilio/status/route.ts";
import { POST as voiceWebhook } from "../src/app/api/webhooks/twilio/voice/route.ts";
import { prisma } from "../src/lib/prisma.ts";
import { callAccessWhere, canEditCall } from "../src/lib/telephony/call-access.ts";
import {
  getTwilioClient,
  getTwilioConfig,
  initiateCall,
  readTwilioWebhook,
  recordingMediaUrl,
} from "../src/lib/telephony/twilio-client.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const parentSid = `CA${"1".repeat(32)}`;
const childSid = `CA${"2".repeat(32)}`;
const recordingSid = `RE${"3".repeat(32)}`;
const accountSid = `AC${"4".repeat(32)}`;
const origin = "https://crm.example.test";
let saved;
let notifications;

function matches(record, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item) => matches(record, item));
    if (key === "AND") return value.every((item) => matches(record, item));
    if (value && typeof value === "object" && "in" in value) return value.in.includes(record[key]);
    if (value && typeof value === "object" && "not" in value) return record[key] !== value.not;
    return record[key] === value;
  });
}

function callback(leg, fields, options = {}) {
  const publicUrl = `${origin}/api/webhooks/twilio/${leg === "voice" ? "voice" : "status"}?callId=call-1${leg === "voice" ? "" : `&leg=${leg}`}`;
  const payload = { AccountSid: accountSid, CallSid: parentSid, ...fields };
  const signature = Twilio.getExpectedTwilioSignature("test-token", publicUrl, payload);
  return new Request(publicUrl.replace(origin, options.internalOrigin ?? origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-twilio-signature": options.invalid ? "invalid" : signature,
    },
    body: new URLSearchParams(payload),
  });
}

beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1", name: "Operator", role: "MEMBER" };
  process.env.TWILIO_ACCOUNT_SID = accountSid;
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_PHONE_NUMBER = "+14155550100";
  process.env.TWILIO_AGENT_PHONE_NUMBER = "+14155550101";
  process.env.TWILIO_WEBHOOK_BASE_URL = origin;
  saved = {
    id: "call-1",
    direction: "OUTBOUND",
    status: "RINGING",
    provider: "twilio",
    externalId: parentSid,
    dialExternalId: null,
    dialStarted: false,
    fromNumber: "+14155550100",
    toNumber: "+14155550102",
    contactId: "contact-1",
    dealId: null,
    userId: "user-1",
    workspaceId: "workspace-1",
    recordingUrl: null,
    duration: null,
  };
  notifications = [];
  mock.method(prisma.phoneCall, "findFirst", async ({ where }) => (matches(saved, where) ? { ...saved } : null));
  mock.method(prisma.phoneCall, "updateMany", async ({ where, data }) => {
    if (!matches(saved, where)) return { count: 0 };
    Object.assign(saved, data);
    return { count: 1 };
  });
  mock.method(prisma.phoneCall, "update", async ({ data }) => {
    Object.assign(saved, data);
    return { ...saved };
  });
  mock.method(prisma.phoneCall, "findUniqueOrThrow", async () => ({ ...saved }));
  mock.method(prisma.workspaceMember, "findUnique", async () => ({ id: "member-1" }));
  mock.method(prisma.notification, "create", async ({ data }) => {
    notifications.push(data);
    return data;
  });
  mock.method(prisma, "$transaction", async (work) => {
    const previous = { ...saved };
    const count = notifications.length;
    try {
      return await work(prisma);
    } catch (error) {
      saved = previous;
      notifications.length = count;
      throw error;
    }
  });
  // No real Twilio or database calls are made in this suite.
  const client = getTwilioClient();
  mock.method(client.calls, "create", async () => ({ sid: parentSid }));
  mock.method(client, "request", async () => ({
    statusCode: 200,
    body: { recordings: [], next_page_uri: null },
    headers: {},
  }));
});
afterEach(() => mock.restoreAll());

test("bridge calls the operator, generates contact TwiML and rejects loopback targets", async () => {
  const calls = getTwilioClient().calls.create;
  await initiateCall(saved.fromNumber, saved.toNumber, saved.id);
  const options = calls.mock.calls[0].arguments[0];
  assert.equal(options.to, process.env.TWILIO_AGENT_PHONE_NUMBER);
  assert.equal(options.from, saved.fromNumber);
  assert.match(options.url, /voice\?callId=call-1$/);
  assert.match(options.statusCallback, /leg=agent$/);
  await assert.rejects(initiateCall(saved.fromNumber, saved.fromNumber, saved.id));
  const response = await voiceWebhook(
    callback("voice", { From: saved.fromNumber, To: process.env.TWILIO_AGENT_PHONE_NUMBER }),
  );
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /record="record-from-answer-dual"/);
  assert.match(xml, /<Number[^>]*>\+14155550102<\/Number>/);
  assert.match(xml, /leg=contact/);
  assert.equal(saved.dialStarted, true);
});

test("webhooks validate signatures behind a proxy and reject tampering before writing", async () => {
  assert.ok(
    await readTwilioWebhook(callback("agent", { CallStatus: "ringing" }, { internalOrigin: "http://localhost:3000" })),
  );
  assert.equal((await statusWebhook(callback("agent", { CallStatus: "completed" }, { invalid: true }))).status, 403);
  assert.equal((await voiceWebhook(callback("voice", {}, { invalid: true }))).status, 403);
  assert.equal(saved.status, "RINGING");
  const wrong = callback("agent", { CallSid: childSid, CallStatus: "no-answer" });
  assert.equal((await statusWebhook(wrong)).status, 403);
  assert.equal(notifications.length, 0);
});

test("contact callbacks preserve terminal results and notify once across retries and late events", async () => {
  saved.dialStarted = true;
  const notify = async (status) =>
    statusWebhook(
      callback("contact", {
        CallSid: childSid,
        ParentCallSid: parentSid,
        CallStatus: status,
      }),
    );
  assert.equal((await notify("in-progress")).status, 204);
  await notify("ringing");
  assert.equal(saved.status, "IN_PROGRESS");
  await notify("no-answer");
  await notify("no-answer");
  await notify("in-progress");
  await statusWebhook(callback("agent", { CallStatus: "completed", CallDuration: "42" }));
  await statusWebhook(callback("dial", { DialCallSid: childSid, DialCallStatus: "no-answer" }));
  assert.equal(saved.status, "MISSED");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, saved.userId);
  assert.equal(notifications[0].workspaceId, saved.workspaceId);
});

test("notification failures roll back the terminal transition so Twilio can retry safely", async () => {
  const create = mock.method(prisma.notification, "create", async () => {
    throw new Error("temporary DB failure");
  });
  await assert.rejects(statusWebhook(callback("agent", { CallStatus: "no-answer" })));
  assert.equal(saved.status, "RINGING");
  create.mock.restore();
  await statusWebhook(callback("agent", { CallStatus: "no-answer" }));
  assert.equal(saved.status, "MISSED");
  assert.equal(saved.dialStarted, false);
  assert.match(notifications[0].body, /contact was not dialed/);
});

test("completed calls retain duration and accept only correlated recording callbacks", async () => {
  saved.dialStarted = true;
  saved.dialExternalId = childSid;
  const result = await statusWebhook(
    callback("dial", { DialCallSid: childSid, DialCallStatus: "completed", DialCallDuration: "65" }),
  );
  assert.equal(result.status, 200);
  assert.match(await result.text(), /<Hangup/);
  await statusWebhook(callback("contact", { CallSid: childSid, ParentCallSid: parentSid, CallStatus: "ringing" }));
  assert.equal(saved.status, "COMPLETED");
  assert.equal(saved.duration, 65);
  const recorded = await statusWebhook(
    callback("recording", {
      RecordingStatus: "completed",
      RecordingSid: recordingSid,
      RecordingUrl: "https://attacker.example/audio",
    }),
  );
  assert.equal(recorded.status, 204);
  assert.equal(saved.recordingUrl, recordingMediaUrl(recordingSid));
  assert.equal(
    (
      await statusWebhook(
        callback("recording", {
          CallSid: `CA${"5".repeat(32)}`,
          RecordingStatus: "completed",
          RecordingSid: recordingSid,
        }),
      )
    ).status,
    403,
  );
  assert.equal(notifications.length, 0);
});

test("call access respects workspace boundaries and record grants; viewers cannot edit", async () => {
  const member = { userId: "user-1", workspaceId: "workspace-1", role: "MEMBER" };
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma.contact, "findMany", async () => [
    { id: "contact-1", ownerId: "user-1" },
    { id: "hidden", ownerId: "other" },
  ]);
  mock.method(prisma.deal, "findMany", async () => []);
  mock.method(prisma.recordPermission, "findMany", async () => []);
  const where = await callAccessWhere(member);
  assert.equal(matches(saved, where), true);
  assert.equal(matches({ ...saved, workspaceId: "workspace-2" }, where), false);
  assert.equal(matches({ ...saved, contactId: "hidden" }, where), false);
  assert.equal(matches({ ...saved, dealId: "hidden-deal" }, where), false);
  assert.equal(await canEditCall({ ...member, role: "VIEWER" }, saved), false);
  assert.deepEqual(await callAccessWhere({ ...member, role: "OWNER" }), { workspaceId: "workspace-1" });
  process.env.TWILIO_WEBHOOK_BASE_URL = "http://localhost:3000";
  assert.throws(getTwilioConfig, /HTTPS/);
});

test("call APIs reject anonymous and viewer writes and keep list queries in the active workspace", async () => {
  const request = () =>
    new Request(`${origin}/api/calls`, {
      method: "POST",
      body: JSON.stringify({ contactId: "contact-1", phoneNumber: saved.toNumber }),
    });
  globalThis.telephonyTestActor = null;
  assert.equal((await createCall(request())).status, 401);
  assert.equal((await listCalls(new Request(`${origin}/api/calls`))).status, 401);
  assert.equal(
    (
      await recordingRoute(new Request(`${origin}/api/calls/call-1/recording`), {
        params: Promise.resolve({ id: "call-1" }),
      })
    ).status,
    401,
  );
  globalThis.telephonyTestActor = { id: "user-1" };
  mock.method(prisma.workspaceMember, "findFirst", async () => ({
    userId: "user-1",
    workspaceId: "workspace-1",
    role: "VIEWER",
  }));
  assert.equal((await createCall(request())).status, 403);
  mock.method(prisma.contact, "findMany", async () => [{ id: "contact-1", ownerId: "other" }]);
  mock.method(prisma.deal, "findMany", async () => []);
  mock.method(prisma.recordPermission, "findMany", async () => []);
  assert.equal(
    (
      await patchCall(
        new Request(`${origin}/api/calls/call-1`, { method: "PATCH", body: JSON.stringify({ notes: "Denied" }) }),
        { params: Promise.resolve({ id: "call-1" }) },
      )
    ).status,
    403,
  );
  const find = mock.method(prisma.phoneCall, "findMany", async ({ where }) => (matches(saved, where) ? [saved] : []));
  mock.method(prisma.phoneCall, "count", async () => 1);
  const list = await listCalls(new Request(`${origin}/api/calls?contactId=contact-1`));
  assert.equal(list.status, 200);
  assert.equal(find.mock.calls[0].arguments[0].where.AND[0].workspaceId, "workspace-1");
  assert.equal((await listCalls(new Request(`${origin}/api/calls?direction=invalid`))).status, 400);
});

test("call POST saves and audits before dialing and rejects a different recipient", async () => {
  mock.method(prisma.workspaceMember, "findFirst", async () => ({
    userId: "user-1",
    workspaceId: "workspace-1",
    role: "OWNER",
  }));
  mock.method(prisma.contact, "findFirst", async () => ({
    id: "contact-1",
    firstName: "Demo",
    lastName: "Contact",
    phone: saved.toNumber,
  }));
  const order = [];
  mock.method(prisma.phoneCall, "create", async ({ data }) => {
    order.push("save");
    saved = { ...saved, ...data, externalId: null };
    return { ...saved };
  });
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    order.push("audit");
    return data;
  });
  mock.method(getTwilioClient().calls, "create", async () => {
    order.push("dial");
    return { sid: parentSid };
  });
  const request = (number) =>
    new Request(`${origin}/api/calls`, {
      method: "POST",
      body: JSON.stringify({ contactId: "contact-1", phoneNumber: number }),
    });
  assert.equal((await createCall(request("+14155559999"))).status, 400);
  assert.deepEqual(order, []);
  assert.equal((await createCall(request(saved.toNumber))).status, 201);
  assert.deepEqual(order, ["save", "audit", "dial"]);
  assert.equal(saved.externalId, parentSid);
});
