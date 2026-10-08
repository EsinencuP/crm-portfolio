"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { workflowRequest } from "@/lib/workflows/editor";

type Run = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  entityType: string;
  entityId: string | null;
  status: string;
  logs: { step?: number; action?: string; result?: unknown }[];
  error: string | null;
};
export function WorkflowRunLog({ workflowId, workspaceId }: { workflowId: string; workspaceId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery<{ runs: Run[]; total: number }>({
    queryKey: ["workflow-runs", workspaceId, workflowId, page],
    queryFn: () => workflowRequest(`/api/workflows/${workflowId}/runs?page=${page}`),
    refetchInterval: 5000,
  });
  return (
    <section aria-label="Workflow run history" className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Run history</h2>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      {query.isPending && <p role="status">Loading runs…</p>}
      {query.error && (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Steps completed</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data?.runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="whitespace-nowrap">{new Date(run.startedAt).toLocaleString()}</TableCell>
              <TableCell className="max-w-48 break-all">
                {run.entityType}: {run.entityId ?? "Restricted record"}
              </TableCell>
              <TableCell>
                <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>{run.status}</Badge>
              </TableCell>
              <TableCell>
                {run.logs.filter((log) => log.action !== "FAILED" && log.result !== "external-started").length}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {Math.max(
                  0,
                  Math.round(
                    ((run.completedAt ? new Date(run.completedAt).getTime() : Date.now()) -
                      new Date(run.startedAt).getTime()) /
                      1000,
                  ),
                )}{" "}
                s{!run.completedAt && !["FAILED", "COMPLETED", "CANCELLED"].includes(run.status) ? " (running)" : ""}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal break-words text-destructive text-xs">
                {run.error ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {query.data?.runs.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">
          No runs yet. Activate the workflow and trigger a matching CRM event.
        </p>
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
    </section>
  );
}
