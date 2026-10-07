"use client";

import { useCallback, useMemo, useState } from "react";

import type { Role, WorkspaceRole } from "@prisma/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { Copy, LoaderCircle, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  createdAt: string;
};
type InviteRow = { id: string; email: string; role: Role; createdAt: string; expiresAt: string };
type TeamResponse = { users: UserRow[]; invites: InviteRow[]; total: number; page: number; totalPages: number };
const roles: Role[] = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"];

async function getTeam(page: number, search: string, signal: AbortSignal): Promise<TeamResponse> {
  const params = new URLSearchParams({ page: String(page), limit: "20", search });
  const response = await fetch(`/api/users?${params}`, { signal, cache: "no-store" });
  const body: TeamResponse & { error?: string } = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load team members.");
  return body;
}

export function TeamManagement({ currentUserId, currentRole }: { currentUserId: string; currentRole: WorkspaceRole }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["team-users", page, search],
    queryFn: ({ signal }) => getTeam(page, search, signal),
  });

  const changeRole = useCallback(
    async (id: string, role: Role) => {
      setSavingRoleId(id);
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        const body: { error?: string } = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to update role.");
        toast.success("Role updated");
        await queryClient.invalidateQueries({ queryKey: ["team-users"] });
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Unable to update role.");
      } finally {
        setSavingRoleId(null);
      }
    },
    [queryClient],
  );

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setInviteError("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const body: { inviteUrl?: string; error?: string } = await response.json();
      if (!response.ok || !body.inviteUrl) throw new Error(body.error ?? "Unable to create invitation.");
      setInviteUrl(body.inviteUrl);
      toast.success("Invitation link created");
      await queryClient.invalidateQueries({ queryKey: ["team-users"] });
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : "Unable to create invitation.");
    } finally {
      setInviting(false);
    }
  }

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Member",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {row.original.avatarUrl && <AvatarImage src={row.original.avatarUrl} alt="" />}
              <AvatarFallback>{row.original.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="font-medium">
              {row.original.name}
              {row.original.id === currentUserId && <span className="ml-1 text-muted-foreground text-xs">(you)</span>}
            </span>
          </div>
        ),
      },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) =>
          (currentRole === "OWNER" || currentRole === "ADMIN") &&
          row.original.id !== currentUserId &&
          row.original.role !== "OWNER" ? (
            <Select
              value={row.original.role}
              onValueChange={(value) => {
                if (value) void changeRole(row.original.id, value as Role);
              }}
              disabled={savingRoleId === row.original.id}
            >
              <SelectTrigger className="w-35" aria-label={`Role for ${row.original.name}`}>
                <SelectValue>{row.original.role}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary">{row.original.role}</Badge>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: () => (
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">
            Active
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        cell: ({ row }) => format(new Date(row.original.createdAt), "MMM d, yyyy"),
      },
    ],
    [currentRole, currentUserId, savingRoleId, changeRole],
  );
  const table = useReactTable({
    data: query.data?.users ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: query.data?.totalPages ?? 1,
  });
  let inviteButtonLabel = "Create invitation";
  if (inviting) inviteButtonLabel = "Creating…";
  else if (inviteUrl) inviteButtonLabel = "Create new link";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Team & roles</h1>
          <p className="text-muted-foreground">Manage access to your CRM workspace.</p>
        </div>
        <Button
          onClick={() => {
            setInviteOpen(true);
            setInviteUrl("");
            setInviteError("");
          }}
        >
          <Plus className="size-4" /> Invite user
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Team members {query.data && <span className="text-muted-foreground text-sm">({query.data.total})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Search team"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email…"
              className="pl-9"
            />
          </div>
          {query.isError && (
            <p role="alert" className="text-destructive text-sm">
              {query.error.message}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-180">
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {query.isLoading && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      Loading team…
                    </TableCell>
                  </TableRow>
                )}
                {!query.isLoading &&
                  table.getRowModel().rows.length > 0 &&
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!query.isLoading && table.getRowModel().rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                      No team members found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <span>
              Page {page} of {query.data?.totalPages ?? 1}
            </span>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (query.data?.totalPages ?? 1)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {query.data?.invites.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.invites.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.email}</TableCell>
                      <TableCell>{item.role}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {new Date(item.expiresAt) <= new Date() ? "Expired" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(item.createdAt), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No pending invitations.</p>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        Admins can change roles and invite any role. Managers can invite members and viewers. Invitation links expire
        after seven days.
      </p>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              Create a one-time link to share with the new team member. Email delivery is not configured.
            </DialogDescription>
          </DialogHeader>
          <form id="invite-user-form" onSubmit={invite} className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => {
                  if (value) setInviteRole(value as Role);
                }}
              >
                <SelectTrigger aria-label="Invitation role">
                  <SelectValue>{inviteRole}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter(
                      (role) =>
                        currentRole === "OWNER" || currentRole === "ADMIN" || role === "MEMBER" || role === "VIEWER",
                    )
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {inviteUrl && (
              <div className="space-y-1.5">
                <Label htmlFor="invite-link">Invitation link</Label>
                <div className="flex gap-2">
                  <Input id="invite-link" readOnly value={inviteUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy invitation link"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        toast.success("Invitation link copied");
                      } catch {
                        toast.error("Unable to copy link");
                      }
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            )}
            {inviteError && (
              <p role="alert" className="text-destructive text-sm">
                {inviteError}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button type="submit" form="invite-user-form" disabled={inviting}>
              {inviting && <LoaderCircle className="size-4 animate-spin" />}
              {inviteButtonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
