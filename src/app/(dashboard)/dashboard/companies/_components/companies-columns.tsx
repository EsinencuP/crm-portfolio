"use client";

import Link from "next/link";

import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Building2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  logoUrl: string | null;
  website: string | null;
  address: string | null;
  description: string | null;
  phone: string | null;
  _count: { contacts: number; deals: number };
  dealsByCurrency: Record<string, string>;
};

export function CompanyLogo({ name, src, large = false }: { name: string; src: string | null; large?: boolean }) {
  return (
    <Avatar className={large ? "size-16" : "size-9"}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback>
        <Building2 aria-hidden="true" className={large ? "size-7" : "size-4"} />
        <span className="sr-only">{name}</span>
      </AvatarFallback>
    </Avatar>
  );
}

export function formatDealTotals(totals: Record<string, string>) {
  const entries = Object.entries(totals);
  if (!entries.length) return "—";
  return entries
    .map(([currency, value]) => {
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
      } catch {
        return `${value} ${currency}`;
      }
    })
    .join(" · ");
}

function SortableHeader({ column, label }: { column: Column<CompanyRow>; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function getCompaniesColumns({
  onEdit,
  onDelete,
}: {
  onEdit: (company: CompanyRow) => void;
  onDelete: (company: CompanyRow) => void;
}): ColumnDef<CompanyRow>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => <SortableHeader column={column} label="Company" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/companies/${encodeURIComponent(row.original.id)}`}
          className="flex items-center gap-2 font-medium hover:underline"
        >
          <CompanyLogo name={row.original.name} src={row.original.logoUrl} />
          <span>{row.original.name}</span>
        </Link>
      ),
    },
    {
      id: "domain",
      accessorFn: (row) => row.domain ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Domain" />,
      cell: ({ row }) => row.original.domain || "—",
    },
    {
      id: "industry",
      accessorFn: (row) => row.industry ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Industry" />,
      cell: ({ row }) => row.original.industry || "—",
    },
    {
      id: "size",
      accessorFn: (row) => row.size ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Size" />,
      cell: ({ row }) => row.original.size || "—",
    },
    {
      id: "contacts",
      accessorFn: (row) => row._count.contacts,
      header: "Contacts",
      cell: ({ row }) => row.original._count.contacts,
      enableSorting: false,
    },
    {
      id: "deals",
      accessorFn: (row) => formatDealTotals(row.dealsByCurrency),
      header: "Deals sum",
      cell: ({ row }) => (
        <span title={`${row.original._count.deals} deals`}>{formatDealTotals(row.original.dealsByCurrency)}</span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`} />}
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/dashboard/companies/${encodeURIComponent(row.original.id)}`} />}>
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.original)}>
              <Trash2 aria-hidden="true" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
