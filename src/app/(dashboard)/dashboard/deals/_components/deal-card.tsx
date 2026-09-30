"use client";

import { format, isValid, parseISO } from "date-fns";
import { CalendarDays, GripVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KanbanDeal = {
  id: string;
  title: string;
  value: string | null;
  currency: string;
  closeDate: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  description: string | null;
  stageId: string;
  stage: { id: string; name: string; color: string; position: number; probability: number };
  company: { id: string; name: string; logoUrl: string | null } | null;
  contact: { id: string; firstName: string; lastName: string; email: string | null } | null;
  owner: { id: string; name: string; email: string; avatarUrl: string | null } | null;
};

const priorityStyle: Record<KanbanDeal["priority"], string> = {
  LOW: "border-l-slate-400",
  MEDIUM: "border-l-blue-500",
  HIGH: "border-l-orange-500",
  URGENT: "border-l-red-500",
};

export function formatDealValue(value: string | null, currency: string) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
      Number(value),
    );
  } catch {
    return `${value} ${currency}`;
  }
}

export function DealCard({
  deal,
  onOpen,
  handleRef,
  isOverlay = false,
}: {
  deal: KanbanDeal;
  onOpen?: () => void;
  handleRef?: (element: Element | null) => void;
  isOverlay?: boolean;
}) {
  const closeDate = deal.closeDate ? parseISO(deal.closeDate) : null;
  const ownerInitials = deal.owner?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <Card
      className={cn(
        "gap-0 border-l-4 py-0 shadow-xs",
        priorityStyle[deal.priority],
        isOverlay && "w-72 rotate-1 shadow-lg",
      )}
    >
      <CardContent className="relative p-3.5">
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${deal.title} details`}
          />
        )}
        {!isOverlay && (
          <button
            ref={handleRef}
            type="button"
            className="absolute top-2.5 right-2.5 z-20 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label={`Drag ${deal.title}`}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        )}
        <div className="pointer-events-none">
          <div className="pr-8">
            <span className="line-clamp-2 font-semibold text-sm">{deal.title}</span>
            <span className="mt-1 block truncate text-muted-foreground text-xs">
              {deal.company?.name ?? "No company"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-semibold text-emerald-700 text-sm tabular-nums dark:text-emerald-400">
              {formatDealValue(deal.value, deal.currency)}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {deal.priority}
            </Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {closeDate && isValid(closeDate) ? format(closeDate, "MMM d, yyyy") : "No close date"}
            </span>
            {deal.owner ? (
              <Avatar className="size-6" title={deal.owner.name}>
                {deal.owner.avatarUrl && <AvatarImage src={deal.owner.avatarUrl} alt="" />}
                <AvatarFallback className="text-[10px]">{ownerInitials}</AvatarFallback>
              </Avatar>
            ) : (
              <span className="text-muted-foreground text-xs">Unassigned</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
