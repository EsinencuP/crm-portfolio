import Link from "next/link";
import { notFound } from "next/navigation";

import { Prisma } from "@prisma/client";
import { ArrowLeft, Globe, MapPin, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import type { CompanyRow } from "../_components/companies-columns";
import { CompanyContactsTab } from "./_components/company-contacts-tab";
import { CompanyDealsTab } from "./_components/company-deals-tab";
import { CompanyHeader } from "./_components/company-header";

export const dynamic = "force-dynamic";

function formatDealTotals(totals: Record<string, string>) {
  const entries = Object.entries(totals);
  return entries.length
    ? entries
        .map(([currency, value]) => {
          try {
            return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
          } catch {
            return `${value} ${currency}`;
          }
        })
        .join(" · ")
    : "—";
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          status: true,
          avatarUrl: true,
        },
        orderBy: { createdAt: "desc" },
      },
      deals: { include: { stage: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { contacts: true, deals: true } },
    },
  });
  if (!company) notFound();
  const totals: Record<string, Prisma.Decimal> = {};
  for (const deal of company.deals)
    if (deal.value) totals[deal.currency] = (totals[deal.currency] ?? new Prisma.Decimal(0)).add(deal.value);
  const dealsByCurrency = Object.fromEntries(
    Object.entries(totals).map(([currency, value]) => [currency, value.toString()]),
  );
  const row: CompanyRow = {
    id: company.id,
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    size: company.size,
    logoUrl: company.logoUrl,
    website: company.website,
    address: company.address,
    description: company.description,
    phone: company.phone,
    _count: company._count,
    dealsByCurrency,
  };
  const deals = company.deals.map((deal) => ({
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
        href="/dashboard/companies"
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to companies
      </Link>
      <CompanyHeader company={row} />
      <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Tabs defaultValue="contacts">
            <TabsList>
              <TabsTrigger value="contacts">Contacts ({company.contacts.length})</TabsTrigger>
              <TabsTrigger value="deals">Deals ({company.deals.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts">
              <CompanyContactsTab contacts={company.contacts} />
            </TabsContent>
            <TabsContent value="deals">
              <CompanyDealsTab deals={deals} />
            </TabsContent>
          </Tabs>
          {company.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {company.notes.map((note, index) => (
                  <div key={note.id} className="space-y-1">
                    <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                    <p className="text-muted-foreground text-xs">
                      {note.author.name} · {note.createdAt.toLocaleDateString("en-US")}
                    </p>
                    {index < company.notes.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Company details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Industry</p>
                <p>{company.industry || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Size</p>
                <p>{company.size || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Deal value</p>
                <p>{formatDealTotals(dealsByCurrency)}</p>
              </div>
              <Separator />
              <div className="space-y-3">
                {company.website && (
                  <a
                    className="flex items-center gap-2 break-all hover:underline"
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="size-4 shrink-0" />
                    {company.website}
                  </a>
                )}
                {company.domain && (
                  <p className="flex items-center gap-2">
                    <Globe className="size-4 shrink-0" />
                    {company.domain}
                  </p>
                )}
                {company.phone && (
                  <a className="flex items-center gap-2 hover:underline" href={`tel:${company.phone}`}>
                    <Phone className="size-4 shrink-0" />
                    {company.phone}
                  </a>
                )}
                {company.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    {company.address}
                  </p>
                )}
              </div>
              {company.description && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">Description</p>
                    <p className="whitespace-pre-wrap">{company.description}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
