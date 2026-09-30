"use client";

import { useEffect, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function EmailDraftDialog({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context>("follow-up");
  const [draft, setDraft] = useState("");
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
    setDraft(streamedText);
  }, [streamedText]);

  function changeOpen(next: boolean) {
    if (!next && loading) void stop();
    setOpen(next);
  }

  async function generate() {
    setDraft("");
    await sendMessage({ text: `Draft a ${context} email.` }, { body: { contactId, context } });
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
              Generate a draft from the contact’s recent notes, then review and edit it before copying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4">
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
                  await navigator.clipboard.writeText(draft);
                  toast.success("Email draft copied");
                } catch {
                  toast.error("Unable to copy draft");
                }
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <Button type="button" disabled title="Sending emails is not available yet">
              Send (coming soon)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
