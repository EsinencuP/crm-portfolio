import { createNotification } from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { mapTwilioStatus } from "@/lib/telephony/call-types";
import { getRecording, readTwilioWebhook, recordingMediaUrl } from "@/lib/telephony/twilio-client";

export const runtime = "nodejs";
const sidPattern = /^CA[0-9a-f]{32}$/i;

function acknowledged(leg: string) {
  if (leg === "dial")
    return new Response("<Response><Hangup/></Response>", {
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
    });
  return new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  let fields: Awaited<ReturnType<typeof readTwilioWebhook>>;
  try {
    fields = await readTwilioWebhook(request);
  } catch {
    return new Response("Calling is not configured.", { status: 503 });
  }
  if (!fields) return new Response("Invalid Twilio signature.", { status: 403 });
  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  const leg = url.searchParams.get("leg") ?? "agent";
  if (!callId || !sidPattern.test(fields.CallSid ?? "") || !["agent", "contact", "dial", "recording"].includes(leg))
    return new Response("Invalid callback.", { status: 400 });
  const call = await prisma.phoneCall.findFirst({ where: { id: callId, provider: "twilio" } });
  if (!call) return new Response("Call not found.", { status: 404 });

  if (leg === "recording") {
    if (fields.CallSid !== call.externalId && fields.CallSid !== call.dialExternalId)
      return new Response("Call SID does not match.", { status: 403 });
    if (fields.RecordingStatus !== "completed") return acknowledged(leg);
    if (!/^RE[0-9a-f]{32}$/i.test(fields.RecordingSid ?? ""))
      return new Response("Invalid recording.", { status: 400 });
    await prisma.phoneCall.update({
      where: { id: call.id },
      data: { recordingUrl: recordingMediaUrl(fields.RecordingSid) },
    });
    return acknowledged(leg);
  }

  if (leg === "contact") {
    if (
      !call.dialStarted ||
      !call.externalId ||
      fields.ParentCallSid !== call.externalId ||
      (call.dialExternalId && fields.CallSid !== call.dialExternalId)
    )
      return new Response("Call SID does not match.", { status: 403 });
    await prisma.phoneCall.updateMany({
      where: { id: call.id, dialExternalId: null },
      data: { dialExternalId: fields.CallSid },
    });
  } else {
    if (call.externalId && fields.CallSid !== call.externalId)
      return new Response("Call SID does not match.", { status: 403 });
    if (leg === "agent") {
      await prisma.phoneCall.updateMany({
        where: { id: call.id, externalId: null },
        data: { externalId: fields.CallSid },
      });
      // The operator leg completing must never replace the contact's MISSED/FAILED result.
      if (call.dialStarted) return acknowledged(leg);
    } else if (
      !call.dialStarted ||
      !call.externalId ||
      fields.CallSid !== call.externalId ||
      (fields.DialCallSid &&
        (!sidPattern.test(fields.DialCallSid) || (call.dialExternalId && fields.DialCallSid !== call.dialExternalId)))
    ) {
      return new Response("Call SID does not match.", { status: 403 });
    }
    if (leg === "dial" && fields.DialCallSid)
      await prisma.phoneCall.updateMany({
        where: { id: call.id, dialExternalId: null },
        data: { dialExternalId: fields.DialCallSid },
      });
  }

  let status = mapTwilioStatus(leg === "dial" ? fields.DialCallStatus : fields.CallStatus);
  if (!status) return new Response("Unknown call status.", { status: 400 });
  if (leg === "agent" && status === "IN_PROGRESS") return acknowledged(leg);
  if (leg === "agent" && status === "COMPLETED") status = "FAILED";
  const rawDuration = leg === "dial" ? fields.DialCallDuration : fields.CallDuration;
  if (rawDuration !== undefined && !/^\d{1,7}$/.test(rawDuration))
    return new Response("Invalid duration.", { status: 400 });
  const duration = rawDuration === undefined ? undefined : Number(rawDuration);
  const nextStatus = status;

  // Status and notification commit together. Only one terminal transition can win;
  // retries and late ringing/answered events cannot regress a finished call.
  const transitioned = await prisma.$transaction(async (tx) => {
    const changed = await tx.phoneCall.updateMany({
      where: {
        id: call.id,
        status: { in: nextStatus === "RINGING" ? ["RINGING"] : ["RINGING", "IN_PROGRESS"] },
        ...(leg === "agent" && { dialStarted: false }),
      },
      data: { status: nextStatus, ...(nextStatus === "COMPLETED" && duration !== undefined && { duration }) },
    });
    if (!changed.count || nextStatus !== "MISSED") return Boolean(changed.count);
    const member = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: call.userId, workspaceId: call.workspaceId } },
      select: { id: true },
    });
    if (!member) return true;
    await createNotification(
      {
        type: "TASK_ASSIGNED",
        title: "Call was not answered",
        body:
          leg === "agent"
            ? "The operator did not answer. The contact was not dialed."
            : `No answer from ${call.toNumber}.`,
        userId: call.userId,
        workspaceId: call.workspaceId,
        link: call.contactId ? `/dashboard/contacts/${encodeURIComponent(call.contactId)}` : "/dashboard/notifications",
        metadata: { entityType: "PhoneCall", entityId: call.id, leg },
      },
      tx,
    );
    return true;
  });

  if (nextStatus === "COMPLETED" && duration !== undefined) {
    await prisma.phoneCall.updateMany({
      where: { id: call.id, status: "COMPLETED", duration: null },
      data: { duration },
    });
  }
  if (transitioned && nextStatus === "COMPLETED" && call.externalId && !call.recordingUrl) {
    try {
      const recordingUrl = await getRecording(call.externalId);
      if (recordingUrl)
        await prisma.phoneCall.updateMany({ where: { id: call.id, recordingUrl: null }, data: { recordingUrl } });
    } catch {
      // A recording can be unavailable at hangup. Its signed callback saves it later.
      console.warn("Twilio recording is not ready for call", call.id);
    }
  }
  return acknowledged(leg);
}
