import "server-only";

import Link from "next/link";

import { ActivityType } from "@prisma/client";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowUpRight, CalendarDays, Mail, MessageSquareText, Phone, RefreshCw, SquareCheckBig } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const activityIcons = {
  [ActivityType.CALL]: Phone,
  [ActivityType.EMAIL]: Mail,
  [ActivityType.MEETING]: CalendarDays,
  [ActivityType.TASK]: SquareCheckBig,
  [ActivityType.NOTE]: MessageSquareText,
  [ActivityType.FOLLOW_UP]: RefreshCw,
} satisfies Record<ActivityType, typeof Phone>;

export async function UpcomingActivities() {
  await requireAuth();

  const now = new Date();
  const activities = await prisma.activity.findMany({
    where: { completed: false, dueDate: { gte: now } },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: 5,
    include: { contact: { select: { firstName: true, lastName: true } } },
  });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Upcoming Activities</h2>
        </CardTitle>
        <CardAction>
          <Link
            href="/dashboard/activities"
            className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            View All <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">No upcoming activities.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type];
              const contactName = activity.contact
                ? `${activity.contact.firstName} ${activity.contact.lastName}`.trim()
                : "No contact";

              return (
                <li key={activity.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={activity.title}>
                      {activity.title}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">{contactName}</p>
                  </div>
                  {activity.dueDate && (
                    <time
                      dateTime={activity.dueDate.toISOString()}
                      title={format(activity.dueDate, "PPP p")}
                      className="shrink-0 text-right text-muted-foreground text-xs tabular-nums"
                    >
                      {formatDistanceToNow(activity.dueDate, { addSuffix: true })}
                    </time>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
