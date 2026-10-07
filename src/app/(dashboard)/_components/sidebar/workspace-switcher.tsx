"use client";

import { useEffect, useState } from "react";

import { Check, ChevronDown, Plus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: string;
  isDefault: boolean;
};

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/workspaces", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { workspaces?: WorkspaceRow[] }) => {
        if (mounted) setWorkspaces(body.workspaces ?? []);
      })
      .catch(() => {
        if (mounted) setError("Unable to load workspaces.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const active = workspaces.find((workspace) => workspace.isDefault) ?? workspaces[0];

  async function switchTo(workspaceId: string) {
    if (workspaceId === active?.id || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/workspaces/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error("Unable to switch workspace.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to switch workspace.");
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create workspace.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create workspace.");
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2 py-2 group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:p-1"
            />
          }
        >
          <Avatar className="size-8 rounded-lg">
            {active?.logoUrl && <AvatarImage src={active.logoUrl} alt="" />}
            <AvatarFallback className="rounded-lg">{active?.name.slice(0, 2).toUpperCase() ?? "W"}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
            {active?.name ?? "Create workspace"}
          </span>
          <ChevronDown className="size-4 group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" side="bottom" align="start">
          {workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} onClick={() => void switchTo(workspace.id)} disabled={busy}>
              <Avatar className="size-7 rounded-md">
                {workspace.logoUrl && <AvatarImage src={workspace.logoUrl} alt="" />}
                <AvatarFallback>{workspace.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {workspace.id === active?.id && <Check className="size-4" aria-label="Active" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Create Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && !open && (
        <p role="alert" className="px-2 text-destructive text-xs">
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>Set a name and a unique URL slug.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSlug(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
                }}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspace-slug">Slug</Label>
              <Input
                id="workspace-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create Workspace"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
