"use client";

import { Download, Grid2X2, LoaderCircle, Plus, Rows3, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ContactFormSheet } from "./contact-form-sheet";
import type { ContactOwner, ContactRow, ContactSource, ContactStatus } from "./contacts-columns";

const statusOptions: { value: ContactStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];
const sourceOptions: { value: ContactSource; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "IMPORT", label: "Import" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "API", label: "API" },
];

function MultiFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-40">
        {options.map(({ value, label: optionLabel }) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={selected.includes(value)}
            closeOnClick={false}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, value] : selected.filter((item) => item !== value))
            }
          >
            {optionLabel}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContactsToolbar({
  search,
  onSearchChange,
  statuses,
  onStatusesChange,
  sources,
  onSourcesChange,
  ownerId,
  onOwnerChange,
  owners,
  view,
  onViewChange,
  onExport,
  exporting,
  selectedCount,
  onArchiveSelected,
  sheetOpen,
  onSheetOpenChange,
  editingContact,
  onSaved,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statuses: ContactStatus[];
  onStatusesChange: (values: ContactStatus[]) => void;
  sources: ContactSource[];
  onSourcesChange: (values: ContactSource[]) => void;
  ownerId: string | null;
  onOwnerChange: (value: string | null) => void;
  owners: ContactOwner[];
  view: "table" | "grid";
  onViewChange: (value: "table" | "grid") => void;
  onExport: () => void;
  exporting: boolean;
  selectedCount: number;
  onArchiveSelected: () => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  editingContact: ContactRow | null;
  onSaved: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-72">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search contacts"
            placeholder="Search name or email…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
          />
        </div>
        <MultiFilter label="Status" options={statusOptions} selected={statuses} onChange={onStatusesChange} />
        <MultiFilter label="Source" options={sourceOptions} selected={sources} onChange={onSourcesChange} />
        <Select value={ownerId ?? "all"} onValueChange={(value) => onOwnerChange(value === "all" ? null : value)}>
          <SelectTrigger aria-label="Filter by owner" className="min-w-32">
            <SelectValue>
              {ownerId ? (owners.find((owner) => owner.id === ownerId)?.name ?? "Owner") : "All owners"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <fieldset className="flex rounded-lg ring-1 ring-foreground/10">
          <legend className="sr-only">Contact view</legend>
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Table view"
            aria-pressed={view === "table"}
            onClick={() => onViewChange("table")}
          >
            <Rows3 aria-hidden="true" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            <Grid2X2 aria-hidden="true" />
          </Button>
        </fieldset>
        <Button variant="outline" size="sm" disabled={exporting} onClick={onExport}>
          {exporting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
          Export CSV
        </Button>
        <Button size="sm" onClick={() => onSheetOpenChange(true)}>
          <Plus aria-hidden="true" /> Add Contact
        </Button>
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
          <span>{selectedCount} selected</span>
          <Button variant="destructive" size="sm" onClick={onArchiveSelected}>
            Archive selected
          </Button>
        </div>
      )}
      <ContactFormSheet
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
        contact={editingContact ?? undefined}
        onSaved={onSaved}
      />
    </>
  );
}
