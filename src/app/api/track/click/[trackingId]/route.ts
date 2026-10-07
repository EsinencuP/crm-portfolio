import { NextResponse } from "next/server";

import { verifyClick } from "@/lib/email/tracking";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const query = new URL(request.url).searchParams;
  const destination = query.get("url") ?? "";
  const signature = query.get("sig") ?? "";
  let valid = false;
  try {
    valid = verifyClick(trackingId, destination, signature);
  } catch {
    return Response.json(
      { error: "Tracking is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!valid)
    return Response.json({ error: "Invalid tracked link" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const message = await prisma.emailMessage.findUnique({
      where: { trackingId },
      select: { id: true, subject: true, workspaceId: true, account: { select: { userId: true } } },
    });
    if (!message)
      return Response.json({ error: "Link not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const first = await prisma.emailMessage.updateMany({
      where: { id: message.id, trackingId, clickedAt: null },
      data: { clickedAt: new Date(), clickCount: { increment: 1 } },
    });
    if (!first.count)
      await prisma.emailMessage.update({ where: { id: message.id }, data: { clickCount: { increment: 1 } } });
    if (first.count) {
      try {
        await createNotification({
          type: "EMAIL_CLICKED",
          title: "Email link clicked",
          body: message.subject,
          link: `/dashboard/mail?folder=sent&messageId=${encodeURIComponent(message.id)}`,
          userId: message.account.userId,
          workspaceId: message.workspaceId,
        });
      } catch {
        // Notification delivery is best effort; preserve a valid link redirect.
      }
    }
    const response = NextResponse.redirect(destination, 302);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch {
    return Response.json(
      { error: "Tracked link is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
