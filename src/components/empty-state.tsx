"use client";

import Link from "next/link";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type EmptyStateAction = { label: string; onClick: () => void } | { label: string; href: string };

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">{description}</p>
      {action && (
        <div className="mt-5">
          {"href" in action ? (
            <Button render={<Link href={action.href} />}>{action.label}</Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
    </section>
  );
}
