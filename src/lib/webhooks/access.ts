import "server-only";

import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import type prisma from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export type WebhookDb = Pick<typeof prisma, "webhook" | "webhookDelivery">;
export const webhookHeaders = { "Cache-Control": "private, no-store" };
export const webhookSelect = {
  id: true,
  name: true,
  url: true,
  events: true,
  isActive: true,
  failCount: true,
  lastTriggeredAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebhookSelect;
export async function webhookActor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401, headers: webhookHeaders }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member)
    return { error: Response.json({ error: "Select a workspace." }, { status: 409, headers: webhookHeaders }) };
  if (!["OWNER", "ADMIN"].includes(member.role))
    return {
      error: Response.json({ error: "Workspace administrator required." }, { status: 403, headers: webhookHeaders }),
    };
  return { member };
}
export async function readWebhookConfigBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > 65536) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
export function webhookApiFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2025")
    return Response.json(
      { error: "Webhook changed or was deleted. Refresh before saving." },
      { status: 409, headers: webhookHeaders },
    );
  console.error("Webhook configuration operation failed", code ?? "unexpected");
  return Response.json({ error: "Unable to save webhook configuration." }, { status: 500, headers: webhookHeaders });
}
