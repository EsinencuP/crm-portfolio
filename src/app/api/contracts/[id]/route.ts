import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { contractSelect, validateContractReferences } from "@/lib/contracts/access";
import prisma from "@/lib/prisma";
import {
  assertVersion,
  canWriteDocument,
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  readDocumentBody,
} from "@/lib/quotations/access";
import { contractStateSchema, editContractSchema, nextContractState } from "@/lib/validations/contract";
import { versionSchema } from "@/lib/validations/quotation";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, context: Context) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await context.params;
    const row = await prisma.contract.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: { ...contractSelect, ownerId: true },
    });
    if (!row) throw new DocumentError("Contract not found.", 404);
    const { ownerId, ...saved } = row;
    return Response.json({ ...saved, canWrite: canWriteDocument(actor.member, ownerId) }, { headers: documentHeaders });
  } catch (error) {
    return documentError(error);
  }
}
async function mutate(request: Request, context: Context, remove: boolean) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const { id } = await context.params,
      raw = await readDocumentBody(request);
    const isState =
      !remove &&
      raw !== null &&
      typeof raw === "object" &&
      ["status", "signedByClient", "signedByUs"].some((k) => k in raw);
    let input: { updatedAt: string };
    if (remove) input = versionSchema.parse(raw);
    else if (isState) input = contractStateSchema.parse(raw);
    else input = editContractSchema.parse(raw);
    const scope = await documentScope(actor.member, true);
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.contract.findFirst({ where: { ...scope, id, deletedAt: null }, select: contractSelect });
      if (!row) throw new DocumentError("Contract not found.", 404);
      assertVersion(row, input.updatedAt);
      let data: Prisma.ContractUncheckedUpdateInput;
      if (remove) {
        if (row.status !== "DRAFT")
          throw new DocumentError("Only drafts can be deleted. Cancel issued contracts instead.", 409);
        data = { deletedAt: new Date() };
      } else if (isState) {
        try {
          data = nextContractState(row, contractStateSchema.parse(raw));
        } catch (error) {
          throw new DocumentError(error instanceof Error ? error.message : "Invalid status change.", 409);
        }
      } else {
        if (!["DRAFT", "PENDING_REVIEW"].includes(row.status))
          throw new DocumentError("Issued contract content is locked.", 409);
        const { updatedAt: _, startDate, endDate, ...fields } = editContractSchema.parse(raw);
        await validateContractReferences({ ...fields, startDate, endDate }, actor.member, tx);
        data = {
          ...fields,
          startDate: startDate ? new Date(`${startDate}T00:00:00Z`) : null,
          endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
        };
      }
      // Version compare-and-swap prevents parallel status, text and signature updates from overwriting one another.
      const saved = await tx.contract.update({
        where: { ...scope, id, deletedAt: null, updatedAt: row.updatedAt },
        data,
        select: contractSelect,
      });
      await createAuditLog(
        {
          action: remove ? "DELETE" : "UPDATE",
          entityType: "Contract",
          entityId: id,
          entityName: saved.title,
          workspaceId: actor.member.workspaceId,
          userId: actor.member.userId,
          changes: {
            status: { old: row.status, new: saved.status },
            signedByClient: { old: row.signedByClient, new: saved.signedByClient },
            signedByUs: { old: row.signedByUs, new: saved.signedByUs },
            contentChanged: { old: false, new: row.content !== saved.content },
          },
        },
        tx,
      );
      return saved;
    });
    return Response.json(remove ? { success: true } : { ...result, canWrite: true }, { headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues[0]?.message ?? "Check contract details." },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
export const PATCH = (request: Request, context: Context) => mutate(request, context, false);
export const DELETE = (request: Request, context: Context) => mutate(request, context, true);
