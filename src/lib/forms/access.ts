import "server-only";

import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import type { FormConfig } from "@/lib/forms/config";
import prisma from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const formHeaders = { "Cache-Control": "private, no-store" };
export async function formActor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401, headers: formHeaders }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return { error: Response.json({ error: "Select a workspace." }, { status: 409, headers: formHeaders }) };
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role))
    return { error: Response.json({ error: "Workspace manager required." }, { status: 403, headers: formHeaders }) };
  return { member };
}
export async function readFormBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > 65536) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
export async function validFormRouting(config: Partial<FormConfig>, workspaceId: string) {
  const [owner, stage, tags] = await Promise.all([
    config.assignToId
      ? prisma.workspaceMember.count({ where: { userId: config.assignToId, workspaceId, role: { not: "VIEWER" } } })
      : 1,
    config.pipelineStageId ? prisma.pipelineStage.count({ where: { id: config.pipelineStageId, workspaceId } }) : 1,
    config.tagIds?.length ? prisma.tag.count({ where: { id: { in: config.tagIds }, workspaceId } }) : 0,
  ]);
  return Boolean(owner && stage && tags === (config.tagIds?.length ?? 0));
}
export function configData(config: FormConfig) {
  return { ...config, fields: config.fields as Prisma.InputJsonValue, style: config.style as Prisma.InputJsonValue };
}
export function formFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2002")
    return Response.json({ error: "That public slug is already in use." }, { status: 409, headers: formHeaders });
  if (code === "P2025") return Response.json({ error: "Form not found." }, { status: 404, headers: formHeaders });
  console.error("Form operation failed", error);
  return Response.json({ error: "Unable to save the form." }, { status: 500, headers: formHeaders });
}
