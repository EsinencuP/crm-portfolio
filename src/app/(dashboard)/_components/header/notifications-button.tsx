"use client";

import { useState } from "react";

import { Bell, CalendarDays, DollarSign, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Preview activities until the notifications data source is added.
const previewActivities = [
  {
    id: "follow-up",
    title: "Follow-up reminder",
    description: "Review your upcoming contact follow-ups.",
    time: "Just now",
    icon: CalendarDays,
  },
  {
    id: "deal",
    title: "Deal activity",
    description: "Recent deal updates will appear here.",
    time: "10 min ago",
    icon: DollarSign,
  },
  {
    id: "team",
    title: "Team activity",
    description: "New team activity will appear here.",
    time: "1 hour ago",
    icon: Users,
  },
] as const;

export function NotificationsButton() {
  const [readIds, setReadIds] = useState<string[]>([]);
  const unreadCount = previewActivities.filter(({ id }) => !readIds.includes(id)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-11"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
          />
        }
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 && (
          <Badge aria-hidden="true" className="absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[10px]">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2 text-foreground text-sm">Notifications</DropdownMenuLabel>
          <p className="px-2 pb-2 text-muted-foreground text-xs">Preview activity</p>
          <DropdownMenuItem
            disabled={unreadCount === 0}
            closeOnClick={false}
            onClick={() => setReadIds(previewActivities.map(({ id }) => id))}
            className="min-h-10"
          >
            Mark all as read
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {previewActivities.map((activity) => (
            <DropdownMenuItem
              key={activity.id}
              closeOnClick={false}
              onClick={() => setReadIds((ids) => (ids.includes(activity.id) ? ids : [...ids, activity.id]))}
              className="items-start gap-3 p-2"
            >
              <activity.icon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="font-medium">{activity.title}</span>
                <span className="text-muted-foreground text-xs">{activity.description}</span>
                <span className="text-muted-foreground text-xs">{activity.time}</span>
              </span>
              {!readIds.includes(activity.id) && (
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <p role="status" className="sr-only">
          {unreadCount} unread notifications
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
