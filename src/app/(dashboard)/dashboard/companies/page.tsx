"use client";

import { useEffect, useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  functionalUpdate,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";

import { type CompanyRow, getCompaniesColumns } from "./_components/companies-columns";
import { CompaniesTable } from "./_components/companies-table";
import { CompanyFormSheet } from "./_components/company-form-sheet";

type ResponseData = { companies: CompanyRow[]; total: number; totalPages: number; page: number };

export default function CompaniesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [deleting, setDeleting] = useState<CompanyRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);
  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(pagination.pageIndex + 1), limit: String(pagination.pageSize) });
    if (search.trim()) p.set("search", search.trim());
    if (industry.trim()) p.set("industry", industry.trim());
    if (size.trim()) p.set("size", size.trim());
    if (sorting[0]) {
      p.set("sortBy", sorting[0].id);
      p.set("sortOrder", sorting[0].desc ? "desc" : "asc");
    }
    return p;
  }, [pagination, search, industry, size, sorting]);
  const query = useQuery({
    queryKey: ["companies", session?.user.id, params.toString()],
    queryFn: async ({ signal }): Promise<ResponseData> => {
      const response = await fetch(`/api/companies?${params}`, { signal, cache: "no-store" });
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "Your session has expired. Please sign in again." : "Unable to load companies.",
        );
      return response.json();
    },
    enabled: sessionStatus === "authenticated",
    retry: false,
  });
  useEffect(() => {
    if (query.data && pagination.pageIndex >= query.data.totalPages && pagination.pageIndex > 0)
      setPagination((current) => ({ ...current, pageIndex: Math.max(0, query.data.totalPages - 1) }));
  }, [query.data, pagination.pageIndex]);
  const columns = useMemo(
    () =>
      getCompaniesColumns({
        onEdit: (company) => {
          setEditing(company);
          setSheetOpen(true);
        },
        onDelete: setDeleting,
      }),
    [],
  );
  const table = useReactTable({
    data: query.data?.companies ?? [],
    columns,
    defaultColumn: { sortDescFirst: false },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: query.data?.totalPages ?? 0,
    state: { pagination, sorting },
    onPaginationChange: (updater) => setPagination((current) => functionalUpdate(updater, current)),
    onSortingChange: (updater) => {
      setSorting((current) => functionalUpdate(updater, current));
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
  });

  async function deleteCompany() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete company.");
      toast.success("Company deleted");
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete company.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">
            Companies{" "}
            <span className="font-normal text-base text-muted-foreground">
              {query.data ? `(${query.data.total})` : ""}
            </span>
          </h1>
          <p className="text-muted-foreground text-sm">Manage organizations and their CRM relationships.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus aria-hidden="true" /> Add Company
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Search companies"
          placeholder="Search name, domain, industry..."
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
        <Input
          aria-label="Filter by industry"
          placeholder="Filter industry"
          value={industry}
          onChange={(event) => {
            setIndustry(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
        <Input
          aria-label="Filter by size"
          placeholder="Filter size"
          value={size}
          onChange={(event) => {
            setSize(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
      </div>
      {query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm"
        >
          {query.error.message}{" "}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <CompaniesTable
          table={table}
          loading={sessionStatus === "loading" || query.isLoading}
          fetching={query.isFetching}
          total={query.data?.total ?? 0}
        />
      )}
      <CompanyFormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditing(null);
        }}
        company={editing ?? undefined}
        onSaved={() => setPagination((current) => ({ ...current, pageIndex: 0 }))}
      />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The company will be removed. Its contacts, deals and notes will remain, with the company link cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={deleteCompany}>
              {busy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
