import { Skeleton } from "@/components/ui/skeleton";

const cards = Array.from({ length: 8 }, (_, index) => `contact-${index + 1}`);

export default function ContactsLoading() {
  return (
    <div role="status" aria-label="Loading contacts" className="space-y-5">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card} className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading contacts…</span>
    </div>
  );
}
