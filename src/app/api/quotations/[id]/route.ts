import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import {
  assertUnexpired,
  assertVersion,
  canWriteDocument,
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  quotationSelect,
  readDocumentBody,
  validateQuotationReferences,
} from "@/lib/quotations/access";
import { calculateQuotation } from "@/lib/quotations/totals";
import { editQuotationSchema, statusQuotationSchema, versionSchema } from "@/lib/validations/quotation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await params;
    const row = await prisma.quotation.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: { ...quotationSelect, ownerId: true },
    });
    if (!row) throw new DocumentError("Quotation not found.", 404);
    const { ownerId, ...document } = row;
    return Response.json(
      { ...document, canWrite: canWriteDocument(actor.member, ownerId) },
      { headers: documentHeaders },
    );
  } catch (error) {
    return documentError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const { id } = await params,
      body = await readDocumentBody(request);
    const status = statusQuotationSchema.safeParse(body),
      edit = editQuotationSchema.safeParse(body);
    if (!status.success && !edit.success)
      return Response.json(
        {
          error: "Check quotation details and current updatedAt.",
          fieldErrors: z.flattenError(edit.error).fieldErrors,
        },
        { status: 400, headers: documentHeaders },
      );
    const scope = { ...(await documentScope(actor.member, true)), id, deletedAt: null };
    const document = await prisma.$transaction(async (tx) => {
      const previous = await tx.quotation.findFirst({ where: scope, select: quotationSelect });
      if (!previous) throw new DocumentError("Quotation not found.", 404);
      const editInput = edit.success ? edit.data : null;
      const updatedAt = status.success ? status.data.updatedAt : editInput?.updatedAt;
      if (!updatedAt) throw new DocumentError("Current updatedAt is required.");
      assertVersion(previous, updatedAt);
      if (previous.sendState === "SENDING" || previous.sendState === "UNCERTAIN")
        throw new DocumentError("Email delivery needs confirmation before further changes.", 409);
      let data: Prisma.QuotationUncheckedUpdateInput;
      if (status.success) {
        if (!["SENT", "VIEWED"].includes(previous.status))
          throw new DocumentError("Only a sent quotation can be marked accepted or declined.", 409);
        assertUnexpired(previous);
        data = { status: status.data.status };
      } else {
        if (!editInput) throw new DocumentError("Invalid quotation details.");
        if (previous.status !== "DRAFT" || previous.sendState !== "IDLE")
          throw new DocumentError("Only an unsent draft can be edited.", 409);
        const { updatedAt: _, lineItems: __, issueDate, expiryDate, ...fields } = editInput;
        const client = await validateQuotationReferences(
          editInput,
          actor.member,
          tx,
          previous.currency === editInput.currency
            ? previous.lineItems.flatMap((line) => (line.productId ? [line.productId] : []))
            : [],
        );
        let amounts: ReturnType<typeof calculateQuotation>;
        try {
          amounts = calculateQuotation(editInput.lineItems);
        } catch {
          throw new DocumentError("Amounts exceed the document limit.");
        }
        const { lineItems, ...totals } = amounts;
        data = {
          ...fields,
          ...client,
          ...totals,
          issueDate: new Date(`${issueDate}T00:00:00Z`),
          expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : null,
          lineItems: { deleteMany: {}, create: lineItems },
        };
      }
      const updated = await tx.quotation.update({
        where: {
          ...scope,
          updatedAt: new Date(updatedAt),
          status: previous.status,
          sendState: previous.sendState,
        },
        data,
        select: quotationSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Quotation",
          entityId: id,
          entityName: updated.number,
          changes: {
            status: { old: previous.status, new: updated.status },
            grandTotal: { old: previous.grandTotal, new: updated.grandTotal },
          },
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return updated;
    });
    return Response.json({ ...document, canWrite: true }, { headers: documentHeaders });
  } catch (error) {
    return documentError(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = versionSchema.parse(await readDocumentBody(request)),
      { id } = await params;
    const where = { ...(await documentScope(actor.member, true)), id, deletedAt: null };
    await prisma.$transaction(async (tx) => {
      const previous = await tx.quotation.findFirst({ where, select: quotationSelect });
      if (!previous) throw new DocumentError("Quotation not found.", 404);
      assertVersion(previous, input.updatedAt);
      if (previous.status !== "DRAFT" || previous.sendState !== "IDLE")
        throw new DocumentError("Only an unsent draft can be deleted.", 409);
      await tx.quotation.update({
        where: { ...where, updatedAt: new Date(input.updatedAt), status: "DRAFT", sendState: "IDLE" },
        data: { deletedAt: new Date() },
      });
      await createAuditLog(
        {
          action: "DELETE",
          entityType: "Quotation",
          entityId: id,
          entityName: previous.number,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
    });
    return new Response(null, { status: 204, headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Current updatedAt is required." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
