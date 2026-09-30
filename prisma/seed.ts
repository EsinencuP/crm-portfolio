import { loadEnvConfig } from "@next/env";
import {
  ActivityType,
  ContactSource,
  ContactStatus,
  DealPriority,
  type Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hash } from "bcryptjs";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const seedId = (kind: string, index: number) => `demo-${kind}-${String(index + 1).padStart(2, "0")}`;
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

// These are fictional demo organizations; .example domains cannot resolve to real companies.
const companyCatalog = [
  ["Acme Corp", "Software", "51-200"],
  ["Stark Industries", "Industrial technology", "1001-5000"],
  ["Wayne Enterprises", "Enterprise software", "1001-5000"],
  ["Aperture Labs", "Research technology", "201-500"],
  ["Pied Piper", "Cloud infrastructure", "11-50"],
  ["Hooli", "Internet services", "501-1000"],
  ["Globex Digital", "Cybersecurity", "201-500"],
  ["Initech Systems", "Business software", "201-500"],
  ["Cyberdyne Works", "Robotics", "501-1000"],
  ["Blue Sun Cloud", "Cloud infrastructure", "51-200"],
  ["Massive Dynamic", "Data analytics", "501-1000"],
  ["Vandelay Tech", "E-commerce", "51-200"],
  ["Nakatomi Digital", "Fintech", "201-500"],
  ["LexCorp Labs", "Artificial intelligence", "501-1000"],
  ["Oceanic Systems", "Logistics technology", "201-500"],
  ["Brightline Software", "Developer tools", "11-50"],
  ["Northstar Analytics", "Data analytics", "51-200"],
  ["Redwood Platform", "Platform engineering", "51-200"],
  ["Cedarpoint AI", "Artificial intelligence", "11-50"],
  ["Silverline Networks", "Networking", "201-500"],
] as const;

