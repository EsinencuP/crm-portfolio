import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchWebhooks } from "@/lib/webhooks/dispatcher";
import { triggerWorkflows } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pixel = new Uint8Array(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"));
const headers = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Content-Length": String(pixel.byteLength),
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  if (/^[a-f0-9-]{36}$/i.test(trackingId)) {
    try {
      const message = await prisma.emailMessage.findUnique({
        where: { trackingId },
        select: { id: true, subject: true, workspaceId: true, account: { select: { userId: true } } },
      });
      if (message) {
        const first = await prisma.$transaction(async (tx) => {
          const updated = await tx.emailMessage.updateMany({
            where: { id: message.id, trackingId, openedAt: null },
            data: { openedAt: new Date(), openCount: { increment: 1 } },
          });
          if (updated.count)
            await triggerWorkflows("EMAIL_OPENED", "EmailMessage", message.id, message.workspaceId, {}, tx, message.id);
          if (updated.count)
            await dispatchWebhooks(
              "email.opened",
              { id: message.id, subject: message.subject },
              message.workspaceId,
              tx,
              message.id,
            );
          return updated;
        });
        if (!first.count)
          await prisma.emailMessage.update({ where: { id: message.id }, data: { openCount: { increment: 1 } } });
        if (first.count) {
          await createNotification({
            type: "EMAIL_OPENED",
            title: "Email opened",
            body: message.subject,
            link: `/dashboard/mail?folder=sent&messageId=${encodeURIComponent(message.id)}`,
            userId: message.account.userId,
            workspaceId: message.workspaceId,
          });
        }
      }
    } catch {
      // Tracking must never prevent an email client from loading its image.
    }
  }
  return new Response(pixel, { status: 200, headers });
}
