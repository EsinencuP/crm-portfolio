"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ActivitiesCalendar, type Activity } from "./_components/activities-calendar";
import { ActivitiesList } from "./_components/activities-list";
import { ActivityFormDialog } from "./_components/activity-form-dialog";

async function fetchActivities(signal: AbortSignal): Promise<Activity[]> {
  const getPage = async (page: number) => {
    const response = await fetch(`/api/activities?page=${page}&limit=100`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load activities.");
    return response.json() as Promise<{ activities: Activity[]; totalPages: number }>;
  };
  const first = await getPage(1);
  if (first.totalPages <= 1) return first.activities;
  const rest = await Promise.all(Array.from({ length: first.totalPages - 1 }, (_, index) => getPage(index + 2)));
  return [first.activities, ...rest.map((page) => page.activities)].flat();
}

export default function ActivitiesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useQuery({
    queryKey: ["activities"],
    queryFn: ({ signal }) => fetchActivities(signal),
    staleTime: 30_000,
  });
  function changed() {
    void queryClient.invalidateQueries({ queryKey: ["activities"] });
  }
  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Activities</h1>
          <p className="text-muted-foreground">Plan follow-ups and keep your team on schedule.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Add Activity
        </Button>
      </div>
      {query.isError && (
        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">
          {query.error.message}
          <Button variant="outline" size="sm" className="ml-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.isLoading ? (
        <p className="rounded-lg border p-10 text-center text-muted-foreground">Loading activities…</p>
      ) : (
        <div className="grid min-w-0 gap-4 md:gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <ActivitiesCalendar activities={query.data ?? []} onChanged={changed} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <ActivitiesList activities={query.data ?? []} onChanged={changed} />
          </div>
        </div>
      )}
      <ActivityFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={changed} />
    </div>
  );
}
