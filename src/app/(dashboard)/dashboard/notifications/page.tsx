"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type NotificationRow, notificationHref, notificationIcons, notificationTypes } from "@/lib/notification-ui";

type ListResponse = { notifications: NotificationRow[]; total: number; page: number; totalPages: number };
const pageSize = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"all" | "unread">("all");
  const [type, setType] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (view === "unread") query.set("unreadOnly", "true");
    if (type !== "all") query.set("type", type);
    return query.toString();
  }, [page, view, type]);
  const notificationsQuery = useQuery({
    queryKey: ["notifications", params],
    queryFn: async ({ signal }): Promise<ListResponse> => {
      const response = await fetch(`/api/notifications?${params}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Unable to load notifications.");
      return response.json() as Promise<ListResponse>;
    },
  });

  async function change(method: "PATCH" | "DELETE", body: { ids: string[] } | { all: true }, key: string) {
    setBusyId(key);
    try {
      const response = await fetch("/api/notifications", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(method === "DELETE" ? "Unable to delete notification." : "Unable to mark as read.");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      window.dispatchEvent(new Event("crm:notifications-changed"));
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Notification action failed.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function openNotification(notification: NotificationRow) {
    if (!notification.read) await change("PATCH", { ids: [notification.id] }, notification.id);
    router.push(notificationHref(notification.link));
  }

  const data = notificationsQuery.data;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Notifications</h1>
          <p className="mt-1 text-muted-foreground text-sm">Updates for your active workspace.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busyId !== null}
          onClick={() => void change("PATCH", { all: true }, "all")}
        >
          <Check aria-hidden="true" /> Mark all as read
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex rounded-lg border p-1">
          <legend className="sr-only">Notification status</legend>
          {(["all", "unread"] as const).map((option) => (
            <Button
              key={option}
              variant={view === option ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === option}
              onClick={() => {
                setView(option);
                setPage(1);
              }}
            >
              {option === "all" ? "All" : "Unread"}
            </Button>
          ))}
        </fieldset>
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Notification type" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {notificationTypes.map((option) => (
              <SelectItem key={option} value={option}>
                {option.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {notificationsQuery.isPending && (
            <p className="p-8 text-center text-muted-foreground text-sm">Loading notifications…</p>
          )}
          {notificationsQuery.isError && (
            <div className="p-8 text-center text-sm">
              <p role="alert">Unable to load notifications.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void notificationsQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {data?.notifications.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-sm">No notifications found.</p>
          )}
          {data?.notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 p-4 ${notification.read ? "" : "bg-primary/5"}`}
            >
              <span aria-hidden="true" className="text-xl">
                {notificationIcons[notification.type]}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => void openNotification(notification)}
              >
                <span className="flex items-center gap-2">
                  <span className={notification.read ? "text-sm" : "font-semibold text-sm"}>{notification.title}</span>
                  {!notification.read && <span title="Unread" className="size-2 rounded-full bg-primary" />}
                </span>
                {notification.body && (
                  <span className="mt-1 block text-muted-foreground text-sm">{notification.body}</span>
                )}
                <time dateTime={notification.createdAt} className="mt-1 block text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </time>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {!notification.read && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Mark ${notification.title} as read`}
                    disabled={busyId !== null}
                    onClick={() => void change("PATCH", { ids: [notification.id] }, notification.id)}
                  >
                    <Check aria-hidden="true" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${notification.title}`}
                  disabled={busyId !== null}
                  onClick={() => void change("DELETE", { ids: [notification.id] }, notification.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
