"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ChannelSummary, Platform } from "@/lib/messaging/types";

import { PlatformIcon } from "../../inbox/_components/platform-icon";

type Channel = ChannelSummary & { webhookUrl: string | null };
export function MessagingSettings({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<Platform>("WHATSAPP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channels = useQuery({
    queryKey: ["messaging-channels", workspaceId],
    queryFn: async ({ signal }): Promise<{ channels: Channel[] }> => {
      const response = await fetch("/api/messaging/channels", { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load channels.");
      return result;
    },
  });
  async function connect(form: HTMLFormElement) {
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/messaging/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, ...fields }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not connect channel.");
      form.reset();
      toast.success(
        platform === "WHATSAPP"
          ? "Channel saved. Add its webhook URL and verification token in Meta."
          : "Telegram bot connected",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect channel.");
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["messaging-channels", workspaceId] });
    }
  }
  async function toggle(channel: Channel, isActive: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/messaging/channels/${encodeURIComponent(channel.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update channel.");
      await queryClient.invalidateQueries({ queryKey: ["messaging-channels", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update channel.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Messaging channels</h1>
        <p className="text-muted-foreground text-sm">Connect a business phone or a Telegram bot to the shared inbox.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Connect channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void connect(event.currentTarget);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="channel-platform">Platform</Label>
              <Select value={platform} disabled={busy} onValueChange={(value) => setPlatform(value as Platform)}>
                <SelectTrigger id="channel-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp Business</SelectItem>
                  <SelectItem value="TELEGRAM">Telegram Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="channel-name">Channel name</Label>
              <Input
                id="channel-name"
                name="channelName"
                required
                maxLength={100}
                disabled={busy}
                placeholder="Support"
              />
            </div>
            {platform === "WHATSAPP" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="phone-number-id">Phone Number ID</Label>
                  <Input id="phone-number-id" name="phoneNumberId" required disabled={busy} inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-access-token">Access Token</Label>
                  <Input
                    id="wa-access-token"
                    name="accessToken"
                    type="password"
                    autoComplete="off"
                    required
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-verify-token">Verify Token</Label>
                  <Input
                    id="wa-verify-token"
                    name="verifyToken"
                    type="password"
                    autoComplete="off"
                    required
                    minLength={16}
                    maxLength={256}
                    disabled={busy}
                  />
                  <p className="text-muted-foreground text-xs">
                    Choose a secret of 16+ characters. Enter the same token in Meta’s webhook settings and subscribe to
                    messages.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="tg-bot-token">Bot Token</Label>
                <Input id="tg-bot-token" name="botToken" type="password" autoComplete="off" required disabled={busy} />
                <p className="text-muted-foreground text-xs">
                  Connecting registers this CRM as the bot’s webhook. Users must start a private chat with the bot
                  before you can reply.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {channels.isLoading && (
            <p role="status" className="text-muted-foreground text-sm">
              Loading channels…
            </p>
          )}
          {channels.isError && (
            <div role="alert" className="text-destructive text-sm">
              {channels.error.message}
              <Button variant="outline" size="sm" onClick={() => void channels.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {channels.data?.channels.length === 0 && (
            <p className="text-muted-foreground text-sm">No channels connected yet.</p>
          )}
          {channels.data?.channels.map((channel) => (
            <div key={channel.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformIcon platform={channel.platform} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{channel.channelName}</p>
                    <p className="text-muted-foreground text-xs">
                      {channel.phoneNumber ?? `@${channel.botUsername ?? "bot"}`} ·{" "}
                      {channel.isActive ? "Active" : "Paused"}
                    </p>
                  </div>
                </div>
                <Switch
                  aria-label={`Activate ${channel.channelName}`}
                  checked={channel.isActive}
                  disabled={busy}
                  onCheckedChange={(next) => void toggle(channel, next)}
                />
              </div>
              {channel.webhookUrl ? (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`${channel.channelName} webhook URL`}
                    readOnly
                    value={channel.webhookUrl}
                    className="min-w-0 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Copy webhook URL"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(channel.webhookUrl ?? "")
                        .then(() => toast.success("Webhook URL copied"))
                        .catch(() => toast.error("Could not copy URL"));
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              ) : (
                <p className="text-destructive text-xs">
                  Configure the public HTTPS webhook origin to enable this channel.
                </p>
              )}
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Pausing stops sending and discards new webhook events. Existing history is retained.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
