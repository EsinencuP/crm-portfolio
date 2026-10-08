"use client";
import { useDeferredValue, useState } from "react";

import Link from "next/link";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import { type ContractRow, contractClient, contractStatuses } from "@/lib/validations/contract";

import { DocumentStatus, documentRequest } from "../../quotations/_components/document-ui";
import { ContractFormSheet } from "./contract-form-sheet";
export function ContractsList({
  workspaceId,
  canWrite,
  defaultCurrency,
}: {
  workspaceId: string;
  canWrite: boolean;
  defaultCurrency: string;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false);
  const deferred = useDeferredValue(search),
    client = useQueryClient();
  const query = useQuery<{ contracts: ContractRow[]; total: number; totalPages: number }>({
    queryKey: ["contracts", workspaceId, deferred, status, page],
    queryFn: () =>
      documentRequest(
        `/api/contracts?${new URLSearchParams({ search: deferred, page: String(page), ...(status === "all" ? {} : { status }) })}`,
      ),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">Contracts</h1>
          <p className="text-muted-foreground text-sm">Drafts, signatures and contract lifecycle.</p>
        </div>
        {canWrite && <Button onClick={() => setOpen(true)}>+ Create contract</Button>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label="Search contracts"
          placeholder="Search title or number…"
          maxLength={100}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            if (v) {
              setStatus(v);
              setPage(1);
            }
          }}
        >
          <SelectTrigger aria-label="Contract status">
            <SelectValue>{status === "all" ? "All statuses" : status.replaceAll("_", " ")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {contractStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {query.isPending && <p role="status">Loading contracts…</p>}
      {query.error && (
        <div role="alert" className="text-destructive">
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.data && (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Title", "Number", "Client", "Value", "Status", "Start / End"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.contracts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-64 whitespace-normal">
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/dashboard/contracts/${row.id}`}
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell>{row.number}</TableCell>
                    <TableCell className="max-w-56 truncate">{contractClient(row)}</TableCell>
                    <TableCell>{row.value === null ? "—" : formatDocumentMoney(row.value, row.currency)}</TableCell>
                    <TableCell>
                      <DocumentStatus status={row.status} />
                    </TableCell>
                    <TableCell>
                      {row.startDate?.slice(0, 10) ?? "—"} / {row.endDate?.slice(0, 10) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {query.data.contracts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No contracts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {query.data.total} contracts · Page {page} of {Math.max(1, query.data.totalPages)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" disabled={page >= query.data.totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      {open && (
        <ContractFormSheet
          open
          onOpenChange={setOpen}
          workspaceId={workspaceId}
          defaultCurrency={defaultCurrency}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: ["contracts", workspaceId] });
          }}
        />
      )}
    </div>
  );
}
