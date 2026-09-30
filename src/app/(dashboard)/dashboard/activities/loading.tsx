import { Skeleton } from "@/components/ui/skeleton";

const calendarDays = Array.from({ length: 35 }, (_, index) => `day-${index + 1}`);
const activities = ["first", "second", "third", "fourth", "fifth"];

export default function ActivitiesLoading() {
  return (
    <div role="status" aria-label="Loading activities" className="space-y-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
        <div className="space-y-4 rounded-xl border bg-card p-5 lg:col-span-3">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-7 w-44" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => (
              <Skeleton key={day} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-5 lg:col-span-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-full" />
          {activities.map((activity) => (
            <div key={activity} className="space-y-2 rounded-lg border p-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading activities…</span>
    </div>
  );
}
