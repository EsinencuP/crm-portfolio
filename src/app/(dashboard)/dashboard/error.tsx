"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-80 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center"
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <CircleAlert aria-hidden="true" className="size-7" />
      </div>
      <h1 className="font-semibold text-xl tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted-foreground text-sm">We couldn&apos;t load this page. Please try again.</p>
      <Button className="mt-5" onClick={reset}>
        <RotateCcw aria-hidden="true" className="size-4" /> Retry
      </Button>
    </div>
  );
}
