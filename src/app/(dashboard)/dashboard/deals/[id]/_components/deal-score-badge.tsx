"use client";

import { useState } from "react";

import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Score = { score: number; reasoning: string; nextAction: string };

function scoreColor(score: number) {
  if (score < 30) return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
  if (score < 60)
    return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
  if (score < 80)
    return "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300";
  return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
}

export function DealScoreBadge({ dealId }: { dealId: string }) {
  const [result, setResult] = useState<Score | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function scoreDeal() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/deal-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const body: Score & { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to score this deal.");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to score this deal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger type="button" aria-label={`AI deal score ${result.score} out of 100. Show explanation.`}>
              <Badge variant="outline" className={scoreColor(result.score)}>
                <Sparkles aria-hidden="true" /> AI score {result.score}/100
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-80 flex-col items-start gap-2 p-3 leading-relaxed">
              <p>{result.reasoning}</p>
              <p>
                <strong>Next action:</strong> {result.nextAction}
              </p>
              <p className="opacity-70">AI estimate based on current CRM data.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={scoreDeal} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Scoring…" : "Score deal"}
        </Button>
      )}
      {result && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh AI score"
          onClick={scoreDeal}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