const firstNames = [
  "Olivia",
  "Noah",
  "Amelia",
  "Liam",
  "Sophia",
  "Ethan",
  "Ava",
  "Lucas",
  "Mia",
  "James",
  "Isabella",
  "Mason",
  "Charlotte",
  "Elijah",
  "Harper",
  "Benjamin",
  "Evelyn",
  "Henry",
  "Ella",
  "Alexander",
  "Grace",
  "Daniel",
  "Chloe",
  "Michael",
  "Lily",
  "Samuel",
  "Zoe",
  "David",
  "Nora",
  "Joseph",
  "Layla",
  "Matthew",
  "Aria",
  "Sebastian",
  "Ruby",
  "Jackson",
  "Hannah",
  "Levi",
  "Stella",
  "Owen",
  "Victoria",
  "Gabriel",
  "Claire",
  "Julian",
  "Natalie",
  "Isaac",
  "Audrey",
  "Anthony",
  "Elena",
  "Caleb",
] as const;
const lastNames = [
  "Bennett",
  "Kim",
  "Patel",
  "Walker",
  "Rivera",
  "Chen",
  "Morgan",
  "Lee",
  "Brooks",
  "Adams",
  "Turner",
  "Singh",
  "Parker",
  "Cooper",
  "Reed",
  "Miller",
  "Hughes",
  "Carter",
  "Nguyen",
  "Ross",
  "Mitchell",
  "Diaz",
  "Howard",
  "Ward",
  "Foster",
  "Bailey",
  "Price",
  "Flores",
  "Jenkins",
  "Powell",
  "Long",
  "Perry",
  "Butler",
  "Coleman",
  "Russell",
  "Griffin",
  "Hayes",
  "West",
  "Stone",
  "Woods",
  "Barnes",
  "Fisher",
  "Ellis",
  "Bell",
  "Murphy",
  "Kelly",
  "Gray",
  "Ortiz",
  "Sullivan",
  "Grant",
] as const;
const jobTitles = [
  "CEO",
  "CTO",
  "VP Sales",
  "Head of Operations",
  "Engineering Director",
  "Product Manager",
  "Revenue Operations Lead",
  "IT Director",
  "Chief Marketing Officer",
  "Procurement Manager",
] as const;
const stages = [
  { name: "Lead", probability: 10, color: "#94a3b8" },
  { name: "Qualified", probability: 25, color: "#3b82f6" },
  { name: "Proposal", probability: 50, color: "#8b5cf6" },
  { name: "Negotiation", probability: 75, color: "#f59e0b" },
  { name: "Closed Won", probability: 100, color: "#22c55e" },
  { name: "Closed Lost", probability: 0, color: "#ef4444" },
] as const;
const tags = [
  ["Enterprise", "#3b82f6"],
  ["Startup", "#8b5cf6"],
  ["Hot Lead", "#ef4444"],
  ["Renewal", "#0ea5e9"],
  ["Upsell", "#f59e0b"],
  ["Partner", "#14b8a6"],
  ["Churned", "#64748b"],
  ["VIP", "#d946ef"],
  ["Trial", "#22c55e"],
  ["Referral", "#06b6d4"],
] as const;
const productLines = [
  "CRM migration",
  "Sales analytics rollout",
  "Support automation",
  "Data platform upgrade",
  "Team onboarding",
  "API integration",
  "Enterprise license",
  "Workflow redesign",
  "Customer portal",
  "Annual renewal",
] as const;
const dealValues = [
  5_000, 8_500, 12_000, 18_000, 24_000, 30_000, 38_000, 45_000, 52_000, 60_000, 68_000, 76_000, 85_000, 95_000, 105_000,
  118_000, 132_000, 148_000, 165_000, 185_000, 205_000, 228_000, 250_000, 278_000, 310_000, 345_000, 380_000, 420_000,
  460_000, 500_000,
] as const;
const noteTopics = [
  "Discussed pricing and confirmed the budget owner for the next review.",
  "Follow-up scheduled after the stakeholder meeting; share a concise recap.",
  "Requested a technical walkthrough focused on security and integration options.",
  "Interested in a phased rollout starting with the sales team.",
  "Asked for an updated proposal with implementation milestones.",
  "Current process relies on spreadsheets; automation is a priority.",
  "Evaluating two vendors and expects to make a decision this quarter.",
  "Positive feedback on the demo; procurement needs contract details.",
  "Expansion opportunity identified for the customer success team.",
  "Needs a clear migration plan before approving the project.",
] as const;

const userIds = [seedId("user", 0), seedId("user", 1), seedId("user", 2)];
const companyIds = companyCatalog.map((_, index) => seedId("company", index));
const contactIds = firstNames.map((_, index) => seedId("contact", index));
const stageIds = stages.map((_, index) => seedId("stage", index));
const tagIds = tags.map((_, index) => seedId("tag", index));
const dealIds = dealValues.map((_, index) => seedId("deal", index));
const activityIds = Array.from({ length: 100 }, (_, index) => seedId("activity", index));
const noteIds = Array.from({ length: 80 }, (_, index) => seedId("note", index));

