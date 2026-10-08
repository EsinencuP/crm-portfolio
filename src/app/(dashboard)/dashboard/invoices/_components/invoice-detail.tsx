"use client";
import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { effectiveInvoiceStatus, invoiceBalance } from "@/lib/invoices/money";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import type { PaymentRow } from "@/lib/validations/invoice";
import type { DocumentRow } from "@/lib/validations/quotation";

import { DocumentPaper } from "../../quotations/_components/document-paper";
import { DocumentStatus, documentRequest } from "../../quotations/_components/document-ui";
import { QuotationEditor } from "../../quotations/_components/quotation-editor";
import { PaymentForm } from "../[id]/_components/payment-form";

export function InvoiceDetail({
  workspaceId,
  id,
  onNavigate,
}: {
  workspaceId: string;
  id: string;
  onNavigate?: (url: string) => void;
}) {
  const client = useQueryClient(),
    navigate = onNavigate ?? ((url: string) => window.location.assign(url));
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState(false),
    [paymentOpen, setPaymentOpen] = useState(false),
    [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null),
    [accountId, setAccountId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const query = useQuery<DocumentRow>({
    queryKey: ["invoice", workspaceId, id],
    queryFn: () => documentRequest(`/api/invoices/${id}`),
  });
  const history = useQuery<{ payments: PaymentRow[]; total: number; totalPages: number }>({
    queryKey: ["invoice-payments", workspaceId, id, page],
    enabled: Boolean(query.data),
    queryFn: () => documentRequest(`/api/invoices/${id}/payments?page=${page}`),
  });
  const accounts = useQuery<{ accounts: { id: string; email: string }[] }>({
    queryKey: ["email-accounts", workspaceId],
    enabled: Boolean(query.data?.canWrite),
    queryFn: () => documentRequest("/api/email-accounts"),
  });
  function refresh() {
    void client.invalidateQueries({ queryKey: ["invoices", workspaceId] });
    void client.invalidateQueries({ queryKey: ["invoice", workspaceId, id] });
    void client.invalidateQueries({ queryKey: ["invoice-payments", workspaceId, id] });
  }
  function saved(document: DocumentRow) {
    client.setQueryData(["invoice", workspaceId, id], document);
    refresh();
  }
  async function action(kind: "send" | "cancel" | "delete") {
    if (!query.data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const document = query.data;
      if (kind === "delete") {
        await documentRequest(`/api/invoices/${id}`, "DELETE", { updatedAt: document.updatedAt });
        refresh();
        navigate("/dashboard/invoices");
        return;
      }
      const result = await documentRequest<DocumentRow>(
        `/api/invoices/${id}${kind === "send" ? "/send" : ""}`,
        kind === "send" ? "POST" : "PATCH",
        { updatedAt: document.updatedAt, ...(kind === "send" ? { accountId } : { status: "CANCELLED" }) },
      );
      saved(result);
      setNotice(kind === "send" ? "Invoice email sent with PDF attachment." : "Invoice cancelled.");
      setConfirm(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operation failed.");
      refresh();
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Loading invoice…</p>;
  if (query.error || !query.data)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {query.error?.message ?? "Invoice unavailable."}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  const invoice = query.data,
    canWrite = Boolean(invoice.canWrite),
    balance = invoiceBalance(invoice),
    draft = invoice.status === "DRAFT" && invoice.sendState === "IDLE" && Number(invoice.amountPaid ?? 0) === 0;
  const canCancel =
    canWrite &&
    Number(invoice.amountPaid ?? 0) === 0 &&
    !["PAID", "CANCELLED", "REFUNDED"].includes(invoice.status) &&
    !["SENDING", "UNCERTAIN"].includes(invoice.sendState ?? "IDLE");
  const canPay =
    canWrite &&
    Number(balance) > 0 &&
    !["PAID", "CANCELLED", "REFUNDED"].includes(invoice.status) &&
    invoice.sendState !== "SENDING";
  if (edit)
    return (
      <QuotationEditor
        key={invoice.updatedAt}
        workspaceId={workspaceId}
        issuerName={invoice.issuerName}
        initial={invoice}
        documentKind="Invoice"
        onCancel={() => setEdit(false)}
        onSaved={(document) => {
          saved(document);
          setEdit(false);
        }}
      />
    );
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">Invoice {invoice.number}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <DocumentStatus status={effectiveInvoiceStatus(invoice)} />
            <p className="text-muted-foreground text-sm">{invoice.clientName}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/dashboard/invoices")}>
          All invoices
        </Button>
      </header>
      <div className="flex flex-wrap gap-2 rounded-xl border p-4">
        {canWrite && draft && (
          <Button variant="outline" disabled={busy} onClick={() => setEdit(true)}>
            Edit
          </Button>
        )}
        {canPay && (
          <Button disabled={busy} onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
        )}
        <a
          href={`/api/invoices/${id}/pdf?download=1`}
          className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
        >
          Download PDF
        </a>
        {invoice.quotationId && (
          <a
            href={`/dashboard/quotations/${invoice.quotationId}`}
            className="inline-flex min-h-9 items-center px-3 text-sm underline"
          >
            Source quotation
          </a>
        )}
        {canCancel && (
          <Button variant="outline" disabled={busy} onClick={() => setConfirm("cancel")}>
            Cancel invoice
          </Button>
        )}
        {canWrite && draft && (
          <Button variant="outline" disabled={busy} onClick={() => setConfirm("delete")}>
            Delete draft
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice.length > 0 && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {["UNCERTAIN", "SENDING"].includes(invoice.sendState ?? "") && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          Email delivery is {invoice.sendState?.toLowerCase()}. Check the connected account’s Sent folder. Resending and
          editing are blocked to avoid duplicate delivery.
        </p>
      )}
      {canWrite && invoice.sendState === "IDLE" && !["CANCELLED", "REFUNDED"].includes(invoice.status) && (
        <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <div className="w-full space-y-1.5 sm:w-80">
            <Label htmlFor="invoice-sending-account">Sending account</Label>
            <Select value={accountId} onValueChange={(value) => setAccountId(String(value ?? ""))} disabled={busy}>
              <SelectTrigger id="invoice-sending-account" className="w-full">
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
              <a href="/dashboard/settings/email" className="text-xs underline">
                Connect Gmail / Outlook
              </a>
            )}
          </div>
          <Button disabled={busy || !accountId || !invoice.clientEmail} onClick={() => void action("send")}>
            {busy ? "Working…" : "Send to Client"}
          </Button>
          {!invoice.clientEmail && (
            <p className="text-muted-foreground text-sm">A recipient contact with an email address is required.</p>
          )}
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Invoice amounts">
        {[
          ["Total", invoice.grandTotal],
          ["Paid", invoice.amountPaid ?? "0"],
          ["Balance", balance],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 break-words font-semibold text-xl tabular-nums">
              {formatDocumentMoney(value, invoice.currency)}
            </p>
          </div>
        ))}
      </section>
      <DocumentPaper document={invoice} kind="Invoice" />
      <section className="space-y-3" aria-label="Payment history">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-lg">Payment history</h2>
          <Button variant="outline" disabled={history.isFetching} onClick={() => void history.refetch()}>
            Refresh payments
          </Button>
        </header>
        {history.error && (
          <p role="alert" className="text-destructive text-sm">
            {history.error.message}
          </p>
        )}
        <div className="overflow-hidden rounded-xl border">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                {["Date", "Amount", "Method", "Status", "Reference / notes"].map((label) => (
                  <TableHead key={label} scope="col">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data?.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.paidAt.slice(0, 10)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDocumentMoney(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell>{payment.method.replaceAll("_", " ")}</TableCell>
                  <TableCell>
                    <DocumentStatus status={payment.status} />
                  </TableCell>
                  <TableCell className="max-w-80 whitespace-normal break-words">
                    <p>{payment.reference ?? "—"}</p>
                    {payment.notes && <p className="text-muted-foreground text-xs">{payment.notes}</p>}
                  </TableCell>
                </TableRow>
              ))}
              {!history.data?.payments.length && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {history.isPending ? "Loading payments…" : "No payments recorded."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {history.data?.total ?? 0} payments · Page {page} of {Math.max(1, history.data?.totalPages ?? 1)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || history.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous payments
            </Button>
            <Button
              variant="outline"
              disabled={page >= (history.data?.totalPages ?? 1) || history.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              Next payments
            </Button>
          </div>
        </footer>
      </section>
      {paymentOpen && canPay && (
        <PaymentForm
          invoice={invoice}
          onClose={() => setPaymentOpen(false)}
          onRefresh={refresh}
          onSaved={(result) => {
            saved(result.invoice);
            setPage(1);
            setNotice("Payment recorded.");
          }}
        />
      )}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(value) => {
          if (!value && !busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? "Delete draft invoice?" : "Cancel invoice?"}</DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "This unpaid, unsent draft will be archived; its number and audit history are retained. Conversion from a quotation will not be reversed."
                : "The unpaid invoice will remain in history and no longer accept payments. No funds will be moved."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Keep invoice
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (confirm) void action(confirm);
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
