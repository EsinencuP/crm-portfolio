"use client";
import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DocumentRow } from "@/lib/validations/quotation";

import { DocumentPaper } from "./document-paper";
import { DocumentStatus, documentRequest, effectiveQuotationStatus } from "./document-ui";
import { QuotationEditor } from "./quotation-editor";
export function QuotationDetail({
  workspaceId,
  id,
  onNavigate,
}: {
  workspaceId: string;
  id: string;
  onNavigate?: (url: string) => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false),
    [accountId, setAccountId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<"convert" | "delete" | "ACCEPTED" | "DECLINED" | null>(null);
  const query = useQuery<DocumentRow>({
    queryKey: ["quotation", workspaceId, id],
    queryFn: () => documentRequest(`/api/quotations/${id}`),
  });
  const accounts = useQuery<{ accounts: { id: string; email: string }[] }>({
    queryKey: ["email-accounts", workspaceId],
    queryFn: () => documentRequest("/api/email-accounts"),
    enabled: Boolean(query.data?.canWrite),
  });
  const navigate = onNavigate ?? ((url: string) => window.location.assign(url));
  async function action(type: "send" | "convert" | "delete" | "ACCEPTED" | "DECLINED") {
    if (!query.data) return;
    setBusy(true);
    setError("");
    try {
      const body = { updatedAt: query.data.updatedAt };
      if (type === "send") await documentRequest(`/api/quotations/${id}/send`, "POST", { ...body, accountId });
      else if (type === "convert") {
        const invoice = await documentRequest<DocumentRow>(`/api/quotations/${id}/convert`, "POST", body);
        navigate(`/dashboard/invoices/${invoice.id}`);
      } else if (type === "delete") {
        await documentRequest(`/api/quotations/${id}`, "DELETE", body);
        navigate("/dashboard/quotations");
      } else await documentRequest(`/api/quotations/${id}`, "PATCH", { ...body, status: type });
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ["quotations", workspaceId] });
      await query.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Action failed.");
      await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Loading quotation…</p>;
  if (query.error || !query.data)
    return (
      <div className="space-y-3">
        <p role="alert">{query.error?.message ?? "Quotation not found."}</p>
        <Button onClick={() => void query.refetch()}>Reload</Button>
      </div>
    );
  const document = query.data,
    status = effectiveQuotationStatus(document),
    draft = document.status === "DRAFT" && document.sendState === "IDLE",
    uncertain = ["SENDING", "UNCERTAIN"].includes(document.sendState ?? "");
  if (editing)
    return (
      <QuotationEditor
        workspaceId={workspaceId}
        issuerName={document.issuerName}
        initial={document}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          client.setQueryData(["quotation", workspaceId, id], saved);
          setEditing(false);
          void client.invalidateQueries({ queryKey: ["quotations", workspaceId] });
        }}
      />
    );
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">{document.number}</h1>
          <div className="mt-2">
            <DocumentStatus status={status} />
          </div>
        </div>
        <Button variant="outline" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>
          Reload
        </Button>
      </header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <a href={`/api/quotations/${id}/pdf?download=1`} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          Download PDF
        </a>
        <a
          href={`/api/quotations/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          Preview PDF
        </a>
        {document.canWrite && (
          <>
            <Button variant="outline" disabled={busy || !draft} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {draft && (
              <Button variant="destructive" disabled={busy} onClick={() => setConfirmation("delete")}>
                Delete Draft
              </Button>
            )}
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="quotation-sender">Sending account</Label>
              <Select
                value={accountId}
                onValueChange={(value) => setAccountId(String(value ?? ""))}
                disabled={busy || !draft}
              >
                <SelectTrigger id="quotation-sender" className="w-full">
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
            </div>
            <Button
              disabled={busy || !draft || status === "EXPIRED" || !accountId || !document.clientEmail}
              onClick={() => void action("send")}
            >
              Send to Client
            </Button>
            <Button
              variant="outline"
              disabled={busy || uncertain || !["DRAFT", "SENT", "VIEWED", "ACCEPTED"].includes(status)}
              onClick={() => setConfirmation("convert")}
            >
              Convert to Invoice
            </Button>
            {["SENT", "VIEWED"].includes(status) && (
              <>
                <Button variant="outline" disabled={busy || uncertain} onClick={() => setConfirmation("ACCEPTED")}>
                  Mark Accepted
                </Button>
                <Button variant="outline" disabled={busy || uncertain} onClick={() => setConfirmation("DECLINED")}>
                  Mark Declined
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {document.invoices?.map((invoice) => (
        <Button key={invoice.id} variant="link" onClick={() => navigate(`/dashboard/invoices/${invoice.id}`)}>
          Open invoice {invoice.number}
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {uncertain && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Email delivery is {document.sendState?.toLowerCase()}. Check the provider’s Sent folder; retries and changes
          are blocked to prevent duplicate delivery.
        </p>
      )}
      {!document.clientEmail && (
        <p className="text-muted-foreground text-sm">
          No recipient email. Edit the draft and choose a contact before sending.
        </p>
      )}
      <DocumentPaper document={document} />
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(value) => {
          if (!busy && !value) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation === "convert" ? "Create draft invoice?" : "Confirm quotation action"}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "convert"
                ? "Copies the stored items and amounts once. It does not send the invoice or record a payment."
                : "This records your manual decision. Sent quotations are not changed automatically by email opens."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (confirmation) void action(confirmation);
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
