"use client";

import Link from "next/link";

import { flexRender, type Table as TanStackTable } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ContactAvatar, type ContactRow, SourceBadge, StatusBadge } from "./contacts-columns";

export function ContactsTable({
  table,
  view,
  loading,
  fetching,
  total,
  onEdit,
  onArchive,
}: {
  table: TanStackTable<ContactRow>;
  view: "table" | "grid";
  loading: boolean;
  fetching: boolean;
  total: number;
  onEdit: (contact: ContactRow) => void;
  onArchive: (contact: ContactRow) => void;
}) {
  const rows = table.getRowModel().rows;
  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = Math.max(1, table.getPageCount());
  const first = total === 0 ? 0 : (currentPage - 1) * table.getState().pagination.pageSize + 1;
  const last = Math.min(currentPage * table.getState().pagination.pageSize, total);

  return (
    <div className="min-w-0 space-y-4">
      {view === "table" && (
        <div className="min-w-0 rounded-xl ring-1 ring-foreground/10">
          <Table className="min-w-250">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    let ariaSort: "ascending" | "descending" | undefined;
                    if (sorted === "asc") ariaSort = "ascending";
                    if (sorted === "desc") ariaSort = "descending";
                    return (
                      <TableHead key={header.id} scope="col" aria-sort={ariaSort} className="px-4">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
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
                    {loading ? "Loading contacts…" : "No contacts match your filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {view === "grid" && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const contact = row.original;
            const name = `${contact.firstName} ${contact.lastName}`.trim();
            return (
              <Card key={contact.id} className="min-w-0">
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <ContactAvatar name={name} src={contact.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/contacts/${encodeURIComponent(contact.id)}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {name}
                      </Link>
                      <p className="truncate text-muted-foreground text-xs">
                        {contact.jobTitle || contact.company?.name || "Contact"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={contact.status} />
                    <SourceBadge source={contact.source} />
                  </div>
                  <div className="space-y-1 text-muted-foreground text-sm">
                    <p className="truncate">{contact.email || "No email"}</p>
                    <p className="truncate">{contact.phone || "No phone"}</p>
                    <p className="truncate">{contact.company?.name || "No company"}</p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Checkbox
                        aria-label={`Select ${name}`}
                        checked={row.getIsSelected()}
                        onCheckedChange={(checked) => row.toggleSelected(checked)}
                      />
                      Select
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${name}`}
                        onClick={() => onEdit(contact)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Archive ${name}`}
                        onClick={() => onArchive(contact)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {view === "grid" && rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {loading ? "Loading contacts…" : "No contacts match your filters."}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
        <p aria-live="polite">
          {fetching && !loading ? "Refreshing… · " : ""}Showing {first}–{last} of {total}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => value && table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" aria-label="Rows per page" className="w-17">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="px-1 tabular-nums">
            Page {currentPage} of {pageCount}
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
