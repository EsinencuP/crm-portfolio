"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyLogo, type CompanyRow } from "../../_components/companies-columns";
import { CompanyFormSheet } from "../../_components/company-form-sheet";

export function CompanyHeader({
  company,
  canEdit,
  canDelete,
}: {
  company: CompanyRow;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(company.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete company.");
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Company deleted");
      setDeleteOpen(false);
      router.push("/dashboard/companies");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete company.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <CompanyLogo name={company.name} src={company.logoUrl} large />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">{company.name}</h1>
                {company.industry && <Badge variant="secondary">{company.industry}</Badge>}
              </div>
              <p className="text-muted-foreground text-sm">{company.domain ?? "Company profile"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {company.website && (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={company.website} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink aria-hidden="true" /> Website
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden="true" /> Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <CompanyFormSheet open={editOpen} onOpenChange={setEditOpen} company={company} onSaved={() => router.refresh()} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {company.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its contacts, deals and notes will remain, with the company link cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
