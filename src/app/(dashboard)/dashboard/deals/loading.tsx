import { Skeleton } from "@/components/ui/skeleton";

const columns = ["lead", "qualified", "proposal", "negotiation"];
const cards = ["first", "second", "third"];

export default function DealsLoading() {
  return (
    <div role="status" aria-label="Loading deals" className="space-y-5">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column} className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex gap-4 overflow-hidden">
        {columns.map((column) => (
          <div key={column} className="w-68 shrink-0 space-y-3 rounded-xl border bg-muted/20 p-3">
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-5 w-2/3" />
            {cards.map((card) => (
              <div key={card} className="space-y-3 rounded-lg border bg-card p-4">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading deals…</span>
    </div>
  );
}
