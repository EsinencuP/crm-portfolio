"use client";

import { useCallback, useEffect, useState } from "react";

import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EntityType = "Contact" | "Deal" | "Company";
type Level = "VIEW" | "EDIT" | "FULL";
type Person = { id: string; name: string; email: string; avatarUrl?: string | null; role?: string };
type Grant = { id: string; userId: string; permission: Level | "NONE"; user: Person };

export function ShareDialog({
  entityType,
  entityId,
  isOpen,
  onClose,
}: {
  entityType: EntityType;
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [level, setLevel] = useState<Level>("VIEW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const query = new URLSearchParams({ entityType, entityId });
    const [permissionsResponse, membersResponse] = await Promise.all([
      fetch(`/api/permissions?${query}`, { cache: "no-store" }),
      fetch("/api/team-members", { cache: "no-store" }),
    ]);
    if (!permissionsResponse.ok || !membersResponse.ok) throw new Error("Unable to load sharing settings.");
    const permissionsBody: { permissions: Grant[] } = await permissionsResponse.json();
    const membersBody: { members: Person[] } = await membersResponse.json();
    setGrants(permissionsBody.permissions);
    setMembers(membersBody.members);
  }, [entityType, entityId]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void refresh().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load sharing settings.");
    });
    return () => {
      active = false;
    };
  }, [isOpen, refresh]);

  async function shareGrant(userId: string, permission: Level) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, userId, permission }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to share record.");
      await refresh();
      setSelected(null);
      toast.success("Access updated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to share record.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(permissionId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/permissions?id=${encodeURIComponent(permissionId)}`, { method: "DELETE" });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to remove access.");
      await refresh();
      toast.success("Access removed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {entityType.toLowerCase()}</DialogTitle>
          <DialogDescription>Give workspace members access to this record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-4">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <fieldset className="max-h-56 space-y-2 overflow-y-auto">
            <legend className="sr-only">People with access</legend>
            {grants.length === 0 && <p className="text-muted-foreground text-sm">No explicit permissions yet.</p>}
            {grants.map((grant) => (
              <div key={grant.id} className="flex items-center gap-2">
                <Avatar className="size-8">
                  {grant.user.avatarUrl && <AvatarImage src={grant.user.avatarUrl} alt="" />}
                  <AvatarFallback>{grant.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{grant.user.name}</p>
                  <p className="truncate text-muted-foreground text-xs">{grant.user.email}</p>
                </div>
                <Select
                  value={grant.permission}
                  onValueChange={(value) => value && void shareGrant(grant.userId, value as Level)}
                >
                  <SelectTrigger aria-label={`Access for ${grant.user.name}`} className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["VIEW", "EDIT", "FULL"] as const).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(grant.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </fieldset>
          <div className="border-t pt-4">
            <p className="mb-2 font-medium text-sm">Add person</p>
            <Command className="h-auto rounded-md border">
              <CommandInput placeholder="Search team members…" />
              <CommandList className="max-h-36">
                <CommandEmpty>No team member found.</CommandEmpty>
                {members
                  .filter((person) => !grants.some((grant) => grant.userId === person.id))
                  .map((person) => (
                    <CommandItem
                      key={person.id}
                      value={`${person.name} ${person.email}`}
                      onSelect={() => {
                        setSelected(person);
                        if (person.role === "VIEWER") setLevel("VIEW");
                      }}
                    >
                      <span className="flex-1 truncate">
                        {person.name} <span className="text-muted-foreground">{person.email}</span>
                      </span>
                    </CommandItem>
                  ))}
              </CommandList>
            </Command>
            {selected && <p className="mt-2 text-sm">Selected: {selected.name}</p>}
            <div className="mt-3 flex items-center gap-2">
              <Select value={level} onValueChange={(value) => value && setLevel(value as Level)}>
                <SelectTrigger aria-label="Permission level" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["VIEW", "EDIT", "FULL"] as const)
                    .filter((option) => selected?.role !== "VIEWER" || option === "VIEW")
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button disabled={!selected || busy} onClick={() => selected && void shareGrant(selected.id, level)}>
                Share
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShareButton({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 aria-hidden="true" /> Share
      </Button>
      <ShareDialog entityType={entityType} entityId={entityId} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
