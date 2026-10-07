import { POST as connectChannel, GET as getChannels } from "../src/app/api/messaging/channels/route.ts";
import { POST as sendMessage } from "../src/app/api/messaging/conversations/[id]/messages/route.ts";
import { PATCH as patchConversation } from "../src/app/api/messaging/conversations/[id]/route.ts";
import { GET as getConversations } from "../src/app/api/messaging/conversations/route.ts";
import { GET as mediaRoute } from "../src/app/api/messaging/messages/[id]/media/route.ts";
import { POST as telegramWebhook } from "../src/app/api/webhooks/telegram/route.ts";
import { GET as verifyWhatsapp, POST as whatsappWebhook } from "../src/app/api/webhooks/whatsapp/route.ts";
import { conversationAccessWhere } from "../src/lib/messaging/access.ts";
import { receiveMessage } from "../src/lib/messaging/receive.ts";
import {
  decryptMessagingSecret,
  encryptMessagingSecret,
  verifyWhatsAppSignature,
} from "../src/lib/messaging/security.ts";
import { parseTelegramWebhook } from "../src/lib/messaging/telegram.ts";
import { parseWhatsAppWebhook } from "../src/lib/messaging/whatsapp.ts";
import { prisma } from "../src/lib/prisma.ts";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

let state;
const context = { params: Promise.resolve({ id: "conversation-1" }) };
const origin = "https://crm.example.test";
function jsonRequest(path, body) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function telegramPayload(extra = {}) {
  return {
    update_id: 10,
    message: {
      message_id: 20,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 12345, type: "private" },
      from: { id: 12345, first_name: "Demo" },
      text: "Hello",
      ...extra,
    },
  };
}
function whatsappPayload(values) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: values.map((value) => ({ field: "messages", value })) }],
  };
}
function waValue(text = "Hello", id = "wamid.1", phone = "99999") {
  return {
    metadata: { phone_number_id: phone },
    messages: [
      { id, from: "14155550102", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } },
    ],
  };
}
function signedWhatsApp(payload) {
  const raw = JSON.stringify(payload);
  return new Request(`${origin}/api/webhooks/whatsapp?channelId=channel-1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`,
    },
    body: raw,
  });
}

