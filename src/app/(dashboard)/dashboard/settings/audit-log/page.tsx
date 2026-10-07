"use client";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { type AuditLogRow, AuditLogTable } from "./_components/audit-log-table";

type AuditResponse = {
  logs: AuditLogRow[];
  total: number;
  page: number;
  totalPages: number;
  users: { id: string; name: string }[];
};
const entityTypes = ["Contact", "Company", "Deal", "Activity", "Note", "Tag", "PipelineStage"] as const;
const actions = ["CREATE", "UPDATE", "DELETE", "EXPORT", "IMPORT", "LOGIN", "LOGOUT"] as const;
const emptyRange: DateRange = { from: undefined, to: undefined };

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("all");
  const [userId, setUserId] = useState("all");
  const [action, setAction] = useState("all");
  const [range, setRange] = useState<DateRange>(emptyRange);
  const limit = 20;
  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (entityType !== "all") query.set("entityType", entityType);
    if (userId !== "all") query.set("userId", userId);
    if (action !== "all") query.set("action", action);
    if (range.from) query.set("dateFrom", format(range.from, "yyyy-MM-dd"));
    if (range.to) query.set("dateTo", format(range.to, "yyyy-MM-dd"));
    return query.toString();
  }, [page, entityType, userId, action, range]);

  const logsQuery = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: async ({ signal }): Promise<AuditResponse> => {
      const response = await fetch(`/api/audit-logs?${params}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load audit log.");
      return response.json() as Promise<AuditResponse>;
    },
  });

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Audit Log</h1>
        <p className="mt-1 text-muted-foreground">A history of CRM changes in the active workspace.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={entityType}
          onValueChange={(value) => {
            setEntityType(value ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Entity type" className="w-40">
            <SelectValue>{entityType === "all" ? "All entity types" : entityType}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={userId}
          onValueChange={(value) => {
            setUserId(value ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="User" className="w-48">
            <SelectValue>
              {userId === "all"
                ? "All users"
                : (logsQuery.data?.users.find((user) => user.id === userId)?.name ?? "User")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {logsQuery.data?.users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={action}
          onValueChange={(value) => {
            setAction(value ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Action" className="w-36">
            <SelectValue>{action === "all" ? "All actions" : action}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          value={range}
          onChange={(value) => {
            setRange(value ?? emptyRange);
            setPage(1);
          }}
        />
        {(range.from ?? range.to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRange(emptyRange);
              setPage(1);
            }}
          >
            Clear dates
          </Button>
        )}
      </div>
      {logsQuery.isError && (
        <p role="alert" className="text-destructive text-sm">
          Unable to load audit log. Please refresh the page.
        </p>
      )}
      <AuditLogTable
        logs={logsQuery.data?.logs ?? []}
        total={logsQuery.data?.total ?? 0}
        page={page}
        limit={limit}
        loading={logsQuery.isPending || logsQuery.isFetching}
        onPageChange={setPage}
      />
    </div>
  );
}
