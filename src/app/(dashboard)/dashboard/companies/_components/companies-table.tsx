"use client";

import { flexRender, type Table as TanStackTable } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { CompanyRow } from "./companies-columns";

export function CompaniesTable({
  table,
  loading,
  fetching,
  total,
}: {
  table: TanStackTable<CompanyRow>;
  loading: boolean;
  fetching: boolean;
  total: number;
}) {
  const page = table.getState().pagination.pageIndex + 1;
  const size = table.getState().pagination.pageSize;
  const first = total ? (page - 1) * size + 1 : 0;
  const last = Math.min(page * size, total);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table className="min-w-225">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="px-4">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-32 text-center text-muted-foreground"
                >
                  {loading ? "Loading companies…" : "No companies match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
        <p aria-live="polite">
          {fetching && !loading ? "Refreshing… · " : ""}Showing {first}–{last} of {total}
        </p>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select value={String(size)} onValueChange={(value) => value && table.setPageSize(Number(value))}>
            <SelectTrigger size="sm" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 50, 100].map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="px-1 tabular-nums">
            Page {page} of {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage() || fetching}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage() || fetching}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
