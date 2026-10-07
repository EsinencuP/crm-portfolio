"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { formatDistanceToNow } from "date-fns";
import { CalendarDays, Check, Mail, MessageSquareText, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export type TimelineEvent = {
  id: string;
  type: "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE" | "FOLLOW_UP";
  title: string;
  description: string | null;
  actor: string | null;
  createdAt: string;
};

const icons = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarDays,
  TASK: Check,
  NOTE: MessageSquareText,
  FOLLOW_UP: CalendarDays,
};

export function ContactTimeline({
  contactId,
  events,
  canEdit,
}: {
  contactId: string;
  events: TimelineEvent[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(10);

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: note.trim() }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not add note");
      setNote("");
      toast.success("Note added");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
          <div className="space-y-3">
            <Textarea
              aria-label="Add a note"
              placeholder="Add a note about this contact..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={10000}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={addNote} disabled={saving || !note.trim()}>
                {saving ? "Saving..." : "Add a note"}
              </Button>
            </div>
          </div>
        )}
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No activity yet. Add a note to start the timeline.
          </p>
        ) : (
          <div className="border-border border-l-2 pl-6">
            {events.slice(0, visible).map((event) => {
              const Icon = icons[event.type];
              return (
                <div key={event.id} className="relative pb-7 last:pb-0">
                  <span className="absolute top-0 -left-[39px] flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-sm">{event.title}</p>
                    <time className="text-muted-foreground text-xs" dateTime={event.createdAt}>
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    </time>
                  </div>
                  {event.description && (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">{event.description}</p>
                  )}
                  {event.actor && <p className="mt-1 text-muted-foreground text-xs">by {event.actor}</p>}
                </div>
              );
            })}
          </div>
        )}
        {visible < events.length && (
          <Button variant="outline" className="w-full" onClick={() => setVisible((count) => count + 10)}>
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
