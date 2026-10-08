import Decimal from "decimal.js";

import { type LineItemInput, lineItemSchema } from "@/lib/validations/quotation";

// Same decimal algorithm on the server and in the editor. Never trust submitted totals.
const Money = Decimal.clone({ precision: 36, rounding: Decimal.ROUND_HALF_UP });
const maximum = new Money("9999999999.99");
const cents = (value: Decimal) => value.toDecimalPlaces(2);
export function calculateQuotation(lines: LineItemInput[]) {
  let subtotal = new Money(0),
    discountTotal = new Money(0),
    taxTotal = new Money(0),
    grandTotal = new Money(0);
  const lineItems = lines.map((raw, position) => {
    const line = lineItemSchema.parse(raw);
    const gross = cents(new Money(line.quantity).times(line.unitPrice));
    const discount = cents(gross.times(line.discount).div(100));
    const net = gross.minus(discount);
    const tax = cents(net.times(line.taxRate).div(100));
    const total = net.plus(tax);
    if (gross.gt(maximum) || total.gt(maximum)) throw new Error("Line amount exceeds the document limit.");
    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(tax);
    grandTotal = grandTotal.plus(total);
    return { ...line, total: total.toFixed(2), position };
  });
  if ([subtotal, discountTotal, taxTotal, grandTotal].some((value) => value.gt(maximum)))
    throw new Error("Document amount exceeds the limit.");
  return {
    lineItems,
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
  };
}
export function formatDocumentMoney(amount: string, currency: string) {
  return `${new Money(amount).toFixed(2)} ${currency}`;
}
