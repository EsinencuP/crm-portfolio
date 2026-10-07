import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { callAccessWhere } from "@/lib/telephony/call-access";
import { getTwilioConfig, recordingMediaUrl } from "@/lib/telephony/twilio-client";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return new Response("Select a workspace first.", { status: 409, headers });
  const call = await prisma.phoneCall.findFirst({
    where: { AND: [{ id: (await params).id }, await callAccessWhere(member)] },
  });
  if (!call?.recordingUrl) return new Response("Recording not found.", { status: 404, headers });
  try {
    const match = /\/(RE[0-9a-f]{32})\.mp3$/i.exec(call.recordingUrl);
    const recordingSid = match === null ? null : match[1];
    if (!recordingSid || recordingMediaUrl(recordingSid) !== call.recordingUrl)
      return new Response("Invalid recording.", { status: 404, headers });
    const { accountSid, authToken } = getTwilioConfig();
    const upstreamHeaders: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    };
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.Range = range;
    const upstream = await fetch(call.recordingUrl, {
      headers: upstreamHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) return new Response("Recording unavailable.", { status: 502, headers });
    const responseHeaders = new Headers({
      ...headers,
      "Content-Type": "audio/mpeg",
      "X-Content-Type-Options": "nosniff",
    });
    for (const header of ["content-length", "content-range", "accept-ranges"])
      if (upstream.headers.has(header)) responseHeaders.set(header, upstream.headers.get(header) ?? "");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("Recording unavailable.", { status: 502, headers });
  }
}
