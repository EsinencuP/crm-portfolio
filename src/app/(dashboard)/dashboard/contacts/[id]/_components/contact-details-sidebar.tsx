"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ClickToCall } from "@/components/click-to-call";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export type ContactDetails = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  city: string | null;
  country: string | null;
  source: "MANUAL" | "IMPORT" | "WEBSITE" | "REFERRAL" | "LINKEDIN" | "API";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  ownerId: string | null;
  owner: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  tags: { id: string; name: string; color: string }[];
  notes_text: string | null;
};

type EditableField = "email" | "phone" | "linkedinUrl" | "city" | "country";
const fields: { key: EditableField; label: string; type: string }[] = [
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "linkedinUrl", label: "LinkedIn", type: "url" },
  { key: "city", label: "City", type: "text" },
  { key: "country", label: "Country", type: "text" },
];

export function ContactDetailsSidebar({
  contact,
  canEdit,
  canShare,
}: {
  contact: ContactDetails;
  canEdit: boolean;
  canShare: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagName, setTagName] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([]);

  async function patch(data: Record<string, string | null>) {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save contact");
      toast.success("Contact updated");
      setEditing(null);
      setReassigning(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save contact");
    } finally {
      setSaving(false);
    }
  }

  async function loadMembers() {
    setReassigning(true);
    try {
      const response = await fetch("/api/team-members");
      if (!response.ok) throw new Error("Could not load team members");
      const result = await response.json();
      setMembers(Array.isArray(result) ? result : (result.members ?? []));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load team members");
    }
  }

  async function addTag() {
    if (!tagName.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName.trim() }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not add tag");
      setTagName("");
      setAddingTag(false);
      toast.success("Tag added");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add tag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {fields.map(({ key, label, type }) => (
          <div key={key} className="group space-y-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor={editing === key ? `edit-${key}` : undefined}>
              {label}
            </Label>
            {editing === key ? (
              <div className="flex items-center gap-1">
                <Input
                  id={`edit-${key}`}
                  type={type}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-w-0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void patch({ [key]: draft.trim() || null });
                    if (event.key === "Escape") setEditing(null);
                  }}
                />
                <Button
                  size="icon-sm"
                  aria-label={`Save ${label}`}
                  disabled={saving}
                  onClick={() => void patch({ [key]: draft.trim() || null })}
                >
                  <Check />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Cancel ${label}`} onClick={() => setEditing(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={!canEdit}
                  className="flex w-full items-center justify-between gap-2 rounded-md text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    setEditing(key);
                    setDraft(contact[key] ?? "");
                  }}
                >
                  <span className="truncate">
                    {contact[key] || <span className="text-muted-foreground">Add {label.toLowerCase()}</span>}
                  </span>
                  <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" />
                </button>
                {key === "phone" && contact.phone && canEdit && (
                  <ClickToCall
                    phoneNumber={contact.phone}
                    contactId={contact.id}
                    contactName={`${contact.firstName} ${contact.lastName}`}
                  />
                )}
              </div>
            )}
          </div>
        ))}
        <Separator />
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Source</Label>
          <Select
            value={contact.source}
            onValueChange={(value) => {
              if (value) void patch({ source: value });
            }}
            disabled={saving || !canEdit}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["MANUAL", "IMPORT", "WEBSITE", "REFERRAL", "LINKEDIN", "API"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Status</Label>
          <Select
            value={contact.status}
            onValueChange={(value) => {
              if (value) void patch({ status: value });
            }}
            disabled={saving || !canEdit}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground text-xs">Owner</Label>
            {canShare && (
              <Button variant="ghost" size="sm" onClick={() => void loadMembers()}>
                Reassign
              </Button>
            )}
          </div>
          {contact.owner ? (
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                {contact.owner.avatarUrl && <AvatarImage src={contact.owner.avatarUrl} alt="" />}
                <AvatarFallback>{contact.owner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span>{contact.owner.name}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Unassigned</p>
          )}
          {reassigning && (
            <Select
              value={contact.ownerId ?? "unassigned"}
              onValueChange={(value) => void patch({ ownerId: value === "unassigned" ? null : value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground text-xs">Tags</Label>
            {canEdit && (
              <Button size="icon-sm" variant="ghost" aria-label="Add tag" onClick={() => setAddingTag(true)}>
                <Plus />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.length ? (
              contact.tags.map((tag) => (
                <Badge key={tag.id} variant="outline" style={{ borderColor: tag.color, color: tag.color }}>
                  {tag.name}
                </Badge>
              ))
            ) : (
              <p className="text-muted-foreground">No tags</p>
            )}
          </div>
          {addingTag && (
            <div className="flex gap-1">
              <Input
                aria-label="Tag name"
                value={tagName}
                onChange={(event) => setTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addTag();
                }}
                maxLength={40}
              />
              <Button size="sm" disabled={saving || !tagName.trim()} onClick={() => void addTag()}>
                Add
              </Button>
            </div>
          )}
        </div>
        {contact.notes_text && (
          <>
            <Separator />
            <div>
              <p className="mb-1 text-muted-foreground text-xs">Summary</p>
              <p className="whitespace-pre-wrap">{contact.notes_text}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
