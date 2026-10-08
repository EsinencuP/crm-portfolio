import "server-only";

import prisma from "@/lib/prisma";

type SequenceDb = Pick<typeof prisma, "documentSequence">;
async function generate(workspaceId: string, kind: "QUO" | "INV" | "CTR", db: SequenceDb, date: Date) {
  const year = date.getUTCFullYear();
  const sequence = await db.documentSequence.upsert({
    where: { workspaceId_kind_year: { workspaceId, kind, year } },
    create: { workspaceId, kind, year, counter: 1 },
    update: { counter: { increment: 1 } },
    select: { counter: true },
  });
  return `${kind}-${year}-${String(sequence.counter).padStart(4, "0")}`;
}
export const generateQuotationNumber = (workspaceId: string, db: SequenceDb = prisma, date = new Date()) =>
  generate(workspaceId, "QUO", db, date);
export const generateInvoiceNumber = (workspaceId: string, db: SequenceDb = prisma, date = new Date()) =>
  generate(workspaceId, "INV", db, date);
export const generateContractNumber = (workspaceId: string, db: SequenceDb = prisma, date = new Date()) =>
  generate(workspaceId, "CTR", db, date);
