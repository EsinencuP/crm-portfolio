import prisma from "@/lib/prisma";
import {
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  quotationSelect,
} from "@/lib/quotations/access";
import { renderDocumentPdf } from "@/lib/quotations/pdf";
import type { DocumentRow } from "@/lib/validations/quotation";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await params;
    const quote = await prisma.quotation.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: quotationSelect,
    });
    if (!quote) throw new DocumentError("Quotation not found.", 404);
    const pdf = await renderDocumentPdf(JSON.parse(JSON.stringify(quote)) as DocumentRow);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(Buffer.from(pdf), {
      headers: {
        ...documentHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${quote.number}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return documentError(error);
  }
}
