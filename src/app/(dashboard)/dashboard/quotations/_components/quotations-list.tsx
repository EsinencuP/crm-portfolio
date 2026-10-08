"use client";
import { useDeferredValue, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import { type DocumentRow, quotationStatuses } from "@/lib/validations/quotation";

import { DocumentStatus, documentRequest, effectiveQuotationStatus } from "./document-ui";
export function QuotationsList({
  workspaceId,
  canWrite,
  onNavigate,
}: {
  workspaceId: string;
  canWrite: boolean;
  onNavigate?: (url: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const deferred = useDeferredValue(search);
  const query = useQuery<{ quotations: DocumentRow[]; total: number; totalPages: number }>({
    queryKey: ["quotations", workspaceId, deferred, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ search: deferred, page: String(page) });
      if (status !== "all") params.set("status", status);
      return documentRequest(`/api/quotations?${params}`);
    },
  });
  const navigate = onNavigate ?? ((url: string) => window.location.assign(url));
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">Quotations</h1>
          <p className="mt-1 text-muted-foreground text-sm">Prepare, send and convert commercial proposals.</p>
        </div>
        {canWrite && <Button onClick={() => navigate("/dashboard/quotations/new")}>+ Create Quotation</Button>}
      </header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="quotation-search">Search</Label>
          <Input
            id="quotation-search"
            placeholder="Number or client…"
            maxLength={100}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="quotation-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) {
                setStatus(String(value));
                setPage(1);
              }
            }}
          >
            <SelectTrigger id="quotation-status" className="w-full">
              <SelectValue>{status === "all" ? "All statuses" : status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {quotationStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      {query.error && (
        <p role="alert" className="text-destructive text-sm">
          {query.error.message}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border" aria-busy={query.isFetching}>
        <Table className="min-w-[650px]">
          <TableHeader>
            <TableRow>
              {["Number", "Client", "Total", "Status", "Expiry"].map((label) => (
                <TableHead key={label} scope="col" className="px-4">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data?.quotations.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell className="px-4">
                  <Button
                    variant="link"
                    className="px-0 font-mono"
                    onClick={() => navigate(`/dashboard/quotations/${quote.id}`)}
                  >
                    {quote.number}
                  </Button>
                </TableCell>
                <TableCell className="max-w-64 truncate px-4" title={quote.clientName}>
                  {quote.clientName}
                </TableCell>
                <TableCell className="whitespace-nowrap px-4 tabular-nums">
                  {formatDocumentMoney(quote.grandTotal, quote.currency)}
                </TableCell>
                <TableCell className="px-4">
                  <DocumentStatus status={effectiveQuotationStatus(quote)} />
                </TableCell>
                <TableCell className="px-4">{quote.expiryDate?.slice(0, 10) ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!query.data?.quotations.length && (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  {query.isPending ? "Loading quotations…" : "No quotations found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          {query.data?.total ?? 0} quotations · Page {page} of {Math.max(1, query.data?.totalPages ?? 1)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= (query.data?.totalPages ?? 1) || query.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
}
