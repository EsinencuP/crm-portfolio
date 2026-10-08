"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Package, Pencil, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductList, ProductRow } from "@/lib/validations/product";

import { ProductFormSheet } from "./product-form-sheet";

const emptyProducts: ProductRow[] = [];
function ariaSort(value: false | "asc" | "desc") {
  if (!value) return undefined;
  return value === "asc" ? "ascending" : "descending";
}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Catalog request failed.");
  return body;
}
export function ProductsCatalog({
  workspaceId,
  canWrite,
  defaultCurrency = "USD",
}: {
  workspaceId: string;
  canWrite: boolean;
  defaultCurrency?: string;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = useState<ProductRow | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((value) => ({ ...value, pageIndex: 0 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery<ProductList>({
    queryKey: ["products", workspaceId, pagination, debouncedSearch, category, status, sorting],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(pagination.pageIndex + 1),
        limit: String(pagination.pageSize),
        search: debouncedSearch,
        sortBy: sorting[0]?.id ?? "name",
        sortOrder: sorting[0]?.desc ? "desc" : "asc",
      });
      if (category !== null) params.set("category", category);
      if (status !== "all") params.set("isActive", status);
      return request(`/api/products?${params}`, { signal });
    },
  });
  useEffect(() => {
    if (query.data && query.data.totalPages < pagination.pageIndex + 1 && pagination.pageIndex > 0)
      setPagination((value) => ({ ...value, pageIndex: Math.max(0, (query.data?.totalPages ?? 1) - 1) }));
  }, [query.data, pagination.pageIndex]);
  const mutate = useCallback(
    async (product: ProductRow, action: "toggle" | "delete") => {
      setBusy(product.id);
      setError("");
      setNotice("");
      try {
        await request(`/api/products/${encodeURIComponent(product.id)}`, {
          method: action === "delete" ? "DELETE" : "PATCH",
          ...(action === "toggle"
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !product.isActive, updatedAt: product.updatedAt }),
              }
            : {}),
        });
        if (action === "delete") setDeleting(null);
        setNotice(
          action === "delete"
            ? "Product removed from the catalog. Its stored record and SKU are retained."
            : "Product status updated.",
        );
        await query.refetch();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unable to update product.");
      } finally {
        setBusy(null);
      }
    },
    [query.refetch],
  );
  const columns = useMemo<ColumnDef<ProductRow>[]>(() => {
    const sortHeader =
      (label: string) =>
      ({
        column,
      }: {
        column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
      }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {label}
          <ArrowUpDown className="size-3.5" />
        </Button>
      );
    return [
      {
        accessorKey: "name",
        header: sortHeader("Name"),
        cell: ({ row }) => (
          <div className="max-w-64">
            <p className="truncate font-medium" title={row.original.name}>
              {row.original.name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "sku",
        header: sortHeader("SKU"),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku ?? "—"}</span>,
      },
      {
        accessorKey: "unitPrice",
        header: sortHeader("Unit Price"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: row.original.currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(row.original.unitPrice))}
          </span>
        ),
      },
      { accessorKey: "unit", header: sortHeader("Unit") },
      {
        accessorKey: "category",
        header: sortHeader("Category"),
        cell: ({ row }) =>
          row.original.category ? (
            <Badge variant="outline">{row.original.category}</Badge>
          ) : (
            <span className="text-muted-foreground">Uncategorized</span>
          ),
      },
      {
        accessorKey: "isActive",
        header: "Active",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Switch
              aria-label={`Active ${row.original.name}`}
              checked={row.original.isActive}
              disabled={!canWrite || Boolean(busy)}
              onCheckedChange={() => void mutate(row.original, "toggle")}
            />
            <span className="text-xs">{row.original.isActive ? "Active" : "Inactive"}</span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) =>
          canWrite ? (
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit ${row.original.name}`}
                disabled={Boolean(busy)}
                onClick={() => {
                  setEditing(row.original);
                  setSheetOpen(true);
                }}
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${row.original.name}`}
                disabled={Boolean(busy)}
                onClick={() => {
                  setDeleting(row.original);
                  setError("");
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Read-only</span>
          ),
      },
    ];
  }, [canWrite, busy, mutate]);
  const table = useReactTable({
    data: query.data?.products ?? emptyProducts,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.max(1, query.data?.totalPages ?? 1),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: (value) => {
      setSorting(value);
      setPagination((pagination) => ({ ...pagination, pageIndex: 0 }));
    },
    enableMultiSort: false,
  });
  const categories = [...new Set([...(query.data?.categories ?? []), ...(category === null ? [] : [category])])];
  const statusLabel = ({ all: "All products", true: "Active", false: "Inactive" } as Record<string, string>)[status];
  let emptyMessage = "No products match your filters.";
  if (query.error) emptyMessage = "Catalog could not be loaded. Use Refresh to try again.";
  if (query.isPending) emptyMessage = "Loading products…";
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-2xl">
            <Package aria-hidden="true" className="size-6" />
            Products
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Maintain your company’s reusable product and service catalog.
          </p>
        </div>
        {canWrite && (
          <Button
            disabled={Boolean(busy)}
            onClick={() => {
              setEditing(undefined);
              setSheetOpen(true);
            }}
          >
            + Add Product
          </Button>
        )}
      </header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="product-search">Search</Label>
          <Input
            id="product-search"
            type="search"
            placeholder="Search by name or SKU…"
            maxLength={120}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="product-category-filter">Category</Label>
          <Select
            value={category === null ? "all" : `category:${category}`}
            onValueChange={(value) => {
              if (value !== null) {
                setCategory(value === "all" ? null : String(value).slice(9));
                setPagination((value) => ({ ...value, pageIndex: 0 }));
              }
            }}
          >
            <SelectTrigger id="product-category-filter" className="w-full">
              <SelectValue>{category ?? "All categories"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((name) => (
                <SelectItem key={name} value={`category:${name}`}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-40">
          <Label htmlFor="product-status-filter">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) {
                setStatus(String(value));
                setPagination((value) => ({ ...value, pageIndex: 0 }));
              }
            }}
          >
            <SelectTrigger id="product-status-filter" className="w-full">
              <SelectValue>{statusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {query.error && (
        <p role="alert" className="text-destructive text-sm">
          {query.error.message}
        </p>
      )}
      <div className="min-w-0 rounded-xl ring-1 ring-foreground/10" aria-busy={query.isFetching}>
        <Table className="min-w-[900px]">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    aria-sort={ariaSort(header.column.getIsSorted())}
                    className="px-4"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          {query.data?.total ?? 0} products · Page {pagination.pageIndex + 1} of{" "}
          {Math.max(1, query.data?.totalPages ?? 1)}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => {
              if (value) table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger aria-label="Rows per page">
              <SelectValue>{pagination.pageSize} rows</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[20, 50, 100].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!table.getCanPreviousPage() || query.isFetching}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!table.getCanNextPage() || query.isFetching}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
      <ProductFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={editing}
        workspaceId={workspaceId}
        defaultCurrency={defaultCurrency}
        onSaved={setNotice}
      />
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!busy && !value) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              {deleting?.name} will disappear from the catalog. The stored record and its SKU remain reserved.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => {
                if (deleting) void mutate(deleting, "delete");
              }}
            >
              {busy ? "Deleting…" : "Delete product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
