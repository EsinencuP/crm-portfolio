"use client";
import { Badge } from "@/components/ui/badge";
import type { DocumentRow } from "@/lib/validations/quotation";
export async function documentRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (response.status === 204) return null as T;
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Document request failed.");
  return value as T;
}
export function effectiveQuotationStatus(document: Pick<DocumentRow, "status" | "expiryDate">) {
  if (
    ["DRAFT", "SENT", "VIEWED"].includes(document.status) &&
    document.expiryDate &&
    document.expiryDate.slice(0, 10) < new Date().toISOString().slice(0, 10)
  )
    return "EXPIRED";
  return document.status;
}
export function DocumentStatus({ status }: { status: string }) {
  let variant: "secondary" | "destructive" | "outline" = "secondary";
  if (["DECLINED", "EXPIRED", "OVERDUE"].includes(status)) variant = "destructive";
  if (["ACCEPTED", "CONVERTED", "PAID"].includes(status)) variant = "outline";
  return (
    <Badge variant={variant}>
      {status
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (char) => char.toUpperCase())}
    </Badge>
  );
}
