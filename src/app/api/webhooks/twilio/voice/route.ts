import Twilio from "twilio";

import prisma from "@/lib/prisma";
import { getTwilioConfig, readTwilioWebhook, twilioWebhookUrl } from "@/lib/telephony/twilio-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let fields: Awaited<ReturnType<typeof readTwilioWebhook>>;
  try {
    fields = await readTwilioWebhook(request);
  } catch {
    return new Response("Calling is not configured.", { status: 503 });
  }
  if (!fields) return new Response("Invalid Twilio signature.", { status: 403 });
  const callId = new URL(request.url).searchParams.get("callId");
  if (!callId || !/^CA[0-9a-f]{32}$/i.test(fields.CallSid ?? "")) return new Response("Invalid call.", { status: 400 });
  const config = getTwilioConfig();
  if (fields.From !== config.fromNumber || fields.To !== config.agentNumber)
    return new Response("Invalid bridge.", { status: 403 });
  const call = await prisma.phoneCall.findFirst({
    where: {
      id: callId,
      provider: "twilio",
      direction: "OUTBOUND",
      status: { in: ["RINGING", "IN_PROGRESS"] },
      OR: [{ externalId: null }, { externalId: fields.CallSid }],
    },
  });
  if (!call) return new Response("Call not found.", { status: 404 });
  const bound = await prisma.phoneCall.updateMany({
    where: {
      id: call.id,
      status: { in: ["RINGING", "IN_PROGRESS"] },
      OR: [{ externalId: null }, { externalId: fields.CallSid }],
    },
    data: { externalId: fields.CallSid, dialStarted: true },
  });
  if (!bound.count) return new Response("Call has ended.", { status: 409 });
  const response = new Twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: call.fromNumber,
    answerOnBridge: true,
    timeout: 30,
    action: twilioWebhookUrl("status", call.id, "dial"),
    method: "POST",
    record: "record-from-answer-dual",
    recordingStatusCallback: twilioWebhookUrl("status", call.id, "recording"),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed"],
  });
  dial.number(
    {
      statusCallback: twilioWebhookUrl("status", call.id, "contact"),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    call.toNumber,
  );
  return new Response(response.toString(), { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
