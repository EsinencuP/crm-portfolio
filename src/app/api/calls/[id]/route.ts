import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { callAccessWhere, canEditCall } from "@/lib/telephony/call-access";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
const changes = z.strictObject({ notes: z.string().trim().max(10_000).nullable() });

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Select a workspace first." }, { status: 409, headers });
  const call = await prisma.phoneCall.findFirst({
    where: { AND: [{ id: (await params).id }, await callAccessWhere(member)] },
    include: { user: { select: { id: true, name: true } } },
  });
  return call
    ? Response.json(call, { headers })
    : Response.json({ error: "Call not found." }, { status: 404, headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Select a workspace first." }, { status: 409, headers });
  const parsed = changes.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Notes must be at most 10,000 characters." }, { status: 400, headers });
  const call = await prisma.phoneCall.findFirst({
    where: { AND: [{ id: (await params).id }, await callAccessWhere(member)] },
  });
  if (!call) return Response.json({ error: "Call not found." }, { status: 404, headers });
  if (!(await canEditCall(member, call)))
    return Response.json({ error: "Edit access required." }, { status: 403, headers });
  const notes = parsed.data.notes || null;
  const saved = await prisma.$transaction(async (tx) => {
    const previous = await tx.phoneCall.findUniqueOrThrow({ where: { id: call.id } });
    const updated = await tx.phoneCall.update({
      where: { id: call.id, workspaceId: member.workspaceId },
      data: { notes },
    });
    if (previous.notes !== notes)
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "PhoneCall",
          entityId: call.id,
          entityName: `Call to ${call.toNumber}`,
          changes: { notes: { old: previous.notes, new: notes } },
          userId: user.id,
          workspaceId: member.workspaceId,
        },
        tx,
      );
    return updated;
  });
  return Response.json(saved, { headers });
}
