import { z } from "zod";

import { sendInvoice } from "@/lib/invoices/send";
import { documentActor, documentError, documentHeaders, readDocumentBody } from "@/lib/quotations/access";
import { sendQuotationSchema } from "@/lib/validations/quotation";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const { id } = await params;
    const input = sendQuotationSchema.parse(await readDocumentBody(request));
    return Response.json(
      { ...(await sendInvoice(actor.member, id, input)), canWrite: true },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Choose an account and reload the invoice before sending." },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
