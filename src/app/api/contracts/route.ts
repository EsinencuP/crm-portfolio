import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { contractSelect, validateContractReferences } from "@/lib/contracts/access";
import { generateContractNumber } from "@/lib/document-numbers";
import prisma from "@/lib/prisma";
import {
  canWriteDocument,
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  readDocumentBody,
} from "@/lib/quotations/access";
import { contractQuerySchema, createContractSchema } from "@/lib/validations/contract";

import { createHash } from "node:crypto";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const p = new URL(request.url).searchParams;
    const input = contractQuerySchema.parse(
      Object.fromEntries(["page", "limit", "search", "status"].map((k) => [k, p.get(k) ?? undefined])),
    );
    const scope = await documentScope(actor.member);
    const where = {
      ...scope,
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      AND: [
        ...scope.AND,
        ...(input.search
          ? [
              {
                OR: [
                  { title: { contains: input.search, mode: "insensitive" as const } },
                  { number: { contains: input.search, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.contract.findMany({
          where,
          select: { ...contractSelect, content: false, ownerId: true },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        tx.contract.count({ where }),
      ]),
    );
    return Response.json(
      {
        contracts: rows.map(({ ownerId, ...row }) => ({ ...row, canWrite: canWriteDocument(actor.member, ownerId) })),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Invalid contract filters." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
export async function POST(request: Request) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = createContractSchema.parse(await readDocumentBody(request));
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const saved = await prisma.$transaction(async (tx) => {
      const previous = await tx.contract.findFirst({
        where: { ...(await documentScope(actor.member, true)), requestId: input.requestId, deletedAt: null },
        select: { ...contractSelect, requestDigest: true },
      });
      if (previous) {
        if (previous.requestDigest !== digest)
          throw new DocumentError("Request ID was already used for other content.", 409);
        const { requestDigest: _, ...row } = previous;
        return { row, replay: true };
      }
      await validateContractReferences(input, actor.member, tx);
      const { startDate, endDate, ...fields } = input;
      const row = await tx.contract.create({
        data: {
          ...fields,
          startDate: startDate ? new Date(`${startDate}T00:00:00Z`) : null,
          endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
          requestDigest: digest,
          number: await generateContractNumber(actor.member.workspaceId, tx),
          workspaceId: actor.member.workspaceId,
          ownerId: actor.member.userId,
        },
        select: contractSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Contract",
          entityId: row.id,
          entityName: row.title,
          workspaceId: actor.member.workspaceId,
          userId: actor.member.userId,
        },
        tx,
      );
      return { row, replay: false };
    });
    return Response.json(
      { ...saved.row, canWrite: true },
      { status: saved.replay ? 200 : 201, headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: error.issues[0]?.message ?? "Check contract details.",
          fieldErrors: z.flattenError(error).fieldErrors,
        },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
