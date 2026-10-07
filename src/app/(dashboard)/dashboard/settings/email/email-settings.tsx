"use client";

import { useCallback, useEffect, useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Account = {
  id: string;
  provider: "GMAIL" | "OUTLOOK";
  email: string;
  displayName: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
};

export function EmailSettings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/email-accounts", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load email accounts");
      const result: { accounts: Account[] } = await response.json();
      setAccounts(result.accounts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load email accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const status = new URLSearchParams(window.location.search).get("status");
    if (status === "connected") toast.success("Email account connected");
    else if (status) toast.error(`Email connection failed: ${status.replaceAll("_", " ")}`);
  }, [reload]);

  async function connect(provider: "GMAIL" | "OUTLOOK") {
    setBusy(true);
    try {
      const response = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const result: { authUrl?: string; error?: string } = await response.json();
      if (!response.ok || !result.authUrl) throw new Error(result.error ?? "Could not start connection");
      window.location.assign(result.authUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect");
      setBusy(false);
    }
  }

  async function change(id: string, method: "PATCH" | "DELETE", syncEnabled?: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/email-accounts/${encodeURIComponent(id)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PATCH" ? { body: JSON.stringify({ syncEnabled }) } : {}),
      });
      if (!response.ok) throw new Error("Could not update account");
      await reload();
      toast.success(method === "DELETE" ? "Account disconnected" : "Sync setting saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Email settings</h1>
        <p className="text-muted-foreground">Connect an inbox to sync and send mail from the CRM.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void connect("GMAIL")}>
          <span aria-hidden="true" className="font-bold text-blue-600">
            G
          </span>{" "}
          Connect Gmail
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void connect("OUTLOOK")}>
          <span aria-hidden="true" className="font-bold text-blue-700">
            ▦
          </span>{" "}
          Connect Outlook
        </Button>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {loading && <p className="p-6 text-muted-foreground">Loading accounts…</p>}
          {!loading && accounts.length === 0 && (
            <p className="p-6 text-muted-foreground">No email accounts connected.</p>
          )}
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{account.email}</p>
                <p className="text-muted-foreground text-xs">
                  {account.provider === "GMAIL" ? "Gmail" : "Outlook"} ·{" "}
                  {account.lastSyncAt
                    ? `Last synced ${formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true })}`
                    : "Not synced yet"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                Sync{" "}
                <Switch
                  aria-label={`Sync ${account.email}`}
                  checked={account.syncEnabled}
                  disabled={busy}
                  onCheckedChange={(checked) => void change(account.id, "PATCH", checked)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Disconnect ${account.email}? Synced messages will be removed.`))
                    void change(account.id, "DELETE");
                }}
              >
                <Trash2 aria-hidden="true" /> Disconnect
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