async function checkUniqueConflicts() {
  const userEmails = ["admin@demo.com", "manager@demo.com", "member@demo.com"];
  const companyDomains = companyCatalog.map(
    ([name]) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.crm-demo.example`,
  );
  const contactEmails = contactIds.map((_, index) => `contact${String(index + 1).padStart(2, "0")}@crm-demo.example`);
  const [existingUsers, existingCompanies, existingContacts, existingTags, existingStages] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: userEmails } }, select: { id: true, email: true } }),
    prisma.company.findMany({ where: { domain: { in: companyDomains } }, select: { id: true, domain: true } }),
    prisma.contact.findMany({ where: { email: { in: contactEmails } }, select: { id: true, email: true } }),
    prisma.tag.findMany({ where: { name: { in: tags.map(([name]) => name) } }, select: { id: true, name: true } }),
    prisma.pipelineStage.findMany({
      where: { name: { in: stages.map(({ name }) => name) } },
      select: { id: true, name: true },
    }),
  ]);
  const conflict =
    existingUsers.find((user) => user.id !== userIds[userEmails.indexOf(user.email)])?.email ??
    existingCompanies.find((company) => company.id !== companyIds[companyDomains.indexOf(company.domain ?? "")])
      ?.domain ??
    existingContacts.find((contact) => contact.id !== contactIds[contactEmails.indexOf(contact.email ?? "")])?.email ??
    existingTags.find((tag) => tag.id !== tagIds[tags.findIndex(([name]) => name === tag.name)])?.name ??
    existingStages.find((stage) => stage.id !== stageIds[stages.findIndex(({ name }) => name === stage.name)])?.name;
  if (conflict) throw new Error(`Demo seed conflicts with an existing record (${conflict}). No data was changed.`);
}

async function seed() {
  await checkUniqueConflicts();
  const passwords = await Promise.all([hash("admin123", 12), hash("manager123", 12), hash("member123", 12)]);
  const userData = [
    { id: userIds[0], name: "Demo Admin", email: "admin@demo.com", role: Role.ADMIN, passwordHash: passwords[0] },
    { id: userIds[1], name: "Demo Manager", email: "manager@demo.com", role: Role.MANAGER, passwordHash: passwords[1] },
    { id: userIds[2], name: "Demo Member", email: "member@demo.com", role: Role.MEMBER, passwordHash: passwords[2] },
  ] satisfies Prisma.UserCreateManyInput[];
  const companyData = companyCatalog.map(([name, industry, size], index) => {
    const domain = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.crm-demo.example`;
    return {
      id: companyIds[index],
      name,
      domain,
      industry,
      size,
      website: `https://${domain}`,
      description: `${name} is a sample ${industry.toLowerCase()} organization used in the CRM demo.`,
    };
  }) satisfies Prisma.CompanyCreateManyInput[];
  const contactData = contactIds.map((id, index) => ({
    id,
    firstName: firstNames[index],
    lastName: lastNames[index],
    email: `contact${String(index + 1).padStart(2, "0")}@crm-demo.example`,
    phone: `+1 202 555-${String(100 + index).padStart(4, "0")}`,
    jobTitle: jobTitles[index % jobTitles.length],
    source: [ContactSource.MANUAL, ContactSource.WEBSITE, ContactSource.REFERRAL, ContactSource.LINKEDIN][index % 4],
    status: index % 12 === 0 ? ContactStatus.INACTIVE : ContactStatus.ACTIVE,
    companyId: companyIds[index % companyIds.length],
    ownerId: userIds[index % userIds.length],
    city: ["Seattle", "Austin", "Boston", "Chicago", "Denver"][index % 5],
    country: "United States",
  })) satisfies Prisma.ContactCreateManyInput[];
  const dealData = dealIds.map((id, index) => ({
    id,
    title: `${companyCatalog[index % companyCatalog.length][0]} — ${productLines[index % productLines.length]}`,
    value: dealValues[index].toFixed(2),
    currency: "USD",
    closeDate: daysFromNow(index % 6 >= 4 ? -(index * 3 + 5) : 14 + index * 4),
    priority: [DealPriority.LOW, DealPriority.MEDIUM, DealPriority.HIGH, DealPriority.URGENT][index % 4],
    description: `Demo opportunity for ${productLines[index % productLines.length].toLowerCase()}.`,
    stageId: stageIds[index % stageIds.length],
    contactId: contactIds[index],
    companyId: companyIds[index % companyIds.length],
    ownerId: userIds[index % userIds.length],
    createdAt: daysFromNow(-(120 - index * 3)),
  })) satisfies Prisma.DealCreateManyInput[];
  const activityData = activityIds.map((id, index) => {
    const dealIndex = index % dealIds.length;
    const contactIndex = index < 60 ? dealIndex : index % contactIds.length;
    const type = [ActivityType.CALL, ActivityType.EMAIL, ActivityType.MEETING, ActivityType.TASK][index % 4];
    const dueOffset = index < 80 ? -(89 - index) : index - 79;
    const contactName = `${firstNames[contactIndex]} ${lastNames[contactIndex]}`;
    const title = {
      CALL: `Call ${contactName} about next steps`,
      EMAIL: `Email ${contactName} the project recap`,
      MEETING: `Meet with ${contactName} to review the proposal`,
      TASK: `Prepare follow-up for ${contactName}`,
    }[type];
    const dueDate = daysFromNow(dueOffset);
    return {
      id,
      type,
      title,
      description: noteTopics[index % noteTopics.length],
      dueDate,
      completed: index < 60,
      completedAt: index < 60 ? daysFromNow(dueOffset + 1) : null,
      contactId: contactIds[contactIndex],
      dealId: index < 60 ? dealIds[dealIndex] : null,
      ownerId: userIds[index % userIds.length],
      createdAt: daysFromNow(Math.min(-1, dueOffset - 2)),
    };
  }) satisfies Prisma.ActivityCreateManyInput[];
  const noteData = noteIds.map((id, index) => {
    const contactIndex = index % contactIds.length;
    const dealIndex = index - 50;
    const companyIndex = index - 70;
    let subject: string;
    if (index < 50) subject = `${firstNames[contactIndex]} ${lastNames[contactIndex]}`;
    else if (index < 70) subject = dealData[dealIndex].title;
    else subject = companyCatalog[companyIndex][0];
    return {
      id,
      content: `${subject}: ${noteTopics[index % noteTopics.length]}`,
      contactId: index < 50 ? contactIds[contactIndex] : null,
      dealId: index >= 50 && index < 70 ? dealIds[dealIndex] : null,
      companyId: index >= 70 ? companyIds[companyIndex] : null,
      authorId: userIds[index % userIds.length],
      createdAt: daysFromNow(-(index % 88)),
    };
  }) satisfies Prisma.NoteCreateManyInput[];

  await prisma.$transaction(
    async (tx) => {
      await tx.user.createMany({ data: userData, skipDuplicates: true });
      await tx.pipelineStage.createMany({
        data: stages.map((stage, index) => ({ id: stageIds[index], ...stage, position: index })),
        skipDuplicates: true,
      });
      await tx.company.createMany({ data: companyData, skipDuplicates: true });
      await tx.tag.createMany({
        data: tags.map(([name, color], index) => ({ id: tagIds[index], name, color })),
        skipDuplicates: true,
      });

      const existingContacts = new Set(
        (
          await tx.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true },
          })
        ).map(({ id }) => id),
      );
      for (const [index, contact] of contactData.entries()) {
        if (existingContacts.has(contact.id)) continue;
        await tx.contact.create({
          data: {
            ...contact,
            tags: { connect: [{ id: tagIds[index % tagIds.length] }, { id: tagIds[(index + 3) % tagIds.length] }] },
          },
        });
      }

      const existingDeals = new Set(
        (
          await tx.deal.findMany({
            where: { id: { in: dealIds } },
            select: { id: true },
          })
        ).map(({ id }) => id),
      );
      for (const [index, deal] of dealData.entries()) {
        if (existingDeals.has(deal.id)) continue;
        await tx.deal.create({
          data: { ...deal, tags: { connect: [{ id: tagIds[(index + 2) % tagIds.length] }] } },
        });
      }

      await tx.activity.createMany({ data: activityData, skipDuplicates: true });
      await tx.note.createMany({ data: noteData, skipDuplicates: true });
    },
    { timeout: 120_000 },
  );

  const counts = await Promise.all([
    prisma.user.count({ where: { id: { in: userIds } } }),
    prisma.pipelineStage.count({ where: { id: { in: stageIds } } }),
    prisma.company.count({ where: { id: { in: companyIds } } }),
    prisma.contact.count({ where: { id: { in: contactIds } } }),
    prisma.deal.count({ where: { id: { in: dealIds } } }),
    prisma.activity.count({ where: { id: { in: activityIds } } }),
    prisma.note.count({ where: { id: { in: noteIds } } }),
    prisma.tag.count({ where: { id: { in: tagIds } } }),
  ]);
  const labels = ["users", "stages", "companies", "contacts", "deals", "activities", "notes", "tags"];
  console.log(`Demo seed ready: ${counts.map((count, index) => `${count} ${labels[index]}`).join(", ")}.`);
}

async function main() {
  try {
    await seed();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
