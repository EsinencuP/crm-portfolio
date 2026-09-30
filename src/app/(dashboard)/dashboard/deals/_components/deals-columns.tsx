"use client";

import Link from "next/link";

import type { ColumnDef } from "@tanstack/react-table";
import { format, isValid, parseISO } from "date-fns";
import { ArrowUpDown, Pencil } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDealValue, type KanbanDeal } from "./deal-card";

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3" onClick={onClick}>
      {label}
      <ArrowUpDown className="ml-1 size-3.5" />
    </Button>
  );
}

export function getDealsColumns(onEdit: (deal: KanbanDeal) => void): ColumnDef<KanbanDeal>[] {
  return [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <SortHeader label="Title" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => (
        <Link className="font-medium hover:underline" href={`/dashboard/deals/${encodeURIComponent(row.original.id)}`}>
          {row.original.title}
        </Link>
      ),
    },
    {
      id: "company",
      accessorFn: (deal) => deal.company?.name ?? "",
      header: ({ column }) => (
        <SortHeader label="Company" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) =>
        row.original.company ? (
          <Link
            className="hover:underline"
            href={`/dashboard/companies/${encodeURIComponent(row.original.company.id)}`}
          >
            {row.original.company.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "contact",
      accessorFn: (deal) => (deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : ""),
      header: ({ column }) => (
        <SortHeader label="Contact" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) =>
        row.original.contact ? (
          <Link className="hover:underline" href={`/dashboard/contacts/${encodeURIComponent(row.original.contact.id)}`}>
            {row.original.contact.firstName} {row.original.contact.lastName}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "value",
      accessorFn: (deal) => Number(deal.value ?? 0),
      header: ({ column }) => (
        <SortHeader label="Value" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDealValue(row.original.value, row.original.currency)}
        </span>
      ),
    },
    {
      id: "stage",
      accessorFn: (deal) => deal.stage.position,
      header: ({ column }) => (
        <SortHeader label="Stage" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="whitespace-nowrap">
          <span className="size-2 rounded-full" style={{ backgroundColor: row.original.stage.color }} />
          {row.original.stage.name}
        </Badge>
      ),
    },
    {
      id: "priority",
      accessorFn: (deal) => ({ LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 })[deal.priority],
      header: ({ column }) => (
        <SortHeader label="Priority" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => <Badge variant="secondary">{row.original.priority}</Badge>,
    },
    {
      id: "owner",
      accessorFn: (deal) => deal.owner?.name ?? "",
      header: ({ column }) => (
        <SortHeader label="Owner" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) =>
        row.original.owner ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <Avatar className="size-6">
              {row.original.owner.avatarUrl && <AvatarImage src={row.original.owner.avatarUrl} alt="" />}
              <AvatarFallback className="text-[10px]">
                {row.original.owner.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {row.original.owner.name}
          </span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: "closeDate",
      accessorFn: (deal) => (deal.closeDate ? new Date(deal.closeDate).getTime() : 0),
      header: ({ column }) => (
        <SortHeader label="Close Date" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => {
        const date = row.original.closeDate ? parseISO(row.original.closeDate) : null;
        return date && isValid(date) ? (
          <span className="whitespace-nowrap">{format(date, "MMM d, yyyy")}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${row.original.title}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil className="size-4" />
        </Button>
      ),
    },
  ];
}
