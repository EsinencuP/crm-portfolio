import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { canAccess, getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import type { ContactRow } from "../_components/contacts-columns";
import { AiBriefCard } from "./_components/ai-brief-card";
import { type ContactDeal, ContactDeals } from "./_components/contact-deals";
import { type ContactDetails, ContactDetailsSidebar } from "./_components/contact-details-sidebar";
import { ContactHeader } from "./_components/contact-header";
import { ContactTimeline, type TimelineEvent } from "./_components/contact-timeline";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveWorkspaceMember();
  const { id } = await params;
  if (!(await canAccess(member.userId, "Contact", id, "VIEW"))) notFound();
  const [canEdit, canShare, dealIds] = await Promise.all([
    canAccess(member.userId, "Contact", id, "EDIT"),
    canAccess(member.userId, "Contact", id, "FULL"),
    getAccessibleEntityIds(member.userId, "Deal", member.workspaceId),
  ]);
  const contact = await prisma.contact.findUnique({
    where: { id, workspaceId: member.workspaceId },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      tags: true,
      deals: {
        where: { id: { in: dealIds } },
        include: { stage: { select: { name: true, color: true } } },
        orderBy: { createdAt: "desc" },
      },
      activities: { include: { owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { deals: { where: { id: { in: dealIds } } }, activities: true } },
    },
  });
  if (!contact) notFound();

  const emails = await prisma.emailMessage.findMany({
    where: { workspaceId: member.workspaceId, contactId: id, account: { userId: member.userId } },
    select: { id: true, direction: true, subject: true, snippet: true, from: true, receivedAt: true, sentAt: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 50,
  });

  const row: ContactRow = {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    jobTitle: contact.jobTitle,
    linkedinUrl: contact.linkedinUrl,
    notes_text: contact.notes_text,
    avatarUrl: contact.avatarUrl,
    source: contact.source,
    status: contact.status,
    companyId: contact.companyId,
    ownerId: contact.ownerId,
    company: contact.company,
    owner: contact.owner,
    _count: contact._count,
  };
  const details: ContactDetails = {
    id: contact.id,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedinUrl,
    city: contact.city,
    country: contact.country,
    source: contact.source,
    status: contact.status,
    ownerId: contact.ownerId,
    owner: contact.owner,
    notes_text: contact.notes_text,
    tags: contact.tags.map(({ id, name, color }) => ({ id, name, color })),
  };
  const events: TimelineEvent[] = [
    ...emails.map((email) => ({
      id: `email-${email.id}`,
      type: "EMAIL" as const,
      title: `${email.direction === "INBOUND" ? "Received" : "Sent"}: ${email.subject}`,
      description: email.snippet,
      actor: email.direction === "INBOUND" ? email.from : null,
      createdAt: (email.receivedAt ?? email.sentAt ?? email.createdAt).toISOString(),
    })),
    ...contact.activities.map((activity) => ({
      id: `activity-${activity.id}`,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      actor: activity.owner.name,
      createdAt: activity.createdAt.toISOString(),
    })),
    ...contact.notes.map((note) => ({
      id: `note-${note.id}`,
      type: "NOTE" as const,
      title: "Note added",
      description: note.content,
      actor: note.author.name,
      createdAt: note.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const deals: ContactDeal[] = contact.deals.map((deal) => ({
    id: deal.id,
    title: deal.title,
    value: deal.value?.toString() ?? null,
    currency: deal.currency,
    closeDate: deal.closeDate?.toISOString() ?? null,
    stage: deal.stage,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/contacts"
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to contacts
      </Link>
      <ContactHeader contact={row} canEdit={canEdit} canShare={canShare} />
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        <div className="space-y-4 md:space-y-6 lg:col-span-8">
          <AiBriefCard contactId={contact.id} />
          <ContactTimeline contactId={contact.id} events={events} canEdit={canEdit} />
          <ContactDeals contactId={contact.id} deals={deals} canEdit={canEdit} />
        </div>
        <aside className="lg:col-span-4">
          <ContactDetailsSidebar contact={details} canEdit={canEdit} canShare={canShare} />
        </aside>
      </div>
    </div>
  );
}
