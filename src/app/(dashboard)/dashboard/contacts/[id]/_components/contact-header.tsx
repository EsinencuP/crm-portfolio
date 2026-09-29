"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { CalendarDays, Mail, Pencil, Phone } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

import { ContactFormSheet } from "../../_components/contact-form-sheet";
import type { ContactRow } from "../../_components/contacts-columns";

export function ContactHeader({ contact }: { contact: ContactRow }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const initials = `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase();
  const subtitle = [contact.jobTitle, contact.company?.name].filter(Boolean).join(" @ ");
  const statusColor = { ACTIVE: "bg-green-500", INACTIVE: "bg-amber-500", ARCHIVED: "bg-red-500" }[contact.status];

  async function schedule() {
    const meetingTitle = titleRef.current?.value.trim() || title.trim();
    const meetingDate = dueDateRef.current?.value || dueDate;
    if (!meetingTitle || !meetingDate) {
      toast.error("Enter a title and date for the meeting.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitle, dueDate: new Date(meetingDate).toISOString() }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to schedule meeting.");
      toast.success("Meeting scheduled");
      setScheduleOpen(false);
      setTitle("");
      setDueDate("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to schedule meeting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16 sm:size-20">
              {contact.avatarUrl && <AvatarImage src={contact.avatarUrl} alt="" />}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-heading font-semibold text-2xl tracking-tight md:text-3xl">{name}</h1>
                <Badge variant="outline" className="gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-full ${statusColor}`} />
                  {contact.status.charAt(0) + contact.status.slice(1).toLowerCase()}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{subtitle || "Contact"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<a href={contact.email ? `mailto:${contact.email}` : undefined} />}
              disabled={!contact.email}
            >
              <Mail aria-hidden="true" /> Email
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<a href={contact.phone ? `tel:${contact.phone}` : undefined} />}
              disabled={!contact.phone}
            >
              <Phone aria-hidden="true" /> Call
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
              <CalendarDays aria-hidden="true" /> Schedule
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <ContactFormSheet open={editOpen} onOpenChange={setEditOpen} contact={contact} onSaved={() => router.refresh()} />

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule meeting</DialogTitle>
            <DialogDescription>Add a meeting to this contact’s activity timeline.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void schedule(); }} className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                ref={titleRef}
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Date and time</Label>
              <Input
                ref={dueDateRef}
                id="meeting-date"
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => void schedule()}>
                Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
