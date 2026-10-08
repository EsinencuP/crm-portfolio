import { invoiceBalance } from "@/lib/invoices/money";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import type { DocumentRow } from "@/lib/validations/quotation";

// Paper hierarchy adapted from the base-repo invoice-paper; no fabricated issuer/address/logo.
export function DocumentPaper({
  document,
  kind = "Quotation",
}: {
  document: DocumentRow;
  kind?: "Quotation" | "Invoice";
}) {
  const expiry = document.expiryDate ?? document.dueDate;
  return (
    <article
      className="mx-auto w-full max-w-[794px] space-y-8 rounded-sm border bg-neutral-50 p-5 font-mono text-neutral-950 shadow-sm sm:p-10"
      aria-label={`${kind} paper preview`}
    >
      <header className="space-y-8">
        <div className="flex flex-wrap justify-between gap-4">
          <p className="max-w-full break-words font-semibold text-sm">{document.issuerName}</p>
          <h2 className="text-2xl uppercase tracking-widest">{kind}</h2>
        </div>
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold">{document.number}</p>
            <p>Issued: {document.issueDate.slice(0, 10)}</p>
            {expiry && (
              <p>
                {kind === "Invoice" ? "Due" : "Valid through"}: {expiry.slice(0, 10)}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-neutral-600 text-xs uppercase">Prepared for</p>
            <p className="break-words">{document.clientName}</p>
            {document.clientEmail && <p className="break-all">{document.clientEmail}</p>}
          </div>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] text-left text-xs">
          <caption className="sr-only">Line items; totals include discounts and tax</caption>
          <thead className="bg-neutral-200">
            <tr>
              {["Description", "Qty", "Unit price", "Discount", "Tax", "Total"].map((label) => (
                <th key={label} className="p-2 font-semibold" scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((line) => (
              <tr key={line.id} className="border-neutral-300 border-b">
                <td className="max-w-56 break-words p-2">{line.description}</td>
                <td className="p-2">{line.quantity}</td>
                <td className="whitespace-nowrap p-2">{formatDocumentMoney(line.unitPrice, document.currency)}</td>
                <td className="p-2">{line.discount}%</td>
                <td className="p-2">{line.taxRate}%</td>
                <td className="whitespace-nowrap p-2">{formatDocumentMoney(line.total, document.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto max-w-sm space-y-2 text-sm">
        {(
          [
            ["Subtotal", "subtotal"],
            ["Discount", "discountTotal"],
            ["Tax", "taxTotal"],
            ["Grand total", "grandTotal"],
          ] as const
        ).map(([label, key]) => (
          <div
            key={key}
            className={`flex flex-wrap justify-between gap-2 ${key === "grandTotal" ? "border-neutral-900 border-y-2 py-3 font-semibold" : ""}`}
          >
            <dt>{label}</dt>
            <dd>{formatDocumentMoney(document[key], document.currency)}</dd>
          </div>
        ))}
      </dl>
      {kind === "Invoice" && (
        <dl className="ml-auto max-w-sm space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>Amount paid</dt>
            <dd>{formatDocumentMoney(document.amountPaid ?? "0", document.currency)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 font-semibold">
            <dt>Balance due</dt>
            <dd>{formatDocumentMoney(invoiceBalance(document), document.currency)}</dd>
          </div>
        </dl>
      )}
      {document.notes && (
        <section className="text-sm">
          <h3 className="mb-2 font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap break-words">{document.notes}</p>
        </section>
      )}
      {document.terms && (
        <section className="text-sm">
          <h3 className="mb-2 font-semibold">Terms</h3>
          <p className="whitespace-pre-wrap break-words">{document.terms}</p>
        </section>
      )}
    </article>
  );
}
