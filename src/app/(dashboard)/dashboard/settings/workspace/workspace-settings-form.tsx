"use client";

import { useState } from "react";

import type { Workspace } from "@prisma/client";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const timezones = [
  "UTC",
  "Europe/Chisinau",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
];
const currencies = ["USD", "EUR", "GBP", "MDL", "RON", "CAD", "JPY"];

export function WorkspaceSettingsForm({ initial }: { initial: Workspace }) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [defaultCurrency, setDefaultCurrency] = useState(initial.defaultCurrency);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 250_000) {
      setError("Use a PNG, JPEG, or WebP image smaller than 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogoUrl(reader.result);
    };
    reader.readAsDataURL(file);
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, logoUrl, timezone, defaultCurrency }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save workspace.");
      toast.success("Workspace saved");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save workspace.");
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{initial.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="workspace-logo">Logo upload</Label>
            <div className="flex items-center gap-3">
              <Avatar className="size-12 rounded-lg">
                {logoUrl && <AvatarImage src={logoUrl} alt="" />}
                <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Input
                id="workspace-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </div>
            <p className="text-muted-foreground text-xs">PNG, JPEG, or WebP; maximum 250 KB.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="workspace-settings-name">Name</Label>
            <Input
              id="workspace-settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workspace-settings-slug">Slug</Label>
            <Input
              id="workspace-settings-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              minLength={3}
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workspace-settings-timezone">Timezone</Label>
            <NativeSelect
              id="workspace-settings-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {!timezones.includes(timezone) && <NativeSelectOption value={timezone}>{timezone}</NativeSelectOption>}
              {timezones.map((zone) => (
                <NativeSelectOption key={zone} value={zone}>
                  {zone}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="workspace-settings-currency">Default currency</Label>
            <NativeSelect
              id="workspace-settings-currency"
              value={defaultCurrency}
              onChange={(event) => setDefaultCurrency(event.target.value)}
            >
              {!currencies.includes(defaultCurrency) && (
                <NativeSelectOption value={defaultCurrency}>{defaultCurrency}</NativeSelectOption>
              )}
              {currencies.map((currency) => (
                <NativeSelectOption key={currency} value={currency}>
                  {currency}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