beforeEach(() => {
  process.env.MESSAGING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.MESSAGING_WEBHOOK_BASE_URL = origin;
  process.env.WHATSAPP_APP_SECRET = "app-secret";
  process.env.WHATSAPP_API_VERSION = "v24.0";
  globalThis.telephonyTestActor = { id: "user-1" };
  const member = { userId: "user-1", workspaceId: "workspace-1", role: "OWNER" };
  const channel = {
    id: "channel-1",
    platform: "WHATSAPP",
    channelId: "99999",
    channelName: "Support",
    workspaceId: "workspace-1",
    phoneNumber: "+14155550100",
    botUsername: null,
    isActive: true,
    accessToken: encryptMessagingSecret("test-token"),
    webhookSecret: encryptMessagingSecret("verify-secret-12345"),
  };
  const conversation = {
    id: "conversation-1",
    externalId: "14155550102",
    channelId: channel.id,
    channel,
    contactId: "contact-1",
    assignedToId: "user-1",
    unreadCount: 0,
    status: "OPEN",
    lastMessageAt: null,
  };
  state = {
    member,
    channel,
    conversation,
    messages: [],
    notifications: [],
    requests: [],
    matches: [{ id: "contact-1", ownerId: "user-1" }],
  };
  mock.method(prisma.workspaceMember, "findFirst", async () => state.member);
  mock.method(prisma.workspaceMember, "findUnique", async () => state.member);
  mock.method(prisma.workspaceMember, "findMany", async () => [state.member]);
  mock.method(prisma, "$queryRaw", async () => state.matches);
  mock.method(prisma.contact, "findMany", async () => state.matches);
  mock.method(prisma.contact, "findFirst", async () => state.matches[0] ?? null);
  mock.method(prisma.recordPermission, "findMany", async () => []);
  mock.method(prisma.recordPermission, "findUnique", async () => null);
  mock.method(prisma.messagingChannel, "findFirst", async () => state.channel);
  mock.method(prisma.messagingChannel, "findUnique", async () => null);
  mock.method(prisma.messagingChannel, "findMany", async ({ select }) => [
    Object.fromEntries(Object.keys(select).map((key) => [key, state.channel[key]])),
  ]);
  mock.method(prisma.messagingConversation, "findFirst", async ({ where }) =>
    JSON.stringify(where).includes("workspace-2") ? null : { ...state.conversation },
  );
  mock.method(prisma.messagingConversation, "findUniqueOrThrow", async () => ({ ...state.conversation }));
  mock.method(prisma.messagingConversation, "findUnique", async () => ({ ...state.conversation }));
  mock.method(prisma.messagingConversation, "upsert", async () => ({ ...state.conversation }));
  mock.method(prisma.messagingConversation, "update", async ({ data }) => {
    const count = data.unreadCount;
    Object.assign(state.conversation, {
      ...data,
      unreadCount:
        typeof count === "object"
          ? state.conversation.unreadCount + count.increment
          : (count ?? state.conversation.unreadCount),
    });
    return { ...state.conversation };
  });
  mock.method(prisma.messagingMessage, "createMany", async ({ data }) => {
    if (
      state.messages.some(
        (message) => message.externalId === data.externalId && message.conversationId === data.conversationId,
      )
    )
      return { count: 0 };
    state.messages.push({ id: `message-${state.messages.length + 1}`, readAt: null, ...data });
    return { count: 1 };
  });
  mock.method(prisma.messagingMessage, "create", async ({ data }) => {
    const message = { id: `message-${state.messages.length + 1}`, sentAt: new Date(), ...data };
    state.messages.push(message);
    return { ...message };
  });
  mock.method(
    prisma.messagingMessage,
    "findUnique",
    async ({ where }) =>
      state.messages.find((item) => item.clientRequestId === where.conversationId_clientRequestId.clientRequestId) ??
      null,
  );
  mock.method(prisma.messagingMessage, "findFirst", async () => ({ sentAt: new Date(), ...state.messages.at(-1) }));
  mock.method(prisma.messagingMessage, "update", async ({ where, data }) => {
    const item = state.messages.find((entry) => entry.id === where.id);
    Object.assign(item, data);
    return { ...item };
  });
  mock.method(prisma.messagingMessage, "updateMany", async () => ({ count: 0 }));
  mock.method(prisma.notification, "create", async ({ data }) => {
    state.notifications.push(data);
    return data;
  });
  mock.method(prisma, "$transaction", async (work) => {
    const before = structuredClone({
      messages: state.messages,
      conversation: state.conversation,
      notifications: state.notifications,
    });
    try {
      return await work(prisma);
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  });
  mock.method(globalThis, "fetch", async (url, options) => {
    state.requests.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    return Response.json({ messages: [{ id: "wamid.out" }], ok: true, result: { message_id: 30 } });
  });
});
afterEach(() => mock.restoreAll());

test("provider parsers handle batches/media and never trust another person's Telegram contact", () => {
  const parsed = parseWhatsAppWebhook(whatsappPayload([waValue("One", "1"), waValue("Two", "2")]));
  assert.deepEqual(
    parsed.messages.map((message) => message.content),
    ["One", "Two"],
  );
  const mediaValue = waValue();
  mediaValue.messages[0] = {
    ...mediaValue.messages[0],
    type: "image",
    text: undefined,
    image: { id: "media-1", caption: "Attachment" },
  };
  const mediaMessage = parseWhatsAppWebhook(whatsappPayload([mediaValue])).messages[0];
  assert.equal(mediaMessage.content, "Attachment");
  assert.equal(mediaMessage.mediaId, "media-1");
  const photo = parseTelegramWebhook(
    telegramPayload({ text: undefined, photo: [{ file_id: "small" }, { file_id: "large" }], caption: "Photo" }),
  );
  assert.equal(photo.mediaId, "large");
  assert.equal(photo.content, "Photo");
  assert.equal(
    parseTelegramWebhook(telegramPayload({ contact: { phone_number: "+14155550102", user_id: 99999 } })).phone,
    null,
  );
  assert.equal(
    parseTelegramWebhook(telegramPayload({ contact: { phone_number: "+14155550102", user_id: 12345 } })).phone,
    "+14155550102",
  );
  assert.equal(parseTelegramWebhook(telegramPayload({ chat: { id: -100, type: "group" } })), null);
});

test("secrets are encrypted; WhatsApp verification and signatures reject forgery", async () => {
  const encrypted = encryptMessagingSecret("sensitive");
  assert.ok(!encrypted.includes("sensitive"));
  assert.equal(decryptMessagingSecret(encrypted), "sensitive");
  assert.throws(() => decryptMessagingSecret(encrypted.replace("v1:", "v2:")));
  const good = await verifyWhatsapp(
    new Request(
      `${origin}/api/webhooks/whatsapp?channelId=channel-1&hub.mode=subscribe&hub.verify_token=verify-secret-12345&hub.challenge=1234`,
    ),
  );
  assert.equal(await good.text(), "1234");
  assert.equal(
    (
      await verifyWhatsapp(
        new Request(`${origin}/api/webhooks/whatsapp?channelId=channel-1&hub.mode=subscribe&hub.verify_token=wrong`),
      )
    ).status,
    403,
  );
  assert.equal(verifyWhatsAppSignature("{}", null), false);
  assert.equal(
    (await whatsappWebhook(jsonRequest("/api/webhooks/whatsapp?channelId=channel-1", whatsappPayload([waValue()]))))
      .status,
    403,
  );
  assert.equal(state.messages.length, 0);
});

test("incoming retries create one message, unread increment and notification; other phone IDs are ignored", async () => {
  const payload = whatsappPayload([waValue(), waValue("Other channel", "2", "88888")]);
  await whatsappWebhook(signedWhatsApp(payload));
  await whatsappWebhook(signedWhatsApp(payload));
  assert.equal(state.messages.length, 1);
  assert.equal(state.conversation.unreadCount, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].workspaceId, "workspace-1");
  const insert = mock.method(prisma.notification, "create", async () => {
    throw new Error("temporary failure");
  });
  await assert.rejects(
    receiveMessage(state.channel, parseWhatsAppWebhook(whatsappPayload([waValue("Next", "new")])).messages[0]),
  );
  assert.equal(state.messages.length, 1);
  assert.equal(state.conversation.unreadCount, 1);
  insert.mock.restore();
  const newest = new Date(Date.now() + 30_000);
  state.conversation.lastMessageAt = newest;
  // Simulate a stale upsert snapshot while the row lock sees a newer message.
  mock.method(prisma.messagingConversation, "upsert", async () => ({ ...state.conversation, lastMessageAt: null }));
  await receiveMessage(
    state.channel,
    parseWhatsAppWebhook(whatsappPayload([waValue("Delayed", "delayed")])).messages[0],
  );
  assert.equal(state.conversation.lastMessageAt.getTime(), newest.getTime());
});

