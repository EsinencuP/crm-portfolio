import { revalidatePath } from "next/cache";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  UserRound,
  Users,
} from "lucide-react";
import { z } from "zod";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import type { KanbanDeal } from "../_components/deal-card";
import { DealEditButton } from "../_components/deal-form-sheet";
import { DealScoreBadge } from "./_components/deal-score-badge";

export const dynamic = "force-dynamic";

const noteSchema = z.string().trim().min(1).max(5000);
const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "TASK", "FOLLOW_UP"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  dueDate: z.union([z.literal(""), z.iso.date()]),
});
const typeIcon = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  TASK: CheckCircle2,
  FOLLOW_UP: CalendarDays,
  NOTE: FileText,
} as const;

function formatDealValue(value: string | null, currency: string) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
      Number(value),
    );
  } catch {
    return `${value} ${currency}`;
  }
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const _user = await requireAuth();
  const { id } = await params;
  const [deal, stages] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      include: {
        stage: true,
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true, logoUrl: true } },
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        activities: { include: { owner: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    prisma.pipelineStage.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }),
  ]);
  if (!deal) notFound();

  async function addNote(formData: FormData) {
    "use server";
    const current = await requireAuth();
    if (current.role === "VIEWER") forbidden();
    const content = noteSchema.safeParse(formData.get("content"));
    if (!content.success) return;
    await prisma.note.create({ data: { dealId: id, authorId: current.id, content: content.data } });
    revalidatePath(`/dashboard/deals/${id}`);
  }

  async function addActivity(formData: FormData) {
    "use server";
    const current = await requireAuth();
    if (current.role === "VIEWER") forbidden();
    const values = activitySchema.safeParse({
      type: formData.get("type"),
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      dueDate: formData.get("dueDate") ?? "",
    });
    if (!values.success) return;
    const { type, title, description, dueDate } = values.data;
    await prisma.activity.create({
      data: {
        dealId: id,
        ownerId: current.id,
        type,
        title,
        description: description || null,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00.000Z`) : null,
      },
    });
    revalidatePath(`/dashboard/deals/${id}`);
  }

  const row: KanbanDeal = {
    id: deal.id,
    title: deal.title,
    value: deal.value?.toString() ?? null,
    currency: deal.currency,
    closeDate: deal.closeDate?.toISOString() ?? null,
    priority: deal.priority,
    description: deal.description,
    stageId: deal.stageId,
    stage: deal.stage,
    contact: deal.contact,
    company: deal.company,
    owner: deal.owner,
  };
  const currentIndex = stages.findIndex((stage) => stage.id === deal.stageId);
  const probability = Math.max(0, Math.min(100, deal.stage.probability));
  const weighted = deal.value === null ? null : (Math.round(Number(deal.value) * probability) / 100).toFixed(2);
  const events = [
    ...deal.activities.map((activity) => ({
      id: `activity-${activity.id}`,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      actor: activity.owner.name,
      createdAt: activity.createdAt,
      dueDate: activity.dueDate,
    })),
    ...deal.notes.map((note) => ({
      id: `note-${note.id}`,
      type: "NOTE" as const,
      title: "Note added",
      description: note.content,
      actor: note.author.name,
      createdAt: note.createdAt,
      dueDate: null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <Link
        href="/dashboard/deals"
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to deals
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words font-semibold text-2xl tracking-tight">{deal.title}</h1>
            <Badge variant="outline">
              <span className="size-2 rounded-full" style={{ backgroundColor: deal.stage.color }} />
              {deal.stage.name}
            </Badge>
            <Badge variant="secondary">{deal.priority}</Badge>
            <DealScoreBadge dealId={deal.id} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {deal.company?.name ?? "No company"}{" "}
            {deal.contact && `· ${deal.contact.firstName} ${deal.contact.lastName}`}
          </p>
        </div>
        <DealEditButton deal={row} stages={stages} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex gap-2 overflow-x-auto pb-2">
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex min-w-28 flex-1 items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span
                    className="flex size-7 items-center justify-center rounded-full border"
                    style={index <= currentIndex ? { borderColor: stage.color, color: stage.color } : undefined}
                  >
                    {index <= currentIndex ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <span
                    className={`w-full text-center text-xs ${index === currentIndex ? "font-semibold" : "text-muted-foreground"}`}
                  >
                    {stage.name}
                  </span>
                </div>
                {index < stages.length - 1 && <span className="mb-5 h-0.5 w-5 shrink-0 bg-border" />}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-muted-foreground text-xs">Current stage probability: {probability}%</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-medium text-muted-foreground text-sm">Deal value</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-2xl tabular-nums">
            {formatDealValue(row.value, row.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-medium text-muted-foreground text-sm">Weighted value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">{formatDealValue(weighted, row.currency)}</p>
            <p className="text-muted-foreground text-xs">Value × {probability}% probability</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-medium text-muted-foreground text-sm">Expected close</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-lg">
            {deal.closeDate ? format(deal.closeDate, "MMM d, yyyy") : "Not set"}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
        <div className="space-y-4 md:space-y-6 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={addNote} className="space-y-2">
                <Label htmlFor="deal-note">Add a note</Label>
                <Textarea
                  id="deal-note"
                  name="content"
                  required
                  maxLength={5000}
                  rows={3}
                  placeholder="Write a note about this deal…"
                />
                <Button type="submit" size="sm">
                  <MessageSquare className="size-4" /> Save note
                </Button>
              </form>
              <div className="border-t pt-5">
                {events.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No activity yet.</p>
                ) : (
                  <ol className="space-y-0">
                    {events.map((event) => {
                      const Icon = typeIcon[event.type];
                      return (
                        <li key={event.id} className="relative border-border border-l-2 pb-6 pl-7 last:pb-0">
                          <span className="absolute top-0 -left-3 flex size-6 items-center justify-center rounded-full border bg-background">
                            <Icon className="size-3.5" />
                          </span>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <strong className="text-sm">{event.title}</strong>
                            <time title={format(event.createdAt, "PPpp")} className="text-muted-foreground text-xs">
                              {formatDistanceToNow(event.createdAt, { addSuffix: true })}
                            </time>
                          </div>
                          {event.description && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                              {event.description}
                            </p>
                          )}
                          <p className="mt-1 text-muted-foreground text-xs">
                            {event.type.replaceAll("_", " ")} · {event.actor}
                            {event.dueDate && ` · Due ${format(event.dueDate, "MMM d, yyyy")}`}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add activity</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addActivity} className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-type">Type</Label>
                  <select
                    id="activity-type"
                    name="type"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    defaultValue="TASK"
                  >
                    <option value="TASK">Task</option>
                    <option value="CALL">Call</option>
                    <option value="EMAIL">Email</option>
                    <option value="MEETING">Meeting</option>
                    <option value="FOLLOW_UP">Follow up</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-due">Due date</Label>
                  <Input id="activity-due" name="dueDate" type="date" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="activity-title">Title *</Label>
                  <Input id="activity-title" name="title" required maxLength={200} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="activity-description">Description</Label>
                  <Textarea id="activity-description" name="description" maxLength={5000} rows={3} />
                </div>
                <Button type="submit" size="sm" className="w-fit">
                  Add activity
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4 md:space-y-6 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Related contact</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.contact ? (
                <Link
                  href={`/dashboard/contacts/${encodeURIComponent(deal.contact.id)}`}
                  className="flex items-center gap-3 hover:underline"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <UserRound className="size-4" />
                  </span>
                  <span>
                    <strong className="block text-sm">
                      {deal.contact.firstName} {deal.contact.lastName}
                    </strong>
                    <span className="text-muted-foreground text-xs">{deal.contact.email ?? "View contact"}</span>
                  </span>
                </Link>
              ) : (
                <p className="text-muted-foreground text-sm">No contact linked.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Related company</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.company ? (
                <Link
                  href={`/dashboard/companies/${encodeURIComponent(deal.company.id)}`}
                  className="flex items-center gap-3 hover:underline"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <Building2 className="size-4" />
                  </span>
                  <strong className="text-sm">{deal.company.name}</strong>
                </Link>
              ) : (
                <p className="text-muted-foreground text-sm">No company linked.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Deal details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Owner</span>
                {deal.owner ? (
                  <span className="flex items-center gap-2">
                    <Avatar className="size-5">
                      {deal.owner.avatarUrl && <AvatarImage src={deal.owner.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {deal.owner.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {deal.owner.name}
                  </span>
                ) : (
                  "Unassigned"
                )}
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Notes</span>
                {deal.notes.length}
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Activities</span>
                {deal.activities.length}
              </div>
              {deal.description && (
                <div className="border-t pt-3">
                  <p className="text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap">{deal.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
