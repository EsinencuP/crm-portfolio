"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultFields } from "@/lib/forms/config";

type FormRow = {
  id: string;
  name: string;
  slug: string;
  submissionCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export async function formsRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}
export function FormsList({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery<{ forms: FormRow[]; total: number }>({
    queryKey: ["forms", workspaceId, page],
    queryFn: () => formsRequest(`/api/forms?page=${page}`),
  });
  async function create() {
    setBusy("create");
    setError(null);
    try {
      const result = await formsRequest("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, fields: defaultFields }),
      });
      await cache.invalidateQueries({ queryKey: ["forms"] });
      router.push(`/dashboard/forms/${result.form.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to create.");
    } finally {
      setBusy(null);
    }
  }
  async function toggle(form: FormRow) {
    setBusy(form.id);
    setError(null);
    try {
      await formsRequest(`/api/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !form.isActive, updatedAt: form.updatedAt }),
      });
      await cache.invalidateQueries({ queryKey: ["forms"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">Forms</h1>
          <p className="text-muted-foreground text-sm">Capture leads from a public page or your website.</p>
        </div>
        <Button
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          Create form
        </Button>
      </div>
      {(error || query.error) && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? query.error?.message}
        </p>
      )}
      {query.isPending && <p role="status">Loading forms…</p>}
      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Public slug</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>
                    <Link className="font-medium underline underline-offset-4" href={`/dashboard/forms/${form.id}`}>
                      {form.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/forms/${form.slug}`} target="_blank" rel="noopener noreferrer">
                      /forms/{form.slug}
                    </Link>
                  </TableCell>
                  <TableCell>{form.submissionCount}</TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Activate ${form.name}`}
                      checked={form.isActive}
                      disabled={Boolean(busy)}
                      onChange={() => void toggle(form)}
                    />
                  </TableCell>
                  <TableCell>{new Date(form.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query.data.forms.length && (
            <p className="py-10 text-center text-muted-foreground">
              No forms yet. Create your first lead capture form.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm">Page {page}</span>
            <Button variant="outline" disabled={page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create lead capture form</DialogTitle>
            <DialogDescription>Choose a unique public URL. You can customize all fields next.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="form-name">Name</Label>
              <Input
                id="form-name"
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-slug">Slug</Label>
              <Input
                id="form-slug"
                required
                minLength={3}
                maxLength={100}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="contact-us"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={Boolean(busy)}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
