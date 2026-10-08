import prisma from "@/lib/prisma";
import { webhookActor, webhookHeaders } from "@/lib/webhooks/access";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const endpoint = await prisma.webhook.findFirst({
    where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!endpoint) return Response.json({ error: "Webhook not found." }, { status: 404, headers: webhookHeaders });
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  const deliveryId = query.get("deliveryId");
  if (deliveryId && deliveryId.length > 128)
    return Response.json({ error: "Invalid delivery ID." }, { status: 400, headers: webhookHeaders });
  const where = { webhookId: id, ...(deliveryId ? { id: deliveryId } : {}) };
  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      select: {
        id: true,
        event: true,
        payload: true,
        status: true,
        attempts: true,
        nextRetryAt: true,
        responseCode: true,
        responseBody: true,
        duration: true,
        error: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.webhookDelivery.count({ where }),
  ]);
  return Response.json({ deliveries, total, page }, { headers: webhookHeaders });
}
