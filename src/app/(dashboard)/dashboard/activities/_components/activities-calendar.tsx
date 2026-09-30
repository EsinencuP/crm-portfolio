"use client";

import { type ComponentProps, useState } from "react";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type EventDropArg = Parameters<NonNullable<ComponentProps<typeof FullCalendar>["eventDrop"]>>[0];

export type Activity = {
  id: string;
  type: "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE" | "FOLLOW_UP";
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  contactId: string | null;
  dealId: string | null;
  ownerId: string;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; title: string } | null;
  owner: { id: string; name: string; email: string };
};

const colors: Record<Activity["type"], string> = {
  CALL: "#3b82f6",
  EMAIL: "#22c55e",
  MEETING: "#a855f7",
  TASK: "#f59e0b",
  NOTE: "#64748b",
  FOLLOW_UP: "#ef4444",
};

export function ActivitiesCalendar({ activities, onChanged }: { activities: Activity[]; onChanged: () => void }) {
  const [selected, setSelected] = useState<{ activity: Activity; x: number; y: number } | null>(null);
  async function reschedule(info: EventDropArg) {
    const next = info.event.start;
    if (!next) {
      info.revert();
      return;
    }
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(info.event.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: next.toISOString() }),
      });
      if (!response.ok) throw new Error("Unable to reschedule activity.");
      toast.success("Activity rescheduled");
      onChanged();
    } catch {
      info.revert();
      toast.error("Unable to reschedule activity.");
    }
  }
  const events = activities.flatMap((activity) =>
    activity.dueDate
      ? [
          {
            id: activity.id,
            title: activity.title,
            start: activity.dueDate,
            backgroundColor: colors[activity.type],
            borderColor: colors[activity.type],
            classNames: activity.completed ? ["opacity-50"] : [],
          },
        ]
      : [],
  );
  return (
    <div className="relative min-w-0 rounded-xl border bg-card p-3 sm:p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
        buttonText={{ month: "Month", week: "Week", day: "Day" }}
        events={events}
        editable
        eventDurationEditable={false}
        eventDrop={reschedule}
        eventClick={(info) => {
          const activity = activities.find((item) => item.id === info.event.id);
          if (activity)
            setSelected({
              activity,
              x: Math.max(12, Math.min(info.jsEvent.clientX, window.innerWidth - 290)),
              y: Math.max(12, Math.min(info.jsEvent.clientY, window.innerHeight - 210)),
            });
        }}
        height="auto"
        nowIndicator
        dayMaxEvents
      />
      {selected && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close activity details"
            onClick={() => setSelected(null)}
          />
          <div
            role="dialog"
            aria-label="Activity details"
            className="fixed z-50 w-68 rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl"
            style={{ left: selected.x, top: selected.y }}
          >
            <div className="flex items-start justify-between gap-2">
              <strong>{selected.activity.title}</strong>
              <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => setSelected(null)}>
                ×
              </Button>
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              {selected.activity.type.replaceAll("_", " ")}
              {selected.activity.completed ? " · Completed" : ""}
            </p>
            {selected.activity.dueDate && (
              <p className="mt-1 text-sm">{format(new Date(selected.activity.dueDate), "PPp")}</p>
            )}
            {selected.activity.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm">{selected.activity.description}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
