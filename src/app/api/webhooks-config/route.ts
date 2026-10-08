import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import {
  readWebhookConfigBody,
  webhookActor,
  webhookApiFailure,
  webhookHeaders,
  webhookSelect,
} from "@/lib/webhooks/access";
import { webhookCreateSchema } from "@/lib/webhooks/config";
import { outboundWebhookUrl, sealWebhookHeaders, sealWebhookSecret } from "@/lib/webhooks/security";

import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1),
  );
  const where = { workspaceId: actor.member.workspaceId, deletedAt: null };
  const [webhooks, total] = await Promise.all([
    prisma.webhook.findMany({
      where,
      select: webhookSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.webhook.count({ where }),
  ]);
  return Response.json({ webhooks, total, page }, { headers: webhookHeaders });
}
export async function POST(request: Request) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const parsed = webhookCreateSchema.safeParse(await readWebhookConfigBody(request));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid webhook configuration." },
      { status: 400, headers: webhookHeaders },
    );
  try {
    outboundWebhookUrl(parsed.data.url);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid endpoint." },
      { status: 400, headers: webhookHeaders },
    );
  }
  const plainSecret = parsed.data.secret ?? randomBytes(32).toString("hex");
  let secret: string;
  let headers: Prisma.InputJsonValue | typeof Prisma.DbNull;
  try {
    secret = sealWebhookSecret(plainSecret);
    headers = parsed.data.headers ? sealWebhookHeaders(parsed.data.headers) : Prisma.DbNull;
  } catch {
    return Response.json(
      { error: "Configure WEBHOOK_TOKEN_ENCRYPTION_KEY before creating webhooks." },
      { status: 503, headers: webhookHeaders },
    );
  }
  try {
    const webhook = await prisma.$transaction(async (tx) => {
      const created = await tx.webhook.create({
        data: { ...parsed.data, secret, headers, workspaceId: actor.member.workspaceId },
        select: webhookSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Webhook",
          entityId: created.id,
          entityName: created.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return created;
    });
    return Response.json({ webhook, signingSecret: plainSecret }, { status: 201, headers: webhookHeaders });
  } catch (error) {
    return webhookApiFailure(error);
  }
}
