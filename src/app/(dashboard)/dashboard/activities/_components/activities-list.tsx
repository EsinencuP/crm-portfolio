"use client";

import { useState } from "react";

import Link from "next/link";

import { format, isToday } from "date-fns";
import { CalendarDays, CheckSquare, Mail, Phone, StickyNote, Users } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import type { Activity } from "./activities-calendar";

const icons = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  TASK: CheckSquare,
  NOTE: StickyNote,
  FOLLOW_UP: CalendarDays,
} as const;
const tabs = ["Today", "Upcoming", "Overdue", "Completed"] as const;

export function ActivitiesList({ activities, onChanged }: { activities: Activity[]; onChanged: () => void }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Today");
  const now = new Date();
  const list = activities
    .filter((activity) => {
      if (tab === "Completed") return activity.completed;
      if (activity.completed || !activity.dueDate) return false;
      const date = new Date(activity.dueDate);
      if (tab === "Today") return isToday(date);
      if (tab === "Overdue") return date < now && !isToday(date);
      return date > now && !isToday(date);
    })
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime());

  async function toggle(activity: Activity) {
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(activity.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !activity.completed }),
      });
      if (!response.ok) throw new Error("Unable to update activity.");
      onChanged();
      toast.success(activity.completed ? "Activity reopened" : "Activity completed");
    } catch {
      toast.error("Unable to update activity.");
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Activities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="tablist" aria-label="Activity status" className="flex flex-wrap gap-1">
          {tabs.map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === value}
              key={value}
              className={`rounded-md px-2.5 py-1.5 text-xs ${tab === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="max-h-145 space-y-2 overflow-y-auto">
          {list.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">No {tab.toLowerCase()} activities.</p>
          )}
          {list.map((activity) => {
            const Icon = icons[activity.type];
            return (
              <div key={activity.id} className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  aria-label={`${activity.completed ? "Reopen" : "Complete"} ${activity.title}`}
                  checked={activity.completed}
                  onCheckedChange={() => void toggle(activity)}
                />
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{activity.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {activity.type.replaceAll("_", " ")}
                    {activity.dueDate && ` · ${format(new Date(activity.dueDate), "PPp")}`}
                  </p>
                  {activity.contact && (
                    <Link
                      className="text-primary text-xs hover:underline"
                      href={`/dashboard/contacts/${encodeURIComponent(activity.contact.id)}`}
                    >
                      {activity.contact.firstName} {activity.contact.lastName}
                    </Link>
                  )}
                  {activity.deal && (
                    <Link
                      className="block text-primary text-xs hover:underline"
                      href={`/dashboard/deals/${encodeURIComponent(activity.deal.id)}`}
                    >
                      {activity.deal.title}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
