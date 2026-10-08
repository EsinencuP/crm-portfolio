import "server-only";

import type { Prisma, WorkspaceMember } from "@prisma/client";

import { canAccess, getAccessibleEntityIds, isWorkspaceAdmin } from "@/lib/permissions";
import type { prisma } from "@/lib/prisma";
import { productActor, productHeaders } from "@/lib/products/api";
import type { QuotationInput } from "@/lib/validations/quotation";

export const documentActor = productActor;
export const documentHeaders = productHeaders;
export class DocumentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function documentError(error: unknown) {
  if (error instanceof DocumentError)
    return Response.json({ error: error.message }, { status: error.status, headers: documentHeaders });
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2025" || code === "P2002" || code === "P2034")
    return Response.json(
      { error: "Document changed or is being processed. Reload before retrying." },
      { status: 409, headers: documentHeaders },
    );
  console.error("Document operation failed", code ?? "unexpected");
  return Response.json({ error: "Unable to process the document." }, { status: 500, headers: documentHeaders });
}
export async function documentScope(member: WorkspaceMember, write = false) {
  const [contacts, companies, deals] = await Promise.all(
    ["Contact", "Company", "Deal"].map((type) => getAccessibleEntityIds(member.userId, type, member.workspaceId)),
  );
  const owner = !isWorkspaceAdmin(member.role) && (write || member.role !== "VIEWER") ? { ownerId: member.userId } : {};
  return {
    workspaceId: member.workspaceId,
    ...owner,
    AND: [
      { OR: [{ contactId: null }, { contactId: { in: contacts } }] },
      { OR: [{ companyId: null }, { companyId: { in: companies } }] },
      { OR: [{ dealId: null }, { dealId: { in: deals } }] },
    ],
  };
}
export const documentSelect = {
  id: true,
  number: true,
  status: true,
  issueDate: true,
  currency: true,
  subtotal: true,
  taxTotal: true,
  discountTotal: true,
  grandTotal: true,
  contactId: true,
  companyId: true,
  dealId: true,
  notes: true,
  terms: true,
  clientName: true,
  clientEmail: true,
  issuerName: true,
  updatedAt: true,
  lineItems: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      productId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      taxRate: true,
      total: true,
      position: true,
    },
  },
} satisfies Prisma.InvoiceSelect;
export const quotationSelect = {
  ...documentSelect,
  expiryDate: true,
  sendState: true,
  sentAt: true,
  invoices: { select: { id: true, number: true } },
} satisfies Prisma.QuotationSelect;
export type SavedQuotation = Prisma.QuotationGetPayload<{ select: typeof quotationSelect }>;
export const canWriteDocument = (member: WorkspaceMember, ownerId: string) =>
  member.role !== "VIEWER" && (isWorkspaceAdmin(member.role) || ownerId === member.userId);
export function assertVersion(document: { updatedAt: Date }, updatedAt: string) {
  if (document.updatedAt.getTime() !== new Date(updatedAt).getTime())
    throw new DocumentError("Document changed. Reload before saving.", 409);
}
export function assertUnexpired(document: { expiryDate: Date | null }) {
  if (document.expiryDate && document.expiryDate.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10))
    throw new DocumentError("This quotation has expired.", 409);
}
export async function validateQuotationReferences(
  input: QuotationInput,
  member: WorkspaceMember,
  tx: Pick<typeof prisma, "contact" | "company" | "deal" | "product">,
  existingProductIds: string[] = [],
) {
  for (const [type, id] of [
    ["Contact", input.contactId],
    ["Company", input.companyId],
    ["Deal", input.dealId],
  ] as const) {
    if (id && !(await canAccess(member.userId, type, id, "VIEW", member.workspaceId)))
      throw new DocumentError("Client or related deal is not accessible.", 403);
  }
  const contact = input.contactId
    ? await tx.contact.findFirst({
        where: { id: input.contactId, workspaceId: member.workspaceId, status: { not: "ARCHIVED" } },
        select: { firstName: true, lastName: true, email: true, companyId: true },
      })
    : null;
  const company = input.companyId
    ? await tx.company.findFirst({
        where: { id: input.companyId, workspaceId: member.workspaceId },
        select: { name: true },
      })
    : null;
  if ((input.contactId && !contact) || (input.companyId && !company))
    throw new DocumentError("Client is not available.");
  if (company && contact && contact.companyId !== input.companyId)
    throw new DocumentError("Recipient must belong to the selected company.");
  if (input.dealId) {
    const deal = await tx.deal.findFirst({
      where: { id: input.dealId, workspaceId: member.workspaceId },
      select: { contactId: true, companyId: true },
    });
    if (
      !deal ||
      (input.contactId && deal.contactId !== input.contactId) ||
      (input.companyId && deal.companyId !== input.companyId)
    )
      throw new DocumentError("Deal does not belong to the selected client.");
  }
  const productIds = [...new Set(input.lineItems.flatMap((line) => (line.productId ? [line.productId] : [])))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, workspaceId: member.workspaceId },
    select: { id: true, currency: true, isActive: true, deletedAt: true },
  });
  for (const id of productIds) {
    const product = products.find((row) => row.id === id);
    if (
      !product ||
      (!existingProductIds.includes(id) &&
        (product.currency !== input.currency || !product.isActive || product.deletedAt))
    )
      throw new DocumentError(
        "A product is unavailable or has a different currency. No automatic currency conversion is performed.",
      );
  }
  return {
    clientName: company?.name ?? `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim(),
    clientEmail: contact?.email ?? null,
  };
}
export async function readDocumentBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new DocumentError("Please send JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DocumentError("Invalid JSON body.");
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        throw new DocumentError("Document exceeds 128 KiB.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("Invalid JSON body.");
  } finally {
    reader.releaseLock();
  }
}
