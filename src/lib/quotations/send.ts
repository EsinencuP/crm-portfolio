import "server-only";

import type { WorkspaceMember } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { canAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import type { DocumentRow } from "@/lib/validations/quotation";

import { assertUnexpired, assertVersion, DocumentError, documentScope, quotationSelect } from "./access";
import { renderDocumentPdf } from "./pdf";

export const quotationTransport = { sendEmail, renderDocumentPdf };
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
export async function sendQuotation(
  member: WorkspaceMember,
  id: string,
  input: { updatedAt: string; accountId: string },
) {
  const where = { ...(await documentScope(member, true)), id, deletedAt: null };
  const quote = await prisma.quotation.findFirst({ where, select: quotationSelect });
  if (!quote) throw new DocumentError("Quotation not found.", 404);
  if (quote.sendState === "SENT") return quote;
  assertVersion(quote, input.updatedAt);
  assertUnexpired(quote);
  if (quote.status !== "DRAFT" || quote.sendState !== "IDLE")
    throw new DocumentError(
      "Email is already being sent or its outcome is uncertain. Check Sent before retrying.",
      409,
    );
  if (!quote.contactId || !quote.clientEmail)
    throw new DocumentError("Choose a contact with an email address before sending.");
  if (
    !(await canAccess(member.userId, "Contact", quote.contactId, "EDIT", member.workspaceId)) ||
    (quote.dealId && !(await canAccess(member.userId, "Deal", quote.dealId, "EDIT", member.workspaceId)))
  )
    throw new DocumentError("Edit access to the recipient and related deal is required.", 403);
  const contact = await prisma.contact.findFirst({
    where: { id: quote.contactId, workspaceId: member.workspaceId, status: { not: "ARCHIVED" } },
    select: { email: true },
  });
  if (!contact?.email || contact.email.toLowerCase() !== quote.clientEmail.toLowerCase())
    throw new DocumentError("Client email changed. Edit the draft and select the client again.", 409);
  const account = await prisma.emailAccount.findFirst({
    where: { id: input.accountId, userId: member.userId, workspaceId: member.workspaceId },
    select: { id: true },
  });
  if (!account) throw new DocumentError("Connect your own email account in this workspace.");
  const dto = JSON.parse(JSON.stringify(quote)) as DocumentRow;
  const pdf = await quotationTransport.renderDocumentPdf(dto);
  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { ...where, updatedAt: new Date(input.updatedAt), status: "DRAFT", sendState: "IDLE" },
      data: { sendState: "SENDING" },
    });
    await createAuditLog(
      {
        action: "UPDATE",
        entityType: "Quotation",
        entityId: id,
        entityName: quote.number,
        changes: { sendState: { old: "IDLE", new: "SENDING" } },
        userId: member.userId,
        workspaceId: member.workspaceId,
      },
      tx,
    );
  });
  try {
    const message = await quotationTransport.sendEmail({
      accountId: input.accountId,
      userId: member.userId,
      workspaceId: member.workspaceId,
      to: [quote.clientEmail],
      subject: `Quotation ${quote.number}`,
      bodyHtml: `<p>Hello ${escapeHtml(quote.clientName)},</p><p>Please find quotation <strong>${escapeHtml(quote.number)}</strong> attached.</p><p>Total: ${escapeHtml(dto.grandTotal)} ${escapeHtml(quote.currency)}${quote.expiryDate ? ` | Valid through ${quote.expiryDate.toISOString().slice(0, 10)}` : ""}</p><p>${escapeHtml(quote.issuerName)}</p>`,
      contactId: quote.contactId,
      dealId: quote.dealId ?? undefined,
      trackingEnabled: false,
      attachments: [{ filename: `${quote.number}.pdf`, contentType: "application/pdf", content: pdf }],
    });
    return await prisma.$transaction(async (tx) => {
      const saved = await tx.quotation.update({
        where: { id, workspaceId: member.workspaceId, sendState: "SENDING" },
        data: { status: "SENT", sendState: "SENT", sentAt: message.sentAt ?? new Date(), emailMessageId: message.id },
        select: quotationSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Quotation",
          entityId: id,
          entityName: quote.number,
          changes: { status: { old: quote.status, new: "SENT" } },
          userId: member.userId,
          workspaceId: member.workspaceId,
        },
        tx,
      );
      return saved;
    });
  } catch {
    // Provider timeout/crash can mean delivery occurred. Never automatically replay this side effect.
    await prisma.quotation.updateMany({
      where: { id, workspaceId: member.workspaceId, sendState: "SENDING" },
      data: { sendState: "UNCERTAIN" },
    });
    throw new DocumentError(
      "Delivery could not be confirmed. Check your email account’s Sent folder; automatic retries are blocked.",
      502,
    );
  }
}
