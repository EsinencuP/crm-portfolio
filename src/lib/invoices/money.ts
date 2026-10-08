import Decimal from "decimal.js";

const Money = Decimal.clone({ precision: 36, rounding: Decimal.ROUND_HALF_UP });
export function invoiceBalance(document: { grandTotal: string; amountPaid?: string }) {
  return new Money(document.grandTotal).minus(document.amountPaid ?? "0").toFixed(2);
}
export function applyInvoicePayment(grandTotal: string, amountPaid: string, amount: string) {
  const total = new Money(grandTotal),
    paid = new Money(amountPaid),
    payment = new Money(amount);
  if (!payment.isFinite() || payment.lte(0) || payment.decimalPlaces() > 2)
    throw new Error("Payment must be positive with at most two decimal places.");
  const next = paid.plus(payment);
  if (next.gt(total)) throw new Error("Payment exceeds the outstanding balance.");
  return {
    amountPaid: next.toFixed(2),
    balance: total.minus(next).toFixed(2),
    status: next.gte(total) ? ("PAID" as const) : ("PARTIALLY_PAID" as const),
    fullyPaid: paid.lt(total) && next.gte(total),
  };
}
export function effectiveInvoiceStatus(document: {
  status: string;
  dueDate?: string | null;
  grandTotal: string;
  amountPaid?: string;
}) {
  if (
    ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(document.status) &&
    document.dueDate &&
    document.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10) &&
    new Money(invoiceBalance(document)).gt(0)
  )
    return "OVERDUE";
  return document.status;
}
