import "server-only";
import type { Prisma, WorkspaceMember } from "@prisma/client";

import { canAccess } from "@/lib/permissions";
import type { prisma } from "@/lib/prisma";
import { DocumentError } from "@/lib/quotations/access";
import type { ContractInput } from "@/lib/validations/contract";
export const contractSelect = {
  id: true,
  title: true,
  number: true,
  status: true,
  startDate: true,
  endDate: true,
  value: true,
  currency: true,
  content: true,
  documentUrl: true,
  signedByClient: true,
  signedByUs: true,
  contactId: true,
  companyId: true,
  dealId: true,
  contact: { select: { firstName: true, lastName: true } },
  company: { select: { name: true } },
  deal: { select: { title: true } },
  updatedAt: true,
} satisfies Prisma.ContractSelect;
export async function validateContractReferences(
  input: ContractInput,
  member: WorkspaceMember,
  tx: Pick<typeof prisma, "contact" | "company" | "deal">,
) {
  for (const [type, id] of [
    ["Contact", input.contactId],
    ["Company", input.companyId],
    ["Deal", input.dealId],
  ] as const)
    if (id && !(await canAccess(member.userId, type, id, "VIEW", member.workspaceId)))
      throw new DocumentError("Related record is not accessible.", 403);
  const contact = input.contactId
    ? await tx.contact.findFirst({
        where: { id: input.contactId, workspaceId: member.workspaceId, status: { not: "ARCHIVED" } },
        select: { companyId: true },
      })
    : null;
  const company = input.companyId
    ? await tx.company.findFirst({
        where: { id: input.companyId, workspaceId: member.workspaceId },
        select: { id: true },
      })
    : null;
  const deal = input.dealId
    ? await tx.deal.findFirst({
        where: { id: input.dealId, workspaceId: member.workspaceId },
        select: { contactId: true, companyId: true },
      })
    : null;
  if ((input.contactId && !contact) || (input.companyId && !company) || (input.dealId && !deal))
    throw new DocumentError("Related record is unavailable.");
  if (input.companyId && contact && contact.companyId !== input.companyId)
    throw new DocumentError("Contact must belong to the selected company.");
  if (
    deal &&
    ((input.contactId && deal.contactId !== input.contactId) || (input.companyId && deal.companyId !== input.companyId))
  )
    throw new DocumentError("Deal must belong to the selected client.");
}
