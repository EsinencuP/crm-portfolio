"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formsRequest } from "../../_components/forms-list";

type Submission = {
  id: string;
  createdAt: string;
  data: Record<string, string | boolean>;
  contactId: string | null;
  processed: boolean;
};
const columns: ColumnDef<Submission>[] = [
  { accessorKey: "createdAt", header: "Date", cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
  {
    id: "data",
    header: "Submitted data",
    cell: ({ row }) => (
      <details className="max-w-md">
        <summary className="cursor-pointer truncate">
          {Object.entries(row.original.data)
            .slice(0, 3)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(" · ")}
        </summary>
        <dl className="mt-2 space-y-1">
          {Object.entries(row.original.data).map(([key, value]) => (
            <div key={key} className="break-words">
              <dt className="inline font-medium">{key}: </dt>
              <dd className="inline whitespace-pre-wrap">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    ),
  },
  {
    id: "contact",
    header: "Contact",
    cell: ({ row }) =>
      row.original.contactId ? (
        <Link className="underline" href={`/dashboard/contacts/${row.original.contactId}`}>
          View contact
        </Link>
      ) : (
        <span className="text-muted-foreground">Unavailable</span>
      ),
  },
  {
    accessorKey: "processed",
    header: "Processed",
    cell: ({ row }) => (
      <Badge variant={row.original.processed ? "secondary" : "outline"}>
        {row.original.processed ? "Processed" : "Pending"}
      </Badge>
    ),
  },
];
const emptyRows: Submission[] = [];
export function FormSubmissions({ formId }: { formId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery<{ submissions: Submission[]; total: number }>({
    queryKey: ["form-submissions", formId, page],
    queryFn: () => formsRequest(`/api/forms/${formId}/submissions?page=${page}`),
  });
  const table = useReactTable({
    data: query.data?.submissions ?? emptyRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{query.data?.total ?? 0} submissions</p>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      {query.error && (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading submissions…</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.original.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.data?.submissions.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No submissions yet.</p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              disabled={!query.data || page * 25 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
