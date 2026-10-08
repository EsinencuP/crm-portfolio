import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import { invoiceBalance } from "@/lib/invoices/money";
import type { DocumentRow } from "@/lib/validations/quotation";

import { formatDocumentMoney } from "./totals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

let fontBytes: Promise<Buffer> | undefined;
// Embedded OFL Noto Sans: offline, including Cyrillic; never fetch a remote asset from document inputs.
export async function renderDocumentPdf(document: DocumentRow, kind: "Quotation" | "Invoice" = "Quotation") {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  fontBytes ??= readFile(join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"));
  const font = await pdf.embedFont(await fontBytes, { subset: true });
  const width = 595.28,
    height = 841.89,
    margin = 42,
    content = width - margin * 2;
  let page = pdf.addPage([width, height]),
    y = height - margin;
  const clean = (text: string) =>
    text
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  function nextPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
  }
  function wrap(text: string, maxWidth: number, size = 10) {
    const lines: string[] = [];
    let current = "";
    for (const word of clean(text).split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      // Split only a token that is itself too wide (e.g. a URL or long SKU).
      for (const char of word) {
        if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }
  function text(value: string, size = 10) {
    for (const line of wrap(value, content, size)) {
      if (y < margin + 35) nextPage();
      page.drawText(line, { x: margin, y: y - size, size, font, color: rgb(0.12, 0.12, 0.12) });
      y -= size + 6;
    }
  }
  text(document.issuerName, 12);
  y -= 14;
  text(kind.toUpperCase(), 24);
  text(document.number, 12);
  text(`Issued: ${document.issueDate.slice(0, 10)}`);
  const endDate = document.expiryDate ?? document.dueDate;
  if (endDate) text(`${kind === "Invoice" ? "Due" : "Valid through"}: ${endDate.slice(0, 10)}`);
  y -= 12;
  text(`Client: ${document.clientName}`, 12);
  if (document.clientEmail) text(document.clientEmail);
  y -= 20;
  const xs = [margin, margin + 244, margin + 307, margin + 409],
    widths = [230, 57, 94, 102];
  function tableHeading() {
    if (y < margin + 70) nextPage();
    page.drawRectangle({ x: margin, y: y - 24, width: content, height: 24, color: rgb(0.93, 0.93, 0.93) });
    ["Description / discount / tax", "Qty", "Unit price", "Total"].forEach((label, index) => {
      page.drawText(label, { x: xs[index] + 4, y: y - 16, size: 9, font });
    });
    y -= 30;
  }
  tableHeading();
  for (const item of document.lineItems) {
    const lines = wrap(`${item.description} | Discount ${item.discount}% | Tax ${item.taxRate}%`, widths[0] - 8, 9);
    let first = true;
    for (const line of lines) {
      if (y < margin + 45) {
        nextPage();
        tableHeading();
      }
      page.drawText(line, { x: xs[0] + 4, y: y - 10, size: 9, font });
      if (first) {
        [
          item.quantity,
          formatDocumentMoney(item.unitPrice, document.currency),
          formatDocumentMoney(item.total, document.currency),
        ].forEach((value, index) => {
          // Amounts and supported currencies are bounded; fit long maximum values without overlap.
          const size = Math.min(9, (widths[index + 1] - 8) / font.widthOfTextAtSize(value, 1));
          page.drawText(value, { x: xs[index + 1] + 4, y: y - 10, size, font });
        });
        first = false;
      }
      y -= 15;
    }
    page.drawLine({
      start: { x: margin, y: y - 3 },
      end: { x: width - margin, y: y - 3 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 13;
  }
  y -= 10;
  for (const [label, key] of [
    ["Subtotal", "subtotal"],
    ["Discount", "discountTotal"],
    ["Tax", "taxTotal"],
    ["Grand total", "grandTotal"],
  ] as const)
    text(`${label}: ${formatDocumentMoney(document[key], document.currency)}`, key === "grandTotal" ? 13 : 10);
  if (kind === "Invoice") {
    text(`Amount paid: ${formatDocumentMoney(document.amountPaid ?? "0", document.currency)}`);
    text(`Balance due: ${formatDocumentMoney(invoiceBalance(document), document.currency)}`, 13);
    text(`Status: ${document.status.replaceAll("_", " ")}`);
  }
  for (const [label, value] of [
    ["Notes", document.notes],
    ["Terms", document.terms],
  ] as const) {
    if (value) {
      y -= 12;
      text(label, 12);
      for (const paragraph of value.split(/\r?\n/)) text(paragraph);
    }
  }
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    sheet.drawText(`${document.number} | ${index + 1} / ${pages.length}`, {
      x: margin,
      y: 22,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });
  pdf.setTitle(`${kind} ${document.number}`);
  pdf.setProducer("CRM Portfolio");
  return pdf.save();
}
