import { z } from "zod";

import { paymentSelect } from "@/lib/invoices/access";
import { recordInvoicePayment } from "@/lib/invoices/payments";
import prisma from "@/lib/prisma";
import {
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  readDocumentBody,
} from "@/lib/quotations/access";
import { recordPaymentSchema } from "@/lib/validations/invoice";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await params,
      query = z
        .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
        .parse({ page: new URL(request.url).searchParams.get("page") ?? undefined });
    const invoice = await prisma.invoice.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: { id: true },
    });
    if (!invoice) throw new DocumentError("Invoice not found.", 404);
    const where = { invoiceId: id, workspaceId: actor.member.workspaceId };
    const [payments, total] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.payment.findMany({
          where,
          select: paymentSelect,
          orderBy: [{ paidAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * 20,
          take: 20,
        }),
        tx.payment.count({ where }),
      ]),
    );
    return Response.json(
      { payments, total, page: query.page, totalPages: Math.ceil(total / 20) },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Invalid payment history page." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = recordPaymentSchema.parse(await readDocumentBody(request)),
      { id } = await params;
    const result = await recordInvoicePayment(actor.member, id, input);
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Check payment fields, requestId and current updatedAt.",
          fieldErrors: z.flattenError(error).fieldErrors,
        },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
