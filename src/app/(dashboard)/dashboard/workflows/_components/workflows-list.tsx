"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { entities, triggers } from "@/lib/workflows/config";
import { triggerLabel, workflowRequest, workflowWrite } from "@/lib/workflows/editor";

import { EditorSelect } from "../[id]/_components/node-editor-context";

type ListItem = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  runCount: number;
  lastRunAt: string | null;
  updatedAt: string;
};
export function WorkflowsList({ workspaceId, onOpen }: { workspaceId: string; onOpen?: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("CONTACT_CREATED");
  const [entityType, setEntityType] = useState<string>("Contact");
  const [entityId, setEntityId] = useState("");
  const [interval, setInterval] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const query = useQuery<{ workflows: ListItem[]; total: number }>({
    queryKey: ["workflows", workspaceId, page],
    queryFn: () => workflowRequest(`/api/workflows?page=${page}`),
  });
  const navigate = (id: string) => {
    if (onOpen) onOpen(id);
    else window.location.assign(`/dashboard/workflows/${encodeURIComponent(id)}`);
  };
  const toggle = async (item: ListItem) => {
    setBusy(item.id);
    setError("");
    try {
      await workflowRequest(
        `/api/workflows/${item.id}`,
        workflowWrite("PATCH", { isActive: !item.isActive, updatedAt: item.updatedAt }),
      );
      await query.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to change workflow.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <GitBranch />
              Workflows
            </CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              Automate CRM follow-ups with connected steps and branches.
            </p>
          </div>
          <Button
            onClick={() => {
              setOpen(true);
              setError("");
            }}
          >
            + Create Workflow
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          {query.isPending && <p role="status">Loading workflows…</p>}
          {query.error && (
            <p role="alert">
              {query.error.message}{" "}
              <Button variant="outline" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Run count</TableHead>
                <TableHead>Last run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.workflows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Button variant="link" onClick={() => navigate(item.id)}>
                      {item.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{triggerLabel(item.trigger)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Activate ${item.name}`}
                      checked={item.isActive}
                      disabled={Boolean(busy)}
                      onCheckedChange={() => void toggle(item)}
                    />
                  </TableCell>
                  <TableCell>{item.runCount}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.data?.total === 0 && (
            <p className="py-8 text-center text-muted-foreground">No workflows yet. Create your first automation.</p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="self-center text-sm">Page {page}</span>
            <Button
              variant="outline"
              disabled={!query.data || page * 25 >= query.data.total || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              New workflows start paused with a one-minute Wait step. Configure the graph before activating it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy("create");
              setError("");
              void workflowRequest(
                "/api/workflows",
                workflowWrite("POST", {
                  name,
                  trigger,
                  isActive: false,
                  triggerConfig:
                    trigger === "SCHEDULED"
                      ? { conditions: [], entityType, entityId, intervalMinutes: interval }
                      : { conditions: [] },
                  steps: [{ type: "WAIT", config: { duration: 60 } }],
                }),
              )
                .then(({ workflow }) => navigate(workflow.id))
                .catch((error: Error) => setError(error.message))
                .finally(() => setBusy(null));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <EditorSelect
              label="Trigger"
              value={trigger}
              options={triggers.map((value) => ({ value, label: triggerLabel(value) }))}
              onChange={setTrigger}
            />
            {trigger === "SCHEDULED" && (
              <>
                <EditorSelect
                  label="Entity type"
                  value={entityType}
                  options={entities.map((value) => ({ value, label: value }))}
                  onChange={setEntityType}
                />
                <div className="space-y-2">
                  <Label htmlFor="schedule-entity">Entity ID</Label>
                  <Input
                    id="schedule-entity"
                    required
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-interval">Interval (minutes)</Label>
                  <Input
                    id="schedule-interval"
                    type="number"
                    required
                    min={1}
                    max={43200}
                    value={interval}
                    onChange={(event) => setInterval(Number(event.target.value))}
                  />
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={Boolean(busy)}>
              {busy ? "Creating…" : "Create workflow"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
