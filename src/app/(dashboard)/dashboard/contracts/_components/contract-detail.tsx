"use client";
import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import { type ContractRow, type ContractStatus, contractClient, contractTransitions } from "@/lib/validations/contract";

import { DocumentStatus, documentRequest } from "../../quotations/_components/document-ui";
import { ContractContentPreview } from "./contract-content";
import { ContractFormSheet } from "./contract-form-sheet";
export function ContractDetail({ workspaceId, id }: { workspaceId: string; id: string }) {
  const queryClient = useQueryClient(),
    router = useRouter();
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<"delete" | "CANCELLED" | "SENT" | null>(null);
  const key = ["contract", workspaceId, id];
  const query = useQuery<ContractRow>({ queryKey: key, queryFn: () => documentRequest(`/api/contracts/${id}`) });
  async function update(fields: Record<string, unknown>, remove = false) {
    if (!query.data) return;
    setBusy(true);
    setError("");
    try {
      const saved = await documentRequest<ContractRow>(`/api/contracts/${id}`, remove ? "DELETE" : "PATCH", {
        ...fields,
        updatedAt: query.data.updatedAt,
      });
      setConfirm(null);
      if (remove) router.push("/dashboard/contracts");
      else queryClient.setQueryData(key, saved);
      await queryClient.invalidateQueries({ queryKey: ["contracts", workspaceId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Loading contract…</p>;
  if (query.error || !query.data)
    return (
      <div role="alert">
        {query.error?.message ?? "Contract unavailable."}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Reload
        </Button>
      </div>
    );
  const row = query.data,
    editable = row.canWrite && ["DRAFT", "PENDING_REVIEW"].includes(row.status);
  const signable = row.canWrite && ["SENT", "SIGNED"].includes(row.status);
  const labels: Partial<Record<ContractStatus, string>> = {
    PENDING_REVIEW: "Request review",
    DRAFT: "Return to draft",
    SENT: "Mark sent",
    ACTIVE: "Activate",
    EXPIRED: "Mark expired",
    CANCELLED: "Cancel contract",
  };
  return (
    <div className="space-y-6">
      <Link className="text-muted-foreground text-sm hover:underline" href="/dashboard/contracts">
        ← Contracts
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{row.number}</p>
          <h1 className="break-words font-semibold text-2xl">{row.title}</h1>
          <DocumentStatus status={row.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button disabled={busy} variant="outline" onClick={() => setEdit(true)}>
              Edit contract
            </Button>
          )}
          {row.canWrite &&
            contractTransitions[row.status].map((s) => (
              <Button
                key={s}
                disabled={busy}
                variant={s === "CANCELLED" ? "outline" : "default"}
                onClick={() => {
                  if (s === "CANCELLED" || s === "SENT") setConfirm(s);
                  else void update({ status: s });
                }}
              >
                {labels[s] ?? s}
              </Button>
            ))}
          {row.canWrite && row.status === "DRAFT" && (
            <Button disabled={busy} variant="destructive" onClick={() => setConfirm("delete")}>
              Delete draft
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="text-destructive">
          {error}{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError("");
              void query.refetch();
            }}
          >
            Reload
          </Button>
        </div>
      )}
      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Client</dt>
          <dd>{contractClient(row)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Value</dt>
          <dd>{row.value === null ? "—" : formatDocumentMoney(row.value, row.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Start / End</dt>
          <dd>
            {row.startDate?.slice(0, 10) ?? "—"} / {row.endDate?.slice(0, 10) ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Related deal</dt>
          <dd>
            {row.deal ? (
              <Link className="underline" href={`/dashboard/deals/${row.dealId}`}>
                {row.deal.title}
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-semibold">Signatures</h2>
        <p className="text-muted-foreground text-sm">
          Manual CRM records only, not electronic signatures. Both marks are required for Signed and Active.
        </p>
        <div className="flex flex-wrap gap-6">
          {(["signedByClient", "signedByUs"] as const).map((field) => (
            <div key={field} className="flex items-center gap-3">
              <Switch
                id={field}
                checked={row[field]}
                disabled={!signable || busy}
                onCheckedChange={(v) => void update({ [field]: v })}
              />
              <Label htmlFor={field}>{field === "signedByClient" ? "Signed by client" : "Signed by us"}</Label>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-8">
        <h2 className="font-semibold">Contract content</h2>
        {!editable && <p className="text-muted-foreground text-xs">Issued content is read-only.</p>}
        <ContractContentPreview content={row.content} />
        {row.documentUrl && (
          <a
            className="inline-block text-sm underline"
            href={row.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open attached document
          </a>
        )}
      </section>
      {edit && (
        <ContractFormSheet
          open
          onOpenChange={setEdit}
          workspaceId={workspaceId}
          initial={row}
          onSaved={(saved) => {
            queryClient.setQueryData(key, saved);
            void queryClient.invalidateQueries({ queryKey: ["contracts", workspaceId] });
          }}
        />
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm
                ? { delete: "Delete draft?", SENT: "Mark contract sent?", CANCELLED: "Cancel contract?" }[confirm]
                : "Confirm change"}
            </DialogTitle>
            <DialogDescription>
              {confirm
                ? {
                    delete: "The draft will be archived; its number stays reserved.",
                    SENT: "This records a manual status and locks the text. It does not send an email.",
                    CANCELLED: "Cancellation is terminal. The contract and signature history remain recorded.",
                  }[confirm]
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() => void update(confirm === "delete" ? {} : { status: confirm }, confirm === "delete")}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