test("Telegram requires its per-channel secret, acknowledges paused channels and handles private messages", async () => {
  state.channel.platform = "TELEGRAM";
  const send = (secret) => {
    const request = jsonRequest("/api/webhooks/telegram?channelId=channel-1", telegramPayload());
    request.headers.set("x-telegram-bot-api-secret-token", secret);
    return telegramWebhook(request);
  };
  assert.equal((await send("wrong")).status, 403);
  assert.equal(state.messages.length, 0);
  state.channel.isActive = false;
  assert.equal((await send("verify-secret-12345")).status, 204);
  assert.equal(state.messages.length, 0);
  state.channel.isActive = true;
  await send("verify-secret-12345");
  await send("verify-secret-12345");
  assert.equal(state.messages.length, 1);
});

test("inbox is scoped to the active workspace and contact ACL; viewers cannot send or configure channels", async () => {
  state.member.role = "MEMBER";
  const where = await conversationAccessWhere(state.member);
  assert.equal(where.channel.workspaceId, "workspace-1");
  assert.ok(where.OR.some((condition) => condition.contactId === null));
  state.member.role = "VIEWER";
  assert.equal(
    (
      await sendMessage(
        jsonRequest("/api/messaging/conversations/conversation-1/messages", { content: "Blocked" }),
        context,
      )
    ).status,
    403,
  );
  assert.equal((await getChannels()).status, 403);
  globalThis.telephonyTestActor = null;
  assert.equal((await getConversations(new Request(`${origin}/api/messaging/conversations`))).status, 401);
  assert.equal(
    (
      await mediaRoute(new Request(`${origin}/api/messaging/messages/m/media`), {
        params: Promise.resolve({ id: "m" }),
      })
    ).status,
    401,
  );
});

