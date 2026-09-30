"use client";

import { type FormEvent, useState } from "react";

import { CollisionPriority } from "@dnd-kit/abstract";
import { useDroppable } from "@dnd-kit/react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { KanbanDeal } from "./deal-card";
import { SortableDealCard } from "./sortable-deal-card";

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  probability: number;
  _count?: { deals: number };
};

function formatTotals(deals: KanbanDeal[]) {
  const cents = new Map<string, number>();
  for (const deal of deals) {
    if (deal.value === null) continue;
    cents.set(deal.currency, (cents.get(deal.currency) ?? 0) + Math.round(Number(deal.value) * 100));
  }
  if (!cents.size) return "No value";
  return [...cents]
    .map(([currency, value]) => {
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100);
      } catch {
        return `${(value / 100).toFixed(2)} ${currency}`;
      }
    })
    .join(" · ");
}

export function PipelineColumn({
  stage,
  deals,
  dragDisabled,
  onOpenDeal,
  onAddDeal,
}: {
  stage: PipelineStage;
  deals: KanbanDeal[];
  dragDisabled: boolean;
  onOpenDeal: (deal: KanbanDeal) => void;
  onAddDeal: (stageId: string, title: string, value: string | null) => Promise<boolean>;
}) {
  const dropTarget = useDroppable({
    id: stage.id,
    type: "deal-container",
    accept: "deal",
    collisionPriority: CollisionPriority.Low,
    data: { type: "deal-container", stageId: stage.id },
  });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    try {
      const saved = await onAddDeal(stage.id, trimmedTitle, value.trim() || null);
      if (saved) {
        setTitle("");
        setValue("");
        setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={`${stage.name} pipeline stage`}
      className={cn(
        "flex h-full min-h-80 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40 transition-colors",
        dropTarget.isDropTarget && "bg-primary/10 ring-2 ring-primary/30",
      )}
    >
      <div className="h-1.5 shrink-0" style={{ backgroundColor: stage.color }} />
      <div className="flex shrink-0 items-start justify-between gap-3 px-3.5 pt-3.5 pb-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-sm">{stage.name}</h2>
          <p className="mt-1 truncate text-muted-foreground text-xs" title={formatTotals(deals)}>
            {formatTotals(deals)}
          </p>
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums">
          {deals.length}
          <span className="sr-only"> deals</span>
        </span>
      </div>
      <div ref={dropTarget.ref} className="flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
        {deals.map((deal, index) => (
          <SortableDealCard
            key={deal.id}
            deal={deal}
            stageId={stage.id}
            index={index}
            disabled={dragDisabled}
            onOpen={onOpenDeal}
          />
        ))}
        {!deals.length && (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
            Drop a deal here
          </p>
        )}
      </div>
      <div className="shrink-0 border-t px-2.5 py-2.5">
        {adding ? (
          <form onSubmit={submit} className="space-y-2">
            <Input
              autoFocus
              aria-label={`Deal title for ${stage.name}`}
              placeholder="Deal title"
              maxLength={200}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              aria-label={`Deal value for ${stage.name}`}
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              placeholder="Value (USD, optional)"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !title.trim()}>
                {saving ? "Adding…" : "Add"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" aria-hidden="true" /> Add Deal
          </Button>
        )}
      </div>
    </section>
  );
}
