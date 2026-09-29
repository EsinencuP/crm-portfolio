import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { CrmSearchResults } from "@/lib/search-types";

export const runtime = "nodejs";

const querySchema = z.string().trim().max(100);
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Response.json({ error: "Please sign in to search." }, { status: 401, headers });

    const query = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
    if (!query.success)
      return Response.json({ error: "Search must be at most 100 characters." }, { status: 400, headers });

    if (query.data.length < 2) {
      return Response.json({ contacts: [], companies: [], deals: [] } satisfies CrmSearchResults, { headers });
    }

    const terms = query.data.split(/\s+/).map((contains) => ({ contains, mode: "insensitive" as const }));
    const [contacts, companies, deals] = await Promise.all([
      prisma.contact.findMany({
        where: {
          AND: terms.map((term) => ({
            OR: [
              { firstName: term },
              { lastName: term },
              { email: term },
              { phone: term },
              { company: { name: term } },
            ],
          })),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          company: { select: { name: true } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
        take: 5,
      }),
      prisma.company.findMany({
        where: { AND: terms.map((term) => ({ OR: [{ name: term }, { domain: term }, { industry: term }] })) },
        select: { id: true, name: true, domain: true, industry: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 5,
      }),
      prisma.deal.findMany({
        where: {
          AND: terms.map((term) => ({
            OR: [{ title: term }, { company: { name: term } }, { stage: { name: term } }],
          })),
        },
        select: { id: true, title: true, company: { select: { name: true } }, stage: { select: { name: true } } },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: 5,
      }),
    ]);

    const results: CrmSearchResults = {
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        subtitle: [contact.email, contact.jobTitle, contact.company?.name].filter(Boolean).join(" · ") || "Contact",
        url: `/dashboard/contacts/${encodeURIComponent(contact.id)}`,
      })),
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        subtitle: [company.domain, company.industry].filter(Boolean).join(" · ") || "Company",
        url: `/dashboard/companies/${encodeURIComponent(company.id)}`,
      })),
      deals: deals.map((deal) => ({
        id: deal.id,
        name: deal.title,
        subtitle: [deal.company?.name, deal.stage.name].filter(Boolean).join(" · "),
        url: `/dashboard/deals/${encodeURIComponent(deal.id)}`,
      })),
    };

    return Response.json(results, { headers });
  } catch {
    return Response.json({ error: "Search is unavailable. Please try again." }, { status: 500, headers });
  }
}
