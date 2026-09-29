import "server-only";

import Link from "next/link";

import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function formatValue(value: { toNumber(): number } | null, currency: string) {
  if (!value) return "—";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.trim().toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value.toNumber());
  } catch {
    return `${currency || "Unspecified"} ${value.toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function RecentDeals() {
  await requireAuth();

  const deals = await prisma.deal.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    include: {
      stage: { select: { name: true, color: true } },
      contact: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
      owner: { select: { name: true, avatarUrl: true } },
    },
  });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Recent Deals</h2>
        </CardTitle>
        <CardAction>
          <Link
            href="/dashboard/deals"
            className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            View All <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="min-w-0">
        {deals.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">No deals yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Deal Title</TableHead>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col" className="text-right">
                  Value
                </TableHead>
                <TableHead scope="col">Stage</TableHead>
                <TableHead scope="col">Owner</TableHead>
                <TableHead scope="col">Close Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => {
                const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}`.trim() : null;
                const stageColor = /^#[0-9a-f]{6}$/i.test(deal.stage.color) ? deal.stage.color : "#6366f1";

                return (
                  <TableRow key={deal.id}>
                    <TableCell className="max-w-60 whitespace-normal">
                      <Link
                        href={`/dashboard/deals/${encodeURIComponent(deal.id)}`}
                        className="font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                      >
                        {deal.title}
                      </Link>
                      {contactName && <p className="text-muted-foreground text-xs">{contactName}</p>}
                    </TableCell>
                    <TableCell>{deal.company?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatValue(deal.value, deal.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: stageColor }}
                        />
                        {deal.stage.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {deal.owner ? (
                        <span className="flex items-center gap-2">
                          <Avatar size="sm">
                            {deal.owner.avatarUrl && <AvatarImage src={deal.owner.avatarUrl} alt="" />}
                            <AvatarFallback>{initials(deal.owner.name)}</AvatarFallback>
                          </Avatar>
                          <span>{deal.owner.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {deal.closeDate ? format(deal.closeDate, "MMM d, yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
