import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { readWebhookConfigBody, webhookActor, webhookHeaders } from "@/lib/webhooks/access";
import { createWebhookDelivery } from "@/lib/webhooks/dispatcher";

export const runtime = "nodejs";
const inputSchema = z.object({ requestId: z.uuid() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const input = inputSchema.safeParse(await readWebhookConfigBody(request));
  if (!input.success)
    return Response.json({ error: "Provide a UUID requestId." }, { status: 400, headers: webhookHeaders });
  const endpoint = await prisma.webhook.findFirst({
    where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
  });
  if (!endpoint) return Response.json({ error: "Webhook not found." }, { status: 404, headers: webhookHeaders });
  try {
    const deliveryId = await prisma.$transaction(async (tx) => {
      const id = await createWebhookDelivery(
        endpoint,
        "webhook.test",
        { message: "CRM webhook test", test: true },
        input.data.requestId,
        true,
        tx,
      );
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "WebhookDelivery",
          entityId: id,
          entityName: "Test delivery",
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return id;
    });
    return Response.json(
      { deliveryId, queued: true, message: "Test queued. The webhook worker will report its actual response." },
      { status: 202, headers: webhookHeaders },
    );
  } catch {
    return Response.json({ error: "Unable to queue test delivery." }, { status: 503, headers: webhookHeaders });
  }
}