test("outbound sending is idempotent, enforces the WhatsApp window and allows approved templates", async () => {
  const requestId = "00000000-0000-4000-8000-000000000001";
  const body = { content: "Reply", requestId };
  assert.equal(
    (await sendMessage(jsonRequest("/api/messaging/conversations/conversation-1/messages", body), context)).status,
    201,
  );
  await sendMessage(jsonRequest("/api/messaging/conversations/conversation-1/messages", body), context);
  assert.equal(state.requests.length, 1);
  assert.equal(state.messages.length, 1);
  mock.method(prisma.messagingMessage, "findFirst", async () => ({ sentAt: new Date(0) }));
  assert.equal(
    (
      await sendMessage(
        jsonRequest("/api/messaging/conversations/conversation-1/messages", { content: "Outside window" }),
        context,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await sendMessage(
        jsonRequest("/api/messaging/conversations/conversation-1/messages", {
          template: { name: "follow_up", params: ["Demo"] },
        }),
        context,
      )
    ).status,
    201,
  );
  assert.equal(state.requests.at(-1).body.type, "template");
  assert.equal(state.requests.at(-1).body.template.components[0].parameters[0].text, "Demo");
});

test("channel APIs never return secrets and reject cross-workspace bot takeover before setWebhook", async () => {
  const list = JSON.stringify(await (await getChannels()).json());
  assert.ok(!list.includes("accessToken"));
  assert.ok(!list.includes("webhookSecret"));
  mock.method(globalThis, "fetch", async (url) => {
    state.requests.push(String(url));
    return Response.json({ ok: true, result: { id: 12345, is_bot: true, username: "demo_bot" } });
  });
  mock.method(prisma.messagingChannel, "findUnique", async () => ({ ...state.channel, workspaceId: "workspace-2" }));
  const result = await connectChannel(
    jsonRequest("/api/messaging/channels", {
      platform: "TELEGRAM",
      channelName: "Demo",
      botToken: `12345:${"a".repeat(30)}`,
    }),
  );
  assert.equal(result.status, 409);
  assert.equal(state.requests.length, 1);
  assert.ok(state.requests[0].endsWith("/getMe"));
});

test("read markers count only displayed inbound messages and delivery callbacks cannot regress READ", async () => {
  state.messages = [
    { id: "visible", direction: "INBOUND", readAt: null },
    { id: "new-arrival", direction: "INBOUND", readAt: null },
  ];
  mock.method(prisma.messagingMessage, "updateMany", async ({ where, data }) => {
    if (where.id)
      for (const message of state.messages) if (where.id.in.includes(message.id)) Object.assign(message, data);
    return { count: 1 };
  });
  mock.method(prisma.messagingMessage, "count", async () => state.messages.filter((message) => !message.readAt).length);
  const request = jsonRequest("/api/messaging/conversations/conversation-1", { readIds: ["visible"] });
  assert.equal((await patchConversation(request, context)).status, 200);
  assert.equal(state.conversation.unreadCount, 1);
  assert.equal(state.messages[1].readAt, null);
  const update = mock.method(prisma.messagingMessage, "updateMany", async () => ({ count: 0 }));
  await whatsappWebhook(
    signedWhatsApp(
      whatsappPayload([
        {
          metadata: { phone_number_id: "99999" },
          statuses: [{ id: "out", status: "delivered", timestamp: "1700000000" }],
        },
      ]),
    ),
  );
  const where = update.mock.calls[0].arguments[0].where;
  assert.ok(!where.status.in.includes("READ"));
  assert.equal(where.conversation.channelId, state.channel.id);
});
