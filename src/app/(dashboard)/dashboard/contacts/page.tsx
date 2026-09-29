"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  functionalUpdate,
  getCoreRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import {
  type ContactOwner,
  type ContactRow,
  type ContactSource,
  type ContactStatus,
  getContactsColumns,
} from "./_components/contacts-columns";
import { ContactsTable } from "./_components/contacts-table";
import { ContactsToolbar } from "./_components/contacts-toolbar";

type ContactsResponse = {
  contacts: ContactRow[];
  total: number;
  page: number;
  totalPages: number;
  owners: ContactOwner[];
};
type Filters = { search: string; statuses: ContactStatus[]; sources: ContactSource[]; ownerId: string | null };

function contactParams(filters: Filters, page: number, limit: number, sorting: SortingState) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.sources.length) params.set("source", filters.sources.join(","));
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (sorting[0]) {
    params.set("sortBy", sorting[0].id);
    params.set("sortOrder", sorting[0].desc ? "desc" : "asc");
  }
  return params;
}

async function getContacts(params: URLSearchParams, signal?: AbortSignal): Promise<ContactsResponse> {
  const response = await fetch(`/api/contacts?${params}`, { signal, cache: "no-store" });
  if (!response.ok)
    throw new Error(
      response.status === 401 ? "Your session has expired. Please sign in again." : "Unable to load contacts.",
    );
  return response.json() as Promise<ContactsResponse>;
}

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  const firstVisible = [...text].find((character) => character.trim() !== "" && character.charCodeAt(0) >= 32);
  if (firstVisible && "=+-@".includes(firstVisible)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default function ContactsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ContactStatus[]>([]);
  const [sources, setSources] = useState<ContactSource[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "grid">("table");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [owners, setOwners] = useState<ContactOwner[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ContactRow | null>(null);
  const [archiveSelected, setArchiveSelected] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const filters = useMemo(() => ({ search, statuses, sources, ownerId }), [search, statuses, sources, ownerId]);
  const params = useMemo(
    () => contactParams(filters, pagination.pageIndex + 1, pagination.pageSize, sorting),
    [filters, pagination, sorting],
  );
  const query = useQuery({
    queryKey: ["contacts", session?.user.id, params.toString()],
    queryFn: ({ signal }) => getContacts(params, signal),
    enabled: sessionStatus === "authenticated",
    retry: false,
  });

  useEffect(() => {
    if (query.data?.owners) setOwners(query.data.owners);
  }, [query.data?.owners]);

  useEffect(() => {
    if (!query.data) return;
    const maxPageIndex = Math.max(0, query.data.totalPages - 1);
    if (pagination.pageIndex <= maxPageIndex) return;
    setPagination((current) => ({ ...current, pageIndex: maxPageIndex }));
  }, [query.data, pagination.pageIndex]);

  const openEdit = useCallback((contact: ContactRow) => {
    setEditingContact(contact);
    setSheetOpen(true);
  }, []);
  const openArchive = useCallback((contact: ContactRow) => setArchiveTarget(contact), []);
  const columns = useMemo(
    () => getContactsColumns({ onEdit: openEdit, onArchive: openArchive }),
    [openEdit, openArchive],
  );

  const table = useReactTable({
    data: query.data?.contacts ?? [],
    columns,
    defaultColumn: { sortDescFirst: false },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: query.data?.totalPages ?? 0,
    state: { pagination, sorting, rowSelection },
    onPaginationChange: (updater) => setPagination((current) => functionalUpdate(updater, current)),
    onSortingChange: (updater) => {
      setSorting((current) => functionalUpdate(updater, current));
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      setRowSelection({});
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  function resetFilters() {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setRowSelection({});
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) setEditingContact(null);
  }

  async function archiveContacts() {
    let ids: string[] = [];
    if (archiveSelected)
      ids = Object.entries(rowSelection)
        .filter(([, checked]) => checked)
        .map(([id]) => id);
    else if (archiveTarget) ids = [archiveTarget.id];
    if (!ids.length) return;
    setArchiving(true);
    try {
      for (const id of ids) {
        const response = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Unable to archive contacts. Please try again.");
      }
      toast.success(ids.length === 1 ? "Contact archived" : `${ids.length} contacts archived`);
      setRowSelection({});
      setArchiveTarget(null);
      setArchiveSelected(false);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to archive contacts.");
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } finally {
      setArchiving(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const rows: ContactRow[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const result = await getContacts(contactParams(filters, page, 100, sorting));
        rows.push(...result.contacts);
        totalPages = result.totalPages;
        page += 1;
      }
      const header = ["First Name", "Last Name", "Email", "Company", "Job Title", "Phone", "Source", "Status", "Owner"];
      const lines = [
        header.map(csvCell).join(","),
        ...rows.map((contact) =>
          [
            contact.firstName,
            contact.lastName,
            contact.email,
            contact.company?.name,
            contact.jobTitle,
            contact.phone,
            contact.source,
            contact.status,
            contact.owner?.name,
          ]
            .map(csvCell)
            .join(","),
        ),
      ];
      const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "contacts.csv";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`${rows.length} contacts exported`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export contacts.");
    } finally {
      setExporting(false);
    }
  }

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const dialogOpen = archiveTarget !== null || archiveSelected;

  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">
          Contacts{" "}
          <span className="font-normal text-base text-muted-foreground tabular-nums">
            {query.data ? `(${query.data.total})` : ""}
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">Manage the people in your CRM.</p>
      </div>

      <ContactsToolbar
        search={searchInput}
        onSearchChange={(value) => {
          setSearchInput(value);
          resetFilters();
        }}
        statuses={statuses}
        onStatusesChange={(values) => {
          setStatuses(values);
          resetFilters();
        }}
        sources={sources}
        onSourcesChange={(values) => {
          setSources(values);
          resetFilters();
        }}
        ownerId={ownerId}
        onOwnerChange={(value) => {
          setOwnerId(value);
          resetFilters();
        }}
        owners={owners}
        view={view}
        onViewChange={setView}
        onExport={exportCsv}
        exporting={exporting}
        selectedCount={selectedCount}
        onArchiveSelected={() => setArchiveSelected(true)}
        sheetOpen={sheetOpen}
        onSheetOpenChange={handleSheetOpenChange}
        editingContact={editingContact}
        onSaved={() => {
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      />

      {query.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm"
        >
          <span>{query.error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ContactsTable
          table={table}
          view={view}
          loading={sessionStatus === "loading" || query.isLoading}
          fetching={query.isFetching}
          total={query.data?.total ?? 0}
          onEdit={openEdit}
          onArchive={openArchive}
        />
      )}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !archiving) {
            setArchiveTarget(null);
            setArchiveSelected(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveSelected ? `${selectedCount} contacts` : "contact"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived contacts are hidden from the default list. You can restore them later by changing their status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={archiving} onClick={archiveContacts}>
              {archiving ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
