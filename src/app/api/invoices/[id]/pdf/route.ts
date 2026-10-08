import { invoiceSelect } from "@/lib/invoices/access";
import prisma from "@/lib/prisma";
import { DocumentError, documentActor, documentError, documentHeaders, documentScope } from "@/lib/quotations/access";
import { renderDocumentPdf } from "@/lib/quotations/pdf";
import type { DocumentRow } from "@/lib/validations/quotation";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: invoiceSelect,
    });
    if (!invoice) throw new DocumentError("Invoice not found.", 404);
    const pdf = await renderDocumentPdf(JSON.parse(JSON.stringify(invoice)) as DocumentRow, "Invoice");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(Buffer.from(pdf), {
      headers: {
        ...documentHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${invoice.number}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return documentError(error);
  }
}
