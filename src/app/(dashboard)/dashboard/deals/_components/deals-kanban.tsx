"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { move } from "@dnd-kit/helpers";
import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isValid, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { DealCard, formatDealValue, type KanbanDeal } from "./deal-card";
import { PipelineColumn, type PipelineStage } from "./pipeline-column";

type BoardState = Record<string, KanbanDeal[]>;
type StagesResponse = { stages: PipelineStage[] };
type DealsResponse = { deals: KanbanDeal[]; totalPages: number };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body: { error?: string } = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }
  return response.json();
}

export async function fetchDeals(signal: AbortSignal) {
  const getPage = async (page: number) => {
    const response = await fetch(`/api/deals?page=${page}&limit=100`, { signal, cache: "no-store" });
    return readJson<DealsResponse>(response);
  };
  const first = await getPage(1);
  if (first.totalPages <= 1) return first.deals;
  const remaining = await Promise.all(Array.from({ length: first.totalPages - 1 }, (_, index) => getPage(index + 2)));
  return [first.deals, ...remaining.map((page) => page.deals)].flat();
}

function makeBoard(stages: PipelineStage[], deals: KanbanDeal[]): BoardState {
  const board: BoardState = Object.fromEntries(stages.map((stage) => [stage.id, []]));
  for (const deal of deals) board[deal.stageId]?.push(deal);
  return board;
}

function stageOf(board: BoardState, dealId: string) {
  return Object.keys(board).find((stageId) => board[stageId].some((deal) => deal.id === dealId));
}

