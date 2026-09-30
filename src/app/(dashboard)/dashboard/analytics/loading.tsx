import { Skeleton } from "@/components/ui/skeleton";

const charts = ["revenue", "pipeline", "win-loss", "sources", "performers", "cycle-time"];

export default function AnalyticsLoading() {
  return (
    <div role="status" aria-label="Loading analytics" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {charts.map((chart) => (
          <div key={chart} className="space-y-4 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="h-56 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading analytics…</span>
    </div>
  );
}
