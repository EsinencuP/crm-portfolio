"use client";
import { useDeferredValue, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { effectiveInvoiceStatus, invoiceBalance } from "@/lib/invoices/money";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import { invoiceStatuses } from "@/lib/validations/invoice";
import type { DocumentRow } from "@/lib/validations/quotation";

import { DocumentStatus, documentRequest } from "../../quotations/_components/document-ui";

export function InvoicesList({
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
  const deferred = useDeferredValue(search),
    navigate = onNavigate ?? ((url: string) => window.location.assign(url));
  const query = useQuery<{ invoices: DocumentRow[]; total: number; totalPages: number }>({
    queryKey: ["invoices", workspaceId, deferred, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ search: deferred, page: String(page) });
      if (status !== "all") params.set("status", status);
      return documentRequest(`/api/invoices?${params}`);
    },
  });
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">Invoices</h1>
          <p className="mt-1 text-muted-foreground text-sm">Create bills, send PDFs and record received payments.</p>
        </div>
        {canWrite && <Button onClick={() => navigate("/dashboard/invoices/new")}>+ Create Invoice</Button>}
      </header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="invoice-search">Search</Label>
          <Input
            id="invoice-search"
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
          <Label htmlFor="invoice-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) {
                setStatus(String(value));
                setPage(1);
              }
            }}
          >
            <SelectTrigger id="invoice-status" className="w-full">
              <SelectValue>{status === "all" ? "All statuses" : status.replaceAll("_", " ")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {invoiceStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll("_", " ")}
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
        <Table className="min-w-[850px]">
          <TableHeader>
            <TableRow>
              {["Number", "Client", "Total", "Paid", "Balance", "Status", "Due date"].map((label) => (
                <TableHead key={label} scope="col" className="px-4">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data?.invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="px-4">
                  <Button
                    variant="link"
                    className="px-0 font-mono"
                    onClick={() => navigate(`/dashboard/invoices/${invoice.id}`)}
                  >
                    {invoice.number}
                  </Button>
                </TableCell>
                <TableCell className="max-w-64 truncate px-4" title={invoice.clientName}>
                  {invoice.clientName}
                </TableCell>
                {[invoice.grandTotal, invoice.amountPaid ?? "0", invoiceBalance(invoice)].map((value, index) => (
                  <TableCell key={["total", "paid", "balance"][index]} className="whitespace-nowrap px-4 tabular-nums">
                    {formatDocumentMoney(value, invoice.currency)}
                  </TableCell>
                ))}
                <TableCell className="px-4">
                  <DocumentStatus status={effectiveInvoiceStatus(invoice)} />
                </TableCell>
                <TableCell
                  className={`px-4 ${effectiveInvoiceStatus(invoice) === "OVERDUE" ? "font-medium text-destructive" : ""}`}
                >
                  {invoice.dueDate?.slice(0, 10) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {!query.data?.invoices.length && (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {query.isPending ? "Loading invoices…" : "No invoices found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          {query.data?.total ?? 0} invoices · Page {page} of {Math.max(1, query.data?.totalPages ?? 1)}
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
