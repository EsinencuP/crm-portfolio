import { renderDocumentPdf } from "../src/lib/quotations/pdf.ts";
import { calculateQuotation } from "../src/lib/quotations/totals.ts";
import { mkdir, writeFile } from "node:fs/promises";

const amounts = calculateQuotation([
  {
    description: "Консультация и подготовка технического задания",
    quantity: "2.50",
    unitPrice: "125.50",
    discount: "10",
    taxRate: "19",
  },
  {
    description: "Лицензия на программное обеспечение / долгосрочное обслуживание",
    quantity: "3",
    unitPrice: "49.99",
    discount: "0",
    taxRate: "20",
  },
  {
    description: "Maximum stored amount (fixture only)",
    quantity: "1",
    unitPrice: "9000000000.00",
    discount: "0",
    taxRate: "0",
  },
]);
const document = {
  ...amounts,
  id: "qa-document",
  number: "QUO-2026-0001",
  status: "DRAFT",
  issueDate: "2026-10-08",
  expiryDate: "2026-11-08",
  currency: "USD",
  contactId: "qa-contact",
  companyId: null,
  dealId: null,
  clientName: "Анна Иванова (fictional UI fixture)",
  clientEmail: "client@example.test",
  issuerName: "Example Studio (fixture)",
  notes: "Проверка кириллицы, дробных количеств и длинных денежных сумм. Не является реальным КП.",
  terms: Array.from(
    { length: 28 },
    (_, index) =>
      `${index + 1}. Условия тестового предложения: строки должны переноситься без наложения текста на подвал и сохранять читаемость на следующей странице.`,
  ).join("\n"),
  updatedAt: "2026-10-08T00:00:00Z",
  lineItems: amounts.lineItems.map((line, index) => ({ ...line, id: `fixture-line-${index}` })),
};
const invoice = process.argv.includes("--invoice");
if (invoice)
  Object.assign(document, {
    number: "INV-2026-0001",
    status: "PARTIALLY_PAID",
    expiryDate: null,
    dueDate: "2026-11-08",
    amountPaid: "300.25",
  });
await mkdir("tmp/pdfs", { recursive: true });
const path = `tmp/pdfs/${invoice ? "invoice" : "quotation"}-qa.pdf`;
await writeFile(path, await renderDocumentPdf(document, invoice ? "Invoice" : "Quotation"));
console.log(`Fixture-only PDF saved to ${path}`);
