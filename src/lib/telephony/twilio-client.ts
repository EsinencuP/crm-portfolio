import "server-only";

import Twilio from "twilio";

import { normalizePhoneNumber } from "@/lib/telephony/call-types";

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = normalizePhoneNumber(process.env.TWILIO_PHONE_NUMBER ?? "");
  const agentNumber = normalizePhoneNumber(process.env.TWILIO_AGENT_PHONE_NUMBER ?? "");
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.trim() || process.env.NEXTAUTH_URL;
  if (!accountSid || !/^AC[0-9a-f]{32}$/i.test(accountSid) || !authToken || !fromNumber || !agentNumber || !base)
    throw new Error("Twilio is not configured. Set credentials, caller ID, agent phone and public webhook origin.");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Twilio webhook origin must be a public HTTPS origin.");
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Twilio webhook origin must be publicly reachable.");
  return { accountSid, authToken, fromNumber, agentNumber, origin: url.origin };
}

let cached: { accountSid: string; authToken: string; client: ReturnType<typeof Twilio> } | undefined;
export function getTwilioClient() {
  const { accountSid, authToken } = getTwilioConfig();
  if (!cached || cached.accountSid !== accountSid || cached.authToken !== authToken)
    cached = { accountSid, authToken, client: Twilio(accountSid, authToken, { timeout: 15_000, autoRetry: false }) };
  return cached.client;
}

export function twilioWebhookUrl(path: "voice" | "status", callId: string, leg?: string) {
  const url = new URL(`/api/webhooks/twilio/${path}`, getTwilioConfig().origin);
  url.searchParams.set("callId", callId);
  if (leg) url.searchParams.set("leg", leg);
  return url.toString();
}

// Ring the operator first. The voice webhook then dials the saved contact number.
export async function initiateCall(from: string, to: string, callId: string) {
  const config = getTwilioConfig();
  if (from !== config.fromNumber || !normalizePhoneNumber(to)) throw new Error("Invalid call numbers.");
  if ([config.fromNumber, config.agentNumber].includes(to))
    throw new Error("Contact number must differ from bridge numbers.");
  return getTwilioClient().calls.create({
    to: config.agentNumber,
    from: config.fromNumber,
    url: twilioWebhookUrl("voice", callId),
    method: "POST",
    statusCallback: twilioWebhookUrl("status", callId, "agent"),
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    timeout: 30,
  });
}

export async function getRecording(callSid: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(callSid)) throw new Error("Invalid call SID.");
  const recordings = await getTwilioClient().calls(callSid).recordings.list({ limit: 1 });
  const recording = recordings.find((item) => item.status === "completed");
  return recording ? recordingMediaUrl(recording.sid) : null;
}

export function recordingMediaUrl(recordingSid: string) {
  if (!/^RE[0-9a-f]{32}$/i.test(recordingSid)) throw new Error("Invalid recording SID.");
  return `https://api.twilio.com/2010-04-01/Accounts/${getTwilioConfig().accountSid}/Recordings/${recordingSid}.mp3`;
}

export async function readTwilioWebhook(request: Request) {
  const config = getTwilioConfig();
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") return null;
  const body = await request.text();
  if (body.length > 16_384) return null;
  const fields = Object.fromEntries(new URLSearchParams(body));
  const signature = request.headers.get("x-twilio-signature");
  const incoming = new URL(request.url);
  const publicUrl = `${config.origin}${incoming.pathname}${incoming.search}`;
  if (
    !signature ||
    fields.AccountSid !== config.accountSid ||
    !Twilio.validateRequest(config.authToken, signature, publicUrl, fields)
  )
    return null;
  return fields;
}
