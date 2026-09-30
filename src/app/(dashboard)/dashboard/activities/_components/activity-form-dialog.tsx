"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Contact = { id: string; firstName: string; lastName: string };
type Deal = { id: string; title: string };
type Member = { id: string; name: string };
async function options<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Unable to load options.");
  return response.json() as Promise<T>;
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState("TASK");
  const [contactId, setContactId] = useState("none");
  const [dealId, setDealId] = useState("none");
  const [ownerId, setOwnerId] = useState("current");
  const [contactSearch, setContactSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const contacts = useQuery({
    queryKey: ["activity-contacts", contactSearch],
    queryFn: ({ signal }) =>
      options<{ contacts: Contact[] }>(`/api/contacts?limit=100&search=${encodeURIComponent(contactSearch)}`, signal),
    enabled: open,
  });
  const deals = useQuery({
    queryKey: ["activity-deals", dealSearch],
    queryFn: ({ signal }) =>
      options<{ deals: Deal[] }>(`/api/deals?limit=100&search=${encodeURIComponent(dealSearch)}`, signal),
    enabled: open,
  });
  const members = useQuery({
    queryKey: ["activity-members"],
    queryFn: ({ signal }) => options<{ members: Member[] }>("/api/team-members", signal),
    enabled: open,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const date = String(form.get("dueDate") ?? "");
    const time = String(form.get("dueTime") ?? "");
    const dueDate = date ? new Date(`${date}T${time || "12:00"}:00`).toISOString() : null;
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: form.get("title"),
          description: String(form.get("description") ?? "") || null,
          dueDate,
          contactId: contactId === "none" ? null : contactId,
          dealId: dealId === "none" ? null : dealId,
          ...(ownerId !== "current" && { ownerId }),
        }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to create activity.");
      }
      toast.success("Activity created");
      onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create activity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New activity</DialogTitle>
          <DialogDescription>Schedule a CRM task, call, email or meeting.</DialogDescription>
        </DialogHeader>
        <form id="activity-form" onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value ?? "TASK")}>
              <SelectTrigger aria-label="Activity type">
                <SelectValue>{type.replaceAll("_", " ")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {["TASK", "CALL", "EMAIL", "MEETING", "FOLLOW_UP", "NOTE"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-title">Title *</Label>
            <Input id="activity-title" name="title" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-description">Description</Label>
            <Textarea id="activity-description" name="description" maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="activity-date">Due date</Label>
              <Input id="activity-date" name="dueDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-time">Due time</Label>
              <Input id="activity-time" name="dueTime" type="time" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input
              aria-label="Search contacts"
              placeholder="Search contacts…"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
            />
            <Select value={contactId} onValueChange={(value) => setContactId(value ?? "none")}>
              <SelectTrigger aria-label="Contact">
                <SelectValue>
                  {contacts.data?.contacts.find((contact) => contact.id === contactId)
                    ? `${contacts.data.contacts.find((contact) => contact.id === contactId)?.firstName} ${contacts.data.contacts.find((contact) => contact.id === contactId)?.lastName}`
                    : "No contact"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No contact</SelectItem>
                {contacts.data?.contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Deal</Label>
            <Input
              aria-label="Search deals"
              placeholder="Search deals…"
              value={dealSearch}
              onChange={(event) => setDealSearch(event.target.value)}
            />
            <Select value={dealId} onValueChange={(value) => setDealId(value ?? "none")}>
              <SelectTrigger aria-label="Deal">
                <SelectValue>{deals.data?.deals.find((deal) => deal.id === dealId)?.title ?? "No deal"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No deal</SelectItem>
                {deals.data?.deals.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select value={ownerId} onValueChange={(value) => setOwnerId(value ?? "current")}>
              <SelectTrigger aria-label="Assign to">
                <SelectValue>{members.data?.members.find((member) => member.id === ownerId)?.name ?? "Me"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Me</SelectItem>
                {members.data?.members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="activity-form" disabled={saving}>
            {saving ? "Saving…" : "Create activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
