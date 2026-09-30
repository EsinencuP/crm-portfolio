"use client";

import { useState } from "react";

import { Bot, Copy, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AiBriefCard({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  let buttonLabel = "Generate Brief";
  if (loading) buttonLabel = "Generating…";
  else if (summary) buttonLabel = "Regenerate Brief";

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const body: { summary?: string; error?: string } = await response.json();
      if (!response.ok || !body.summary) throw new Error(body.error ?? "Unable to generate a brief.");
      setSummary(body.summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a brief.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5" /> Relationship brief
        </CardTitle>
        {summary && (
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss brief" onClick={() => setSummary("")}>
            <X className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">Summarize this contact’s notes and activities.</p>
        {loading && (
          <div aria-live="polite" className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {summary && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm">{summary}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(summary);
                  toast.success("Brief copied");
                } catch {
                  toast.error("Unable to copy brief");
                }
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        )}
        <Button onClick={generate} disabled={loading}>
          <Sparkles className="size-4" />
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
