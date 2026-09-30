"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GeneralSettingsForm({ initial }: { initial: { appName: string; timezone: string } }) {
  const router = useRouter();
  const [appName, setAppName] = useState(initial.appName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, timezone }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save settings.");
      toast.success("Settings saved");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="settings-app-name">App name</Label>
            <Input
              id="settings-app-name"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
            <p className="text-muted-foreground text-xs">Shown in the dashboard sidebar.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-timezone">Default time zone</Label>
            <Input
              id="settings-timezone"
              list="crm-timezones"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
            />
            <datalist id="crm-timezones">
              {[
                "UTC",
                "Europe/Chisinau",
                "Europe/London",
                "Europe/Berlin",
                "America/New_York",
                "America/Los_Angeles",
                "Asia/Dubai",
                "Asia/Tokyo",
              ].map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <p className="text-muted-foreground text-xs">Use an IANA time zone, for example Europe/Chisinau.</p>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
