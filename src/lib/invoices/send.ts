import "server-only";
import type { WorkspaceMember } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { canAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { assertVersion, DocumentError, documentScope } from "@/lib/quotations/access";
import { renderDocumentPdf } from "@/lib/quotations/pdf";
import type { DocumentRow } from "@/lib/validations/quotation";

import { invoiceSelect } from "./access";
import { invoiceBalance } from "./money";

export const invoiceTransport = { sendEmail, renderDocumentPdf };
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
export async function sendInvoice(
  member: WorkspaceMember,
  id: string,
  input: { updatedAt: string; accountId: string },
) {
  const where = { ...(await documentScope(member, true)), id, deletedAt: null };
  const invoice = await prisma.invoice.findFirst({ where, select: invoiceSelect });
  if (!invoice) throw new DocumentError("Invoice not found.", 404);
  if (["CANCELLED", "REFUNDED"].includes(invoice.status))
    throw new DocumentError("Cancelled/refunded invoices cannot be sent.", 409);
  if (invoice.sendState === "SENT") return invoice;
  assertVersion(invoice, input.updatedAt);
  if (invoice.sendState !== "IDLE")
    throw new DocumentError("Email is being sent or its outcome is uncertain. Check Sent before retrying.", 409);
  if (!invoice.contactId || !invoice.clientEmail)
    throw new DocumentError("Choose a contact with an email address before sending.");
  if (
    !(await canAccess(member.userId, "Contact", invoice.contactId, "EDIT", member.workspaceId)) ||
    (invoice.dealId && !(await canAccess(member.userId, "Deal", invoice.dealId, "EDIT", member.workspaceId)))
  )
    throw new DocumentError("Edit access to the recipient and related deal is required.", 403);
  const contact = await prisma.contact.findFirst({
    where: { id: invoice.contactId, workspaceId: member.workspaceId, status: { not: "ARCHIVED" } },
    select: { email: true },
  });
  if (!contact?.email || contact.email.toLowerCase() !== invoice.clientEmail.toLowerCase())
    throw new DocumentError("Client email changed. Review the client before sending.", 409);
  const account = await prisma.emailAccount.findFirst({
    where: { id: input.accountId, userId: member.userId, workspaceId: member.workspaceId },
    select: { id: true },
  });
  if (!account) throw new DocumentError("Connect your own email account in this workspace.");
  const dto = JSON.parse(JSON.stringify(invoice)) as DocumentRow;
  const pdf = await invoiceTransport.renderDocumentPdf(dto, "Invoice");
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: {
        ...where,
        updatedAt: new Date(input.updatedAt),
        sendState: "IDLE",
        status: invoice.status,
        amountPaid: invoice.amountPaid,
      },
      data: { sendState: "SENDING" },
    });
    await createAuditLog(
      {
        action: "UPDATE",
        entityType: "Invoice",
        entityId: id,
        entityName: invoice.number,
        changes: { sendState: { old: "IDLE", new: "SENDING" } },
        userId: member.userId,
        workspaceId: member.workspaceId,
      },
      tx,
    );
  });
  try {
    const message = await invoiceTransport.sendEmail({
      accountId: input.accountId,
      userId: member.userId,
      workspaceId: member.workspaceId,
      to: [invoice.clientEmail],
      subject: `Invoice ${invoice.number}`,
      bodyHtml: `<p>Hello ${escapeHtml(invoice.clientName)},</p><p>Please find invoice <strong>${escapeHtml(invoice.number)}</strong> attached.</p><p>Total: ${escapeHtml(dto.grandTotal)} ${escapeHtml(invoice.currency)} | Balance: ${escapeHtml(invoiceBalance(dto))} ${escapeHtml(invoice.currency)}${invoice.dueDate ? ` | Due: ${invoice.dueDate.toISOString().slice(0, 10)}` : ""}</p><p>${escapeHtml(invoice.issuerName)}</p>`,
      contactId: invoice.contactId,
      dealId: invoice.dealId ?? undefined,
      trackingEnabled: false,
      attachments: [{ filename: `${invoice.number}.pdf`, contentType: "application/pdf", content: pdf }],
    });
    let status: "SENT" | "PARTIALLY_PAID" | "PAID" = "SENT";
    if (invoice.amountPaid.greaterThan(0)) status = "PARTIALLY_PAID";
    if (invoice.amountPaid.greaterThanOrEqualTo(invoice.grandTotal) && !invoice.grandTotal.isZero()) status = "PAID";
    return await prisma.$transaction(async (tx) => {
      const saved = await tx.invoice.update({
        where: { id, workspaceId: member.workspaceId, sendState: "SENDING" },
        data: { status, sendState: "SENT", sentAt: message.sentAt ?? new Date(), emailMessageId: message.id },
        select: invoiceSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Invoice",
          entityId: id,
          entityName: invoice.number,
          changes: { status: { old: invoice.status, new: status } },
          userId: member.userId,
          workspaceId: member.workspaceId,
        },
        tx,
      );
      return saved;
    });
  } catch {
    // A provider timeout may mean delivery succeeded. Never automatically repeat an uncertain send.
    await prisma.invoice.updateMany({
      where: { id, workspaceId: member.workspaceId, sendState: "SENDING" },
      data: { sendState: "UNCERTAIN" },
    });
    throw new DocumentError(
      "Delivery could not be confirmed. Check your email account’s Sent folder; automatic retries are blocked.",
      502,
    );
  }
}
