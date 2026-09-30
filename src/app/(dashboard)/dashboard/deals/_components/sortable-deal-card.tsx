"use client";

import { useSortable } from "@dnd-kit/react/sortable";

import { cn } from "@/lib/utils";

import { DealCard, type KanbanDeal } from "./deal-card";

export function SortableDealCard({
  deal,
  stageId,
  index,
  disabled = false,
  onOpen,
}: {
  deal: KanbanDeal;
  stageId: string;
  index: number;
  disabled?: boolean;
  onOpen: (deal: KanbanDeal) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: deal.id,
    index,
    type: "deal",
    accept: "deal",
    group: stageId,
    disabled,
    data: { type: "deal", deal, stageId },
  });

  return (
    <div ref={ref} className={cn("min-w-0 touch-none", isDragging && "opacity-30")}>
      <DealCard deal={deal} handleRef={handleRef} onOpen={() => onOpen(deal)} />
    </div>
  );
}
