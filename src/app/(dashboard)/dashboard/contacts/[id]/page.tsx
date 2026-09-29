import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import type { ContactRow } from "../_components/contacts-columns";
import { type ContactDeal, ContactDeals } from "./_components/contact-deals";
import { type ContactDetails, ContactDetailsSidebar } from "./_components/contact-details-sidebar";
import { ContactHeader } from "./_components/contact-header";
import { ContactTimeline, type TimelineEvent } from "./_components/contact-timeline";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      tags: true,
      deals: { include: { stage: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } },
      activities: { include: { owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { deals: true, activities: true } },
    },
  });
  if (!contact) notFound();

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
      <ContactHeader contact={row} />
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        <div className="space-y-4 md:space-y-6 lg:col-span-8">
          <ContactTimeline contactId={contact.id} events={events} />
          <ContactDeals contactId={contact.id} deals={deals} />
        </div>
        <aside className="lg:col-span-4">
          <ContactDetailsSidebar contact={details} />
        </aside>
      </div>
    </div>
  );
}
