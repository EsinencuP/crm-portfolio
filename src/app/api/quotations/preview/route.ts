import { z } from "zod";

import prisma from "@/lib/prisma";
import {
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  readDocumentBody,
  validateQuotationReferences,
} from "@/lib/quotations/access";
import { renderDocumentPdf } from "@/lib/quotations/pdf";
import { calculateQuotation } from "@/lib/quotations/totals";
import { quotationFields } from "@/lib/validations/quotation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = quotationFields.parse(await readDocumentBody(request));
    const client = await validateQuotationReferences(input, actor.member, prisma);
    let totals: ReturnType<typeof calculateQuotation>;
    try {
      totals = calculateQuotation(input.lineItems);
    } catch {
      throw new DocumentError("Amounts exceed the document limit.");
    }
    const pdf = await renderDocumentPdf({
      ...input,
      ...client,
      ...totals,
      id: "preview",
      number: "UNSAVED DRAFT",
      status: "DRAFT",
      issuerName: actor.member.workspace.name,
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      dealId: input.dealId ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      updatedAt: new Date().toISOString(),
      lineItems: totals.lineItems.map((line, index) => ({ ...line, id: `preview-${index}` })),
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        ...documentHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=quotation-preview.pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Complete the client and line items before previewing." },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
