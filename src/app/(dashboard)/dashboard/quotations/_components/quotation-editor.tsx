"use client";
import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { calculateQuotation, formatDocumentMoney } from "@/lib/quotations/totals";
import { invoiceFields } from "@/lib/validations/invoice";
import { productCurrencies } from "@/lib/validations/product";
import { type DocumentRow, type LineItemInput, quotationFields } from "@/lib/validations/quotation";

import { DocumentPaper } from "./document-paper";
import { documentRequest } from "./document-ui";
import { type QuotationOption, QuotationPicker } from "./quotation-picker";

type DraftLine = LineItemInput & { key: string };
const blankLine = (key = crypto.randomUUID()): DraftLine => ({
  key,
  productId: null,
  description: "",
  quantity: "1",
  unitPrice: "0",
  discount: "0",
  taxRate: "0",
});
export function QuotationEditor({
  workspaceId,
  issuerName,
  defaultCurrency = "USD",
  documentKind = "Quotation",
  initial,
  onSaved,
  onCancel,
}: {
  workspaceId: string;
  issuerName: string;
  defaultCurrency?: string;
  documentKind?: "Quotation" | "Invoice";
  initial?: DocumentRow;
  onSaved?: (document: DocumentRow) => void;
  onCancel?: () => void;
}) {
  const isInvoice = documentKind === "Invoice",
    resource = isInvoice ? "invoices" : "quotations";
  const [saved, setSaved] = useState(initial ?? null),
    [requestId] = useState(() => crypto.randomUUID());
  const [clientType, setClientType] = useState(initial?.companyId ? "company" : "contact");
  const [contact, setContact] = useState<QuotationOption | null>(
    initial?.contactId
      ? {
          id: initial.contactId,
          label: initial.companyId ? (initial.clientEmail ?? "Linked contact") : initial.clientName,
          email: initial.clientEmail,
        }
      : null,
  );
  const [company, setCompany] = useState<QuotationOption | null>(
    initial?.companyId ? { id: initial.companyId, label: initial.clientName } : null,
  );
  const [issueDate, setIssueDate] = useState(initial?.issueDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10)),
    [expiryDate, setExpiryDate] = useState((isInvoice ? initial?.dueDate : initial?.expiryDate)?.slice(0, 10) ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency),
    [notes, setNotes] = useState(initial?.notes ?? ""),
    [terms, setTerms] = useState(initial?.terms ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      initial?.lineItems.map((line) => ({
        key: line.id,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
      })) ?? [blankLine("initial-line")],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pdfUrl, setPdfUrl] = useState<string | null>(null),
    [productKey, setProductKey] = useState(0),
    [accountId, setAccountId] = useState("");
  const accounts = useQuery<{ accounts: { id: string; email: string }[] }>({
    queryKey: ["email-accounts", workspaceId],
    queryFn: () => documentRequest("/api/email-accounts"),
  });
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  const locked = Boolean(
    saved && (saved.status !== "DRAFT" || saved.sendState !== "IDLE" || Number(saved.amountPaid ?? 0) > 0),
  );
  const payload = {
    contactId: contact?.id ?? null,
    companyId: company?.id ?? null,
    dealId: initial?.dealId ?? null,
    issueDate,
    ...(isInvoice ? { dueDate: expiryDate || null } : { expiryDate: expiryDate || null }),
    currency,
    notes,
    terms,
    lineItems: lines.map(({ key: _, ...line }) => line),
  };
  let totals: ReturnType<typeof calculateQuotation> | null = null;
  try {
    totals = calculateQuotation(payload.lineItems);
  } catch {
    /* Incomplete rows do not display fabricated totals. */
  }
  function validated() {
    const result = (isInvoice ? invoiceFields : quotationFields).safeParse(payload);
    if (!result.success)
      throw new Error(
        result.error.issues.map((issue) => `${issue.path.join(".") || "Quotation"}: ${issue.message}`).join(" "),
      );
    if (!totals) throw new Error("Line amounts exceed the limit.");
    return result.data;
  }
  async function save(send: boolean) {
    setError("");
    setBusy(true);
    let document = saved;
    try {
      const input = validated();
      if (send && !accountId) throw new Error("Choose a connected email account before sending.");
      document = await documentRequest<DocumentRow>(
        document ? `/api/${resource}/${document.id}` : `/api/${resource}`,
        document ? "PATCH" : "POST",
        { ...input, ...(document ? { updatedAt: document.updatedAt } : { requestId }) },
      );
      setSaved(document);
      if (send) {
        document = await documentRequest<DocumentRow>(`/api/${resource}/${document.id}/send`, "POST", {
          accountId,
          updatedAt: document.updatedAt,
        });
        setSaved(document);
      }
      if (onSaved) onSaved(document);
      else window.location.assign(`/dashboard/${resource}/${document.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save document.");
      if (document) {
        try {
          setSaved(await documentRequest<DocumentRow>(`/api/${resource}/${document.id}`));
        } catch {
          /* Keep the original save/send error if reloading also fails. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/${resource}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated()),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Preview failed.");
      }
      setPdfUrl(URL.createObjectURL(await response.blob()));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }
  function updateLine(key: string, field: keyof LineItemInput, value: string) {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }
  const previewDocument: DocumentRow | null = totals
    ? {
        ...payload,
        ...totals,
        id: saved?.id ?? "preview",
        number: saved?.number ?? "UNSAVED DRAFT",
        status: saved?.status ?? "DRAFT",
        ...(isInvoice ? { amountPaid: saved?.amountPaid ?? "0" } : {}),
        clientName: company?.label ?? contact?.label ?? "Choose a client",
        clientEmail: contact?.email ?? null,
        issuerName,
        updatedAt: saved?.updatedAt ?? new Date().toISOString(),
        lineItems: totals.lineItems.map((line, index) => ({ ...line, id: lines[index].key })),
      }
    : null;
  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="font-semibold text-2xl">
          {saved ? `Edit ${saved.number}` : `New ${documentKind.toLowerCase()}`}
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Prices exclude tax. Line discounts apply before tax; amounts round to two decimals per line.
        </p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <fieldset disabled={busy || locked} className="min-w-0 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="quote-client-type">Client type</Label>
              <Select
                value={clientType}
                onValueChange={(value) => {
                  if (value) {
                    setClientType(String(value));
                    setContact(null);
                    setCompany(null);
                  }
                }}
              >
                <SelectTrigger id="quote-client-type" className="w-full">
                  <SelectValue>{clientType === "company" ? "Company" : "Contact"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <QuotationPicker
              key={clientType}
              workspaceId={workspaceId}
              type={clientType === "company" ? "company" : "contact"}
              label="Client"
              value={clientType === "company" ? company : contact}
              onChange={(value) => {
                if (clientType === "company") {
                  setCompany(value);
                  setContact(null);
                } else setContact(value);
              }}
              disabled={busy || locked}
            />
            <div className="space-y-1.5">
              <Label htmlFor="quote-issue">Issue date</Label>
              <Input
                id="quote-issue"
                type="date"
                required
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-expiry">{isInvoice ? "Due date" : "Expiry date"}</Label>
              <Input
                id="quote-expiry"
                type="date"
                min={issueDate}
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </div>
          </section>
          {clientType === "company" && (
            <QuotationPicker
              workspaceId={workspaceId}
              type="contact"
              companyId={company?.id}
              label="Recipient contact"
              value={contact}
              onChange={setContact}
              disabled={busy || locked || !company}
            />
          )}
          <Separator />
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Line items</h2>
              <Button
                type="button"
                variant="outline"
                disabled={lines.length >= 100}
                onClick={() => setLines((rows) => [...rows, blankLine()])}
              >
                <Plus />
                Add line item
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <QuotationPicker
                key={`${productKey}:${currency}`}
                workspaceId={workspaceId}
                type="product"
                currency={currency}
                label="Add product from catalog"
                value={null}
                disabled={busy || locked || lines.length >= 100}
                onChange={(product) => {
                  if (!product) return;
                  const line = {
                    ...blankLine(),
                    productId: product.id,
                    description: product.label,
                    unitPrice: product.unitPrice ?? "0",
                    taxRate: product.taxRate ?? "0",
                  };
                  setLines((rows) => (rows.length === 1 && !rows[0].description ? [line] : [...rows, line]));
                  setProductKey((value) => value + 1);
                }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="quote-currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(value) => {
                    if (value) setCurrency(String(value));
                  }}
                >
                  <SelectTrigger id="quote-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...productCurrencies, currency])].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Catalog search shows matching-currency products only. Changing currency does not convert entered prices.
            </p>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="grid min-w-0 grid-cols-2 items-end gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_80px_110px_80px_80px_130px_32px]"
                >
                  <div className="col-span-2 min-w-0 space-y-1.5 lg:col-span-1">
                    <Label htmlFor={`line-${line.key}-description`} className="text-xs">
                      Description {index + 1}
                    </Label>
                    <Input
                      id={`line-${line.key}-description`}
                      maxLength={500}
                      required
                      value={line.description}
                      onChange={(event) => updateLine(line.key, "description", event.target.value)}
                    />
                    {line.productId && <p className="text-muted-foreground text-xs">Catalog price snapshot</p>}
                  </div>
                  {(
                    [
                      ["quantity", "Quantity"],
                      ["unitPrice", "Unit price"],
                      ["discount", "Discount %"],
                      ["taxRate", "Tax %"],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="min-w-0 space-y-1.5">
                      <Label htmlFor={`line-${line.key}-${field}`} className="text-xs">
                        {label} {index + 1}
                      </Label>
                      <Input
                        id={`line-${line.key}-${field}`}
                        type="number"
                        step="0.01"
                        min={field === "quantity" ? "0.01" : "0"}
                        max={field === "discount" || field === "taxRate" ? "100" : undefined}
                        required
                        value={line[field]}
                        onChange={(event) => updateLine(line.key, field, event.target.value)}
                      />
                    </div>
                  ))}
                  <div className="min-w-0 text-sm">
                    <p className="text-muted-foreground text-xs">Line total</p>
                    <p className="break-words font-medium tabular-nums">
                      {totals ? formatDocumentMoney(totals.lineItems[index].total, currency) : "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line item ${index + 1}`}
                    disabled={lines.length <= 1}
                    onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          <Separator />
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="quote-notes">Notes</Label>
                <Textarea
                  id="quote-notes"
                  rows={3}
                  maxLength={5000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-terms">Terms</Label>
                <Textarea
                  id="quote-terms"
                  rows={3}
                  maxLength={5000}
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                />
              </div>
            </div>
            <dl className="space-y-3 text-sm">
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
                  className={`flex flex-wrap justify-between gap-2 ${key === "grandTotal" ? "border-t pt-3 font-semibold" : ""}`}
                >
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{totals ? formatDocumentMoney(totals[key], currency) : "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        </fieldset>
        <footer className="mt-6 space-y-4 border-t pt-4">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          {locked && (
            <p role="status" className="text-sm">
              This document is locked after sending or recording payment. Open the saved document to review its state.
            </p>
          )}
          {saved && (
            <a className="text-sm underline" href={`/dashboard/${resource}/${saved.id}`}>
              Open saved {documentKind.toLowerCase()}
            </a>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full space-y-1.5 sm:w-72">
              <Label htmlFor="quote-email-account">Sending account</Label>
              <Select
                value={accountId}
                onValueChange={(value) => setAccountId(String(value ?? ""))}
                disabled={busy || locked}
              >
                <SelectTrigger id="quote-email-account" className="w-full">
                  <SelectValue placeholder="Choose your email account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.data?.accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.error && (
                <p role="alert" className="text-destructive text-xs">
                  {accounts.error.message}
                </p>
              )}
              {accounts.data?.accounts.length === 0 && (
                <a className="text-xs underline" href="/dashboard/settings/email">
                  Connect Gmail / Outlook
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {onCancel && (
                <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="button" variant="outline" disabled={busy} onClick={() => void preview()}>
                Preview PDF
              </Button>
              <Button type="submit" variant="outline" disabled={busy || locked}>
                {busy ? "Working…" : "Save Draft"}
              </Button>
              <Button
                type="button"
                disabled={busy || locked || !contact?.email || !accountId}
                onClick={() => void save(true)}
              >
                Send to Client
              </Button>
            </div>
          </div>
        </footer>
      </form>
      {previewDocument && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium text-sm">Paper preview</summary>
          <div className="mt-4">
            <DocumentPaper document={previewDocument} kind={documentKind} />
          </div>
        </details>
      )}
      <Dialog
        open={Boolean(pdfUrl)}
        onOpenChange={(value) => {
          if (!value) setPdfUrl(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{documentKind} PDF preview</DialogTitle>
            <DialogDescription>
              Unsaved preview. Download the generated PDF to inspect pagination; the paper layout below works even when
              your browser has no PDF viewer.
            </DialogDescription>
          </DialogHeader>
          {pdfUrl && (
            <>
              <a href={pdfUrl} download={`${documentKind.toLowerCase()}-preview.pdf`} className="text-sm underline">
                Download preview PDF
              </a>
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                Open generated PDF in new tab
              </a>
              <section
                aria-label="PDF paper preview"
                className="h-[60vh] w-full overflow-y-auto rounded border bg-muted p-2"
              >
                {previewDocument && <DocumentPaper document={previewDocument} kind={documentKind} />}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
