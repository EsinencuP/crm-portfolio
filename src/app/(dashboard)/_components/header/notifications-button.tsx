"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type NotificationRow, notificationHref, notificationIcons } from "@/lib/notification-ui";

export function NotificationsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!response.ok) return;
      const data: { count: number } = await response.json();
      setCount(data.count);
    } catch {
      // The next poll or focus event will retry; the bell remains usable.
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications?limit=10", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load notifications.");
      const data: { notifications: NotificationRow[] } = await response.json();
      setNotifications(data.notifications);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 30_000);
    const onFocus = () => void refreshCount();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("crm:notifications-changed", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("crm:notifications-changed", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshCount]);

  async function markAll() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("Unable to mark notifications as read.");
      setCount(0);
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      window.dispatchEvent(new Event("crm:notifications-changed"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to mark notifications as read.");
    }
  }

  async function openNotification(notification: NotificationRow) {
    if (!notification.read) {
      try {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notification.id] }),
        });
        if (!response.ok) throw new Error("Unable to mark notification as read.");
        setCount((value) => Math.max(0, value - 1));
        setNotifications((items) =>
          items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
        );
        window.dispatchEvent(new Event("crm:notifications-changed"));
      } catch {
        toast.error("Unable to mark notification as read.");
      }
    }
    setOpen(false);
    router.push(notificationHref(notification.link));
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          void loadRecent();
          void refreshCount();
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-11"
            aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
          />
        }
      >
        <Bell aria-hidden="true" />
        {count > 0 && (
          <Badge
            aria-hidden="true"
            className="absolute top-0 right-0 h-4 min-w-4 bg-destructive px-1 text-[10px] text-white"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <DropdownMenuLabel className="px-0 text-foreground text-sm">Notifications</DropdownMenuLabel>
          <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => void markAll()}>
            Mark all as read
          </Button>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80 max-h-[60vh]">
          {loading && <p className="px-3 py-6 text-center text-muted-foreground text-sm">Loading…</p>}
          {!loading && error && (
            <p role="alert" className="px-3 py-6 text-center text-destructive text-sm">
              {error}
            </p>
          )}
          {!loading && !error && notifications.length === 0 && (
            <p className="px-3 py-8 text-center text-muted-foreground text-sm">No notifications yet.</p>
          )}
          {!loading &&
            !error &&
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="items-start gap-3 p-3"
                onClick={() => void openNotification(notification)}
              >
                <span aria-hidden="true" className="text-lg">
                  {notificationIcons[notification.type]}
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className={notification.read ? "text-sm" : "font-semibold text-sm"}>{notification.title}</span>
                  {notification.body && (
                    <span className="line-clamp-2 text-muted-foreground text-xs">{notification.body}</span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </span>
                </span>
                {!notification.read && (
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            ))}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            router.push("/dashboard/notifications");
          }}
        >
          View all notifications
        </DropdownMenuItem>
        <p role="status" className="sr-only">
          {count} unread notifications
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
