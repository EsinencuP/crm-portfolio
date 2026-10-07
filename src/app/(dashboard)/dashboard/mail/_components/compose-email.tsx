"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { MailAccount } from "./mail-sidebar";

export function ComposeEmail({
  open,
  onOpenChange,
  accounts,
  defaultAccountId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  accounts: MailAccount[];
  defaultAccountId: string;
  onSent: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedAccount = accountId || defaultAccountId || accounts[0]?.id || "";

  async function send() {
    setBusy(true);
    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount,
          trackingEnabled,
          to: to
            .split(/[,;]/)
            .map((value) => value.trim())
            .filter(Boolean),
          cc: cc
            .split(/[,;]/)
            .map((value) => value.trim())
            .filter(Boolean),
          subject,
          bodyHtml,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send email");
      toast.success("Email sent");
      setTo("");
      setCc("");
      setSubject("");
      setBodyHtml("");
      onOpenChange(false);
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="block space-y-1 text-sm">
            From
            <Select value={selectedAccount} onValueChange={(value) => setAccountId(value ?? "")}>
              <SelectTrigger aria-label="From account" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label htmlFor="mail-to" className="block space-y-1 text-sm">
            To
            <Input
              id="mail-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="person@example.com"
            />
          </label>
          <label htmlFor="mail-cc" className="block space-y-1 text-sm">
            Cc
            <Input id="mail-cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional" />
          </label>
          <label htmlFor="mail-subject" className="block space-y-1 text-sm">
            Subject
            <Input
              id="mail-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={300}
            />
          </label>
          <div>
            <span className="text-sm">Message</span>
            {/* biome-ignore lint/a11y/useSemanticElements: Rich-text contenteditable needs textbox semantics. */}
            <div
              role="textbox"
              aria-label="Message body"
              aria-multiline="true"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              className="mt-1 max-h-72 min-h-48 overflow-y-auto rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onInput={(event) => setBodyHtml(event.currentTarget.innerHTML)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              aria-label="Track opens and clicks"
              checked={trackingEnabled}
              onCheckedChange={setTrackingEnabled}
            />
            <span className="text-sm">Track opens and clicks (optional)</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !selectedAccount || !to.trim() || !subject.trim() || !bodyHtml.trim()}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
