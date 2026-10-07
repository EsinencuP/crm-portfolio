"use client";

import { Fragment, useMemo, useState } from "react";

import Link from "next/link";

import { type ColumnDef, type ExpandedState, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AuditLogRow = {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "IMPORT" | "LOGIN" | "LOGOUT";
  entityType: string;
  entityId: string;
  entityName: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
};

const actionClasses: Record<AuditLogRow["action"], string> = {
  CREATE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  UPDATE: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  DELETE: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  EXPORT: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  IMPORT: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  LOGIN: "border-foreground/20 bg-muted text-foreground",
  LOGOUT: "border-foreground/20 bg-muted text-foreground",
};

function entityHref(log: AuditLogRow) {
  if (log.action === "DELETE") return null;
  const segment: Record<string, string> = {
    Contact: "contacts",
    Company: "companies",
    Deal: "deals",
  };
  const path = segment[log.entityType];
  return path ? `/dashboard/${path}/${encodeURIComponent(log.entityId)}` : null;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function AuditLogTable({
  logs,
  total,
  page,
  limit,
  loading,
  onPageChange,
}: {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const columns = useMemo<ColumnDef<AuditLogRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} className="whitespace-nowrap text-muted-foreground text-sm">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(row.original.createdAt),
            )}
          </time>
        ),
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <Avatar className="size-7">
              {row.original.user.avatarUrl && <AvatarImage src={row.original.user.avatarUrl} alt="" />}
              <AvatarFallback className="text-xs">{row.original.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            {row.original.user.name}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <Badge className={actionClasses[row.original.action]}>{row.original.action}</Badge>,
      },
      { accessorKey: "entityType", header: "Entity Type" },
      {
        accessorKey: "entityName",
        header: "Entity Name",
        cell: ({ row }) => {
          const label = row.original.entityName || row.original.entityId;
          const href = entityHref(row.original);
          return href ? (
            <Link href={href} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
              {label}
            </Link>
          ) : (
            <span className="font-medium">{label}</span>
          );
        },
      },
      {
        id: "changes",
        header: "Changes",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${row.getIsExpanded() ? "Hide" : "Show"} changes for ${row.original.entityName || row.original.entityType}`}
            aria-expanded={row.getIsExpanded()}
            onClick={(event) => {
              event.stopPropagation();
              row.toggleExpanded();
            }}
          >
            {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {Object.keys(row.original.changes ?? {}).length} fields
          </Button>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: logs,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
  });
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table className="min-w-220">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="px-4" scope="col">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => row.toggleExpanded()}
                    onKeyDown={(event) => {
                      if ((event.target as HTMLElement).closest("button, a")) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        row.toggleExpanded();
                      }
                    }}
                    tabIndex={0}
                    aria-expanded={row.getIsExpanded()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow key={`${row.id}-changes`}>
                      <TableCell colSpan={columns.length} className="bg-muted/40 px-4 py-4">
                        {Object.entries(row.original.changes ?? {}).length ? (
                          <dl className="grid gap-3">
                            {Object.entries(row.original.changes ?? {}).map(([field, change]) => (
                              <div
                                key={field}
                                className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_auto_minmax(0,1fr)]"
                              >
                                <dt className="font-medium text-sm">{field}</dt>
                                <dd className="min-w-0 whitespace-pre-wrap break-all text-muted-foreground text-sm">
                                  {displayValue(change.old)}
                                </dd>
                                <span aria-hidden="true" className="text-muted-foreground">
                                  →
                                </span>
                                <dd className="min-w-0 whitespace-pre-wrap break-all text-sm">
                                  {displayValue(change.new)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-muted-foreground text-sm">No field-level changes recorded.</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {loading ? "Loading audit log…" : "No events match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
        <p aria-live="polite">
          Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total}
        </p>
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
