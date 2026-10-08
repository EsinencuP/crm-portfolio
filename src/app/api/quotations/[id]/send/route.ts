import { z } from "zod";

import { documentActor, documentError, documentHeaders, readDocumentBody } from "@/lib/quotations/access";
import { sendQuotation } from "@/lib/quotations/send";
import { sendQuotationSchema } from "@/lib/validations/quotation";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = sendQuotationSchema.parse(await readDocumentBody(request));
    const { id } = await params;
    return Response.json(
      { ...(await sendQuotation(actor.member, id, input)), canWrite: true },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Choose an email account and provide current updatedAt." },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