export function DealsKanban() {
  const queryClient = useQueryClient();
  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async ({ signal }) =>
      readJson<StagesResponse>(await fetch("/api/pipeline-stages", { signal, cache: "no-store" })),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const dealsQuery = useQuery({
    queryKey: ["deals", "kanban"],
    queryFn: ({ signal }) => fetchDeals(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const stages = stagesQuery.data?.stages ?? [];
  const [board, setBoard] = useState<BoardState>({});
  const boardRef = useRef<BoardState>({});
  const beforeDrag = useRef<BoardState>({});
  const dragging = useRef(false);
  const pendingMove = useRef(false);
  const [savingMove, setSavingMove] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  useEffect(() => {
    if (!stagesQuery.data || !dealsQuery.data || dragging.current || pendingMove.current) return;
    const next = makeBoard(stagesQuery.data.stages, dealsQuery.data);
    boardRef.current = next;
    setBoard(next);
  }, [stagesQuery.data, dealsQuery.data]);

  function restore(snapshot: BoardState) {
    boardRef.current = snapshot;
    setBoard(snapshot);
  }

  function handleDragStart(event: DragStartEvent) {
    if (event.operation.source?.type !== "deal" || pendingMove.current) return;
    beforeDrag.current = boardRef.current;
    dragging.current = true;
  }

  function handleDragOver(event: DragOverEvent) {
    if (event.operation.source?.type !== "deal" || !dragging.current) return;
    const next = move(boardRef.current, event);
    if (next !== boardRef.current) {
      boardRef.current = next;
      setBoard(next);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const source = event.operation.source;
    if (source?.type !== "deal" || !dragging.current) return;
    dragging.current = false;
    const snapshot = beforeDrag.current;
    const dealId = String(source.id);
    const previousStageId = stageOf(snapshot, dealId);
    if (event.canceled || !previousStageId) {
      restore(snapshot);
      return;
    }

    let next = boardRef.current;
    let stageId = stageOf(next, dealId);
    if (stageId === previousStageId) {
      next = move(snapshot, event);
      stageId = stageOf(next, dealId);
    }
    if (!stageId || stageId === previousStageId) {
      restore(snapshot);
      return;
    }
    const destination = stages.find((stage) => stage.id === stageId);
    if (!destination) {
      restore(snapshot);
      return;
    }
    const updated = {
      ...next,
      [stageId]: next[stageId].map((deal) =>
        deal.id === dealId ? { ...deal, stageId, stage: { ...deal.stage, ...destination } } : deal,
      ),
    };
    restore(updated);
    pendingMove.current = true;
    setSavingMove(true);

    void (async () => {
      try {
        await readJson(
          await fetch(`/api/deals/${encodeURIComponent(dealId)}/stage`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stageId }),
          }),
        );
        queryClient.setQueryData<KanbanDeal[]>(["deals", "kanban"], (current) =>
          current?.map((deal) =>
            deal.id === dealId ? { ...deal, stageId, stage: { ...deal.stage, ...destination } } : deal,
          ),
        );
        toast.success(`Moved to ${destination.name}`);
        void queryClient.invalidateQueries({ queryKey: ["deals", "kanban"] });
      } catch (error) {
        restore(snapshot);
        toast.error(error instanceof Error ? error.message : "Unable to move deal.");
      } finally {
        pendingMove.current = false;
        setSavingMove(false);
      }
    })();
  }

  async function addDeal(stageId: string, title: string, value: string | null) {
    try {
      const created = await readJson<KanbanDeal>(
        await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, stageId, value, currency: "USD" }),
        }),
      );
      const next = { ...boardRef.current, [stageId]: [...(boardRef.current[stageId] ?? []), created] };
      restore(next);
      queryClient.setQueryData<KanbanDeal[]>(["deals", "kanban"], (current) =>
        current ? [...current, created] : [created],
      );
      toast.success("Deal created");
      void queryClient.invalidateQueries({ queryKey: ["deals", "kanban"] });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create deal.");
      return false;
    }
  }

  const selectedDeal = selectedDealId
    ? Object.values(board)
        .flat()
        .find((deal) => deal.id === selectedDealId)
    : undefined;
  const closeDate = selectedDeal?.closeDate ? parseISO(selectedDeal.closeDate) : null;

  if (stagesQuery.isPending || dealsQuery.isPending)
    return <p className="p-6 text-muted-foreground">Loading pipeline…</p>;
  if (stagesQuery.isError || dealsQuery.isError)
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 p-5">
        <p>{stagesQuery.error?.message ?? dealsQuery.error?.message ?? "Unable to load pipeline."}</p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            void stagesQuery.refetch();
            void dealsQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  if (!stages.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No pipeline stages configured.
      </p>
    );

  return (
    <>
      <DragDropProvider onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <section
          aria-label="Deals pipeline board"
          className="flex h-[min(70vh,850px)] min-h-90 min-w-0 gap-4 overflow-x-auto pb-4"
        >
          {stages.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={board[stage.id] ?? []}
              dragDisabled={savingMove}
              onOpenDeal={(deal) => setSelectedDealId(deal.id)}
              onAddDeal={addDeal}
            />
          ))}
        </section>
        <DragOverlay dropAnimation={null}>
          {(source) => {
            if (source.type !== "deal") return null;
            const deal = Object.values(board)
              .flat()
              .find((item) => item.id === String(source.id));
            return deal ? <DealCard deal={deal} isOverlay /> : null;
          }}
        </DragOverlay>
      </DragDropProvider>

      <Sheet open={!!selectedDeal} onOpenChange={(open) => !open && setSelectedDealId(null)}>
        <SheetContent className="w-full max-w-full sm:w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>{selectedDeal?.title ?? "Deal"}</SheetTitle>
            <SheetDescription>Deal details</SheetDescription>
          </SheetHeader>
          {selectedDeal && (
            <div className="space-y-4 overflow-y-auto px-4 pb-6 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  style={{ borderColor: selectedDeal.stage.color, color: selectedDeal.stage.color }}
                >
                  {selectedDeal.stage.name}
                </Badge>
                <Badge variant="secondary">{selectedDeal.priority} priority</Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Value</p>
                <p className="font-semibold text-emerald-700 text-lg dark:text-emerald-400">
                  {formatDealValue(selectedDeal.value, selectedDeal.currency)}
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">Company</p>
                  <p>{selectedDeal.company?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Contact</p>
                  <p>
                    {selectedDeal.contact ? `${selectedDeal.contact.firstName} ${selectedDeal.contact.lastName}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Owner</p>
                  <p>{selectedDeal.owner?.name ?? "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Close date</p>
                  <p className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {closeDate && isValid(closeDate) ? format(closeDate, "MMM d, yyyy") : "—"}
                  </p>
                </div>
              </div>
              {selectedDeal.description && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">Description</p>
                    <p className="whitespace-pre-wrap">{selectedDeal.description}</p>
                  </div>
                </>
              )}
              <Button
                render={<Link href={`/dashboard/deals/${selectedDeal.id}`} />}
                variant="outline"
                className="w-full"
              >
                View full deal
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
