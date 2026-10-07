"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Copy, LoaderCircle, Mail, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Context = "follow-up" | "proposal" | "intro";

const transport = new TextStreamChatTransport({
  api: "/api/ai/draft-email",
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const body: { error?: string } = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Unable to generate an email draft.");
    }
    return response;
  },
});
const contextLabels: Record<Context, string> = {
  "follow-up": "Follow-up",
  proposal: "Proposal",
  intro: "Introduction",
};

type EmailAccountOption = { id: string; email: string; provider: string };

function plainTextToHtml(text: string) {
  const escapeHtml = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let html = "";
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = match[0].replace(/[.,!?;:]+$/, "");
    const start = match.index ?? cursor;
    html += escapeHtml(text.slice(cursor, start));
    html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    cursor = start + url.length;
  }
  html += escapeHtml(text.slice(cursor));
  return `<p>${html.replaceAll("\n", "<br>")}</p>`;
}

export function EmailDraftDialog({
  contactId,
  contactEmail,
  canSend,
}: {
  contactId: string;
  contactEmail: string | null;
  canSend: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context>("follow-up");
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const loading = status === "submitted" || status === "streaming";
  const streamedText =
    messages
      .filter((message) => message.role === "assistant")
      .at(-1)
      ?.parts.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("") ?? "";

  useEffect(() => {
    const normalized = streamedText.replaceAll("\r\n", "\n");
    const subjectLine = /^Subject:\s*([^\n]*)(?:\n|$)/i.exec(normalized);
    // biome-ignore lint/suspicious/noUnnecessaryConditions: A streamed draft may not have a subject line yet.
    if (subjectLine) {
      setSubject(subjectLine[1].trim());
      setDraft(normalized.slice(subjectLine[0].length).trimStart());
    } else {
      setDraft(normalized);
    }
  }, [streamedText]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setAccountsLoading(true);
    fetch("/api/email-accounts", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load email accounts");
        return response.json() as Promise<{ accounts: EmailAccountOption[] }>;
      })
      .then((result) => {
        setAccounts(result.accounts);
        setAccountId((current) =>
          result.accounts.some((account) => account.id === current) ? current : (result.accounts[0]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not load accounts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setAccountsLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  function changeOpen(next: boolean) {
    if (!next && loading) void stop();
    setOpen(next);
  }

  async function generate() {
    setSubject("");
    setDraft("");
    await sendMessage({ text: `Draft a ${context} email.` }, { body: { contactId, context } });
  }

  async function send() {
    if (!contactEmail || !accountId) return;
    setSending(true);
    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to: [contactEmail],
          subject: subject.trim(),
          bodyHtml: plainTextToHtml(draft),
          contactId,
          trackingEnabled,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send email");
      toast.success("Email sent");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden="true" /> Draft email
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5" /> Email draft
            </DialogTitle>
            <DialogDescription>
              Generate a draft from the contact’s recent notes, then review it before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-draft-account">From</Label>
              <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
                <SelectTrigger id="email-draft-account" aria-label="From email account" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!accountsLoading && accounts.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No connected accounts.{" "}
                  <Link href="/dashboard/settings/email" className="underline">
                    Connect Gmail or Outlook
                  </Link>{" "}
                  first.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-draft-recipient">To</Label>
              <Input id="email-draft-recipient" value={contactEmail ?? ""} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-draft-context">Email type</Label>
              <Select value={context} onValueChange={(value) => setContext(value as Context)}>
                <SelectTrigger id="email-draft-context" aria-label="Email type">
                  <SelectValue>{contextLabels[context]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="intro">Introduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-draft-subject">Subject</Label>
              <Input
                id="email-draft-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                readOnly={loading}
                maxLength={300}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-draft-text">Draft</Label>
              <Textarea
                id="email-draft-text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                readOnly={loading}
                rows={14}
                placeholder="The generated email will appear here…"
                className="min-h-64 resize-y"
                aria-busy={loading}
              />
              {loading && (
                <p role="status" className="text-muted-foreground text-sm">
                  Writing draft…
                </p>
              )}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                aria-label="Track opens and clicks"
                checked={trackingEnabled}
                onCheckedChange={setTrackingEnabled}
              />
              <span className="text-sm">Track opens and clicks (optional)</span>
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            <Button type="button" variant="outline" onClick={() => void generate()} disabled={loading}>
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Generating…" : "Generate"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!draft || loading}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`Subject: ${subject}\n\n${draft}`);
                  toast.success("Email draft copied");
                } catch {
                  toast.error("Unable to copy draft");
                }
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <Button
              type="button"
              disabled={
                !canSend || !contactEmail || !accountId || !subject.trim() || !draft.trim() || loading || sending
              }
              onClick={() => void send()}
            >
              {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
