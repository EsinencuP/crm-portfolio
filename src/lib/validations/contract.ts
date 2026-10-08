import { z } from "zod";

import { createProductSchema } from "./product";

export const contractStatuses = [
  "DRAFT",
  "PENDING_REVIEW",
  "SENT",
  "SIGNED",
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const id = z.string().trim().min(1).max(128).nullable().optional();
const date = z.iso
  .date()
  .refine((v) => v >= "2000-01-01" && v <= "2100-12-31")
  .nullable()
  .optional();
export const contractFields = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    startDate: date,
    endDate: date,
    value: createProductSchema.shape.unitPrice.nullable().optional(),
    currency: createProductSchema.shape.currency,
    content: text(60000),
    documentUrl: text(2048).refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Use an HTTPS URL without credentials."),
    contactId: id,
    companyId: id,
    dealId: id,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, "End date cannot precede start date.");
export const createContractSchema = contractFields.safeExtend({ requestId: z.uuid() });
export const editContractSchema = contractFields.safeExtend({ updatedAt: z.iso.datetime() });
export const contractStateSchema = z
  .strictObject({
    updatedAt: z.iso.datetime(),
    status: z.enum(contractStatuses).optional(),
    signedByClient: z.boolean().optional(),
    signedByUs: z.boolean().optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.signedByClient !== undefined || v.signedByUs !== undefined,
    "Choose a change.",
  )
  .refine(
    (v) => v.status === undefined || (v.signedByClient === undefined && v.signedByUs === undefined),
    "Change status or signatures separately.",
  );
export const contractQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(contractStatuses).optional(),
});
export type ContractInput = z.output<typeof contractFields>;
export type ContractRow = {
  id: string;
  title: string;
  number: string;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  value: string | null;
  currency: string;
  content: string | null;
  documentUrl: string | null;
  signedByClient: boolean;
  signedByUs: boolean;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  contact: { firstName: string; lastName: string | null } | null;
  company: { name: string } | null;
  deal: { title: string } | null;
  updatedAt: string;
  canWrite: boolean;
};
export function contractClient(row: Pick<ContractRow, "contact" | "company">) {
  return row.company?.name ?? (row.contact ? `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim() : "—");
}
export const contractTransitions: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "SENT", "CANCELLED"],
  PENDING_REVIEW: ["DRAFT", "SENT", "CANCELLED"],
  SENT: ["CANCELLED"],
  SIGNED: ["ACTIVE", "EXPIRED", "CANCELLED"],
  ACTIVE: ["EXPIRED", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
};
// Pure lifecycle rules shared with tests. The API always applies them to persisted state.
export function nextContractState(
  row: {
    status: ContractStatus;
    signedByClient: boolean;
    signedByUs: boolean;
    startDate: Date | null;
    endDate: Date | null;
  },
  input: z.output<typeof contractStateSchema>,
  today = new Date().toISOString().slice(0, 10),
) {
  if (input.status !== undefined) {
    if (!contractTransitions[row.status].includes(input.status)) throw new Error("Invalid contract status transition.");
    if (
      input.status === "ACTIVE" &&
      (!row.signedByClient ||
        !row.signedByUs ||
        (row.startDate && row.startDate.toISOString().slice(0, 10) > today) ||
        (row.endDate && row.endDate.toISOString().slice(0, 10) < today))
    )
      throw new Error("Activation requires both signatures and a current contract period.");
    if (input.status === "EXPIRED" && (!row.endDate || row.endDate.toISOString().slice(0, 10) >= today))
      throw new Error("Expiry requires an end date in the past.");
    return { status: input.status };
  }
  if (row.status !== "SENT" && row.status !== "SIGNED")
    throw new Error("Signatures can only be recorded on sent contracts.");
  const signedByClient = input.signedByClient ?? row.signedByClient,
    signedByUs = input.signedByUs ?? row.signedByUs;
  return { signedByClient, signedByUs, status: (signedByClient && signedByUs ? "SIGNED" : "SENT") as ContractStatus };
}
