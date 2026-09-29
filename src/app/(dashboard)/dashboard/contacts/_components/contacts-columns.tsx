"use client";

import Link from "next/link";

import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ContactStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ContactSource = "MANUAL" | "IMPORT" | "WEBSITE" | "REFERRAL" | "LINKEDIN" | "API";
export type ContactOwner = { id: string; name: string; email: string; avatarUrl: string | null; role: string };
export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  notes_text: string | null;
  avatarUrl: string | null;
  source: ContactSource;
  status: ContactStatus;
  companyId: string | null;
  ownerId: string | null;
  company: { id: string; name: string } | null;
  owner: ContactOwner | null;
  _count: { deals: number; activities: number };
};

const sourceStyles: Record<ContactSource, string> = {
  MANUAL: "border-border bg-muted text-muted-foreground",
  IMPORT: "border-slate-200 bg-slate-500/10 text-slate-700 dark:border-slate-700 dark:text-slate-300",
  WEBSITE: "border-blue-200 bg-blue-500/10 text-blue-700 dark:border-blue-900 dark:text-blue-300",
  REFERRAL: "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900 dark:text-green-300",
  LINKEDIN: "border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300",
  API: "border-cyan-200 bg-cyan-500/10 text-cyan-700 dark:border-cyan-900 dark:text-cyan-300",
};
const statusStyles: Record<ContactStatus, string> = {
  ACTIVE: "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900 dark:text-green-300",
  INACTIVE: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300",
  ARCHIVED: "border-red-200 bg-red-500/10 text-red-700 dark:border-red-900 dark:text-red-300",
};

export function ContactAvatar({ name, src, small = false }: { name: string; src?: string | null; small?: boolean }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Avatar size={small ? "sm" : "default"}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

export function SourceBadge({ source }: { source: ContactSource }) {
  return (
    <Badge variant="outline" className={sourceStyles[source]}>
      {source.replaceAll("_", " ")}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function SortableHeader({ column, label }: { column: Column<ContactRow>; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
    </button>
  );
}

export function getContactsColumns({
  onEdit,
  onArchive,
}: {
  onEdit: (contact: ContactRow) => void;
  onArchive: (contact: ContactRow) => void;
}): ColumnDef<ContactRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all contacts on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.firstName} ${row.original.lastName}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
      enableSorting: false,
    },
    {
      id: "name",
      accessorFn: (contact) => `${contact.firstName} ${contact.lastName}`,
      header: ({ column }) => <SortableHeader column={column} label="Name" />,
      cell: ({ row }) => {
        const contact = row.original;
        const name = `${contact.firstName} ${contact.lastName}`.trim();
        return (
          <Link
            href={`/dashboard/contacts/${encodeURIComponent(contact.id)}`}
            className="flex items-center gap-2 font-medium text-foreground hover:underline"
          >
            <ContactAvatar name={name} src={contact.avatarUrl} />
            <span className="max-w-48 truncate">{name}</span>
          </Link>
        );
      },
    },
    {
      id: "email",
      accessorFn: (contact) => contact.email ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Email" />,
      cell: ({ row }) =>
        row.original.email ? (
          <a href={`mailto:${row.original.email}`} className="hover:underline">
            {row.original.email}
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "company",
      accessorFn: (contact) => contact.company?.name ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Company" />,
      cell: ({ row }) =>
        row.original.company ? (
          <Link
            href={`/dashboard/companies/${encodeURIComponent(row.original.company.id)}`}
            className="hover:underline"
          >
            {row.original.company.name}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "jobTitle",
      accessorFn: (contact) => contact.jobTitle ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Job Title" />,
      cell: ({ row }) => row.original.jobTitle || "—",
    },
    {
      id: "phone",
      accessorFn: (contact) => contact.phone ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Phone" />,
      cell: ({ row }) =>
        row.original.phone ? (
          <a href={`tel:${row.original.phone}`} className="hover:underline">
            {row.original.phone}
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "source",
      accessorFn: (contact) => contact.source,
      header: ({ column }) => <SortableHeader column={column} label="Source" />,
      cell: ({ row }) => <SourceBadge source={row.original.source} />,
    },
    {
      id: "status",
      accessorFn: (contact) => contact.status,
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "owner",
      accessorFn: (contact) => contact.owner?.name ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Owner" />,
      cell: ({ row }) =>
        row.original.owner ? (
          <span className="flex items-center gap-2">
            <ContactAvatar name={row.original.owner.name} src={row.original.owner.avatarUrl} small />
            {row.original.owner.name}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${row.original.firstName} ${row.original.lastName}`}
              />
            }
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem render={<Link href={`/dashboard/contacts/${encodeURIComponent(row.original.id)}`} />}>
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onArchive(row.original)}>
              <Trash2 aria-hidden="true" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
    },
  ];
}
