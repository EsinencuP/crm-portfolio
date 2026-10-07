import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { callAccessWhere } from "@/lib/telephony/call-access";
import { normalizePhoneNumber } from "@/lib/telephony/call-types";
import { getTwilioConfig, initiateCall } from "@/lib/telephony/twilio-client";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const id = z.string().trim().min(1).max(128);
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).transform((value) => new Date(value));
const filters = z
  .object({
    contactId: id.optional(),
    userId: id.optional(),
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
    dateFrom: date.optional(),
    dateTo: date.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo);
const input = z.strictObject({ contactId: id, phoneNumber: z.string().max(80) });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Select a workspace first." }, { status: 409, headers });
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid call filters." }, { status: 400, headers });
  const { page, limit, dateFrom, dateTo, ...rest } = parsed.data;
  const where = {
    AND: [await callAccessWhere(member), { ...rest, createdAt: { gte: dateFrom, lte: dateTo } }],
  };
  const [calls, total] = await Promise.all([
    prisma.phoneCall.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.phoneCall.count({ where }),
  ]);
  return Response.json({ calls, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) }, { headers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Select a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Read-only workspace." }, { status: 403, headers });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Contact and phone number are required." }, { status: 400, headers });
  const { contactId, phoneNumber } = parsed.data;
  if (!(await canAccess(user.id, "Contact", contactId, "EDIT")))
    return Response.json({ error: "Contact not accessible." }, { status: 403, headers });
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: member.workspaceId } });
  const to = normalizePhoneNumber(phoneNumber);
  if (!to || !contact?.phone || to !== normalizePhoneNumber(contact.phone))
    return Response.json(
      { error: "Use the contact's saved phone number in international format (+country code)." },
      { status: 400, headers },
    );
  let config: ReturnType<typeof getTwilioConfig>;
  try {
    config = getTwilioConfig();
  } catch {
    return Response.json(
      { error: "Calling is not configured. Ask an administrator to configure Twilio and the agent phone." },
      { status: 503, headers },
    );
  }
  if ([config.fromNumber, config.agentNumber].includes(to))
    return Response.json(
      { error: "Contact number must differ from the Twilio and agent numbers." },
      { status: 400, headers },
    );

  // Save before dialing: even a very fast callback can resolve this callId.
  const call = await prisma.$transaction(async (tx) => {
    const saved = await tx.phoneCall.create({
      data: {
        direction: "OUTBOUND",
        status: "RINGING",
        fromNumber: config.fromNumber,
        toNumber: to,
        contactId,
        userId: user.id,
        workspaceId: member.workspaceId,
      },
    });
    await createAuditLog(
      {
        action: "CREATE",
        entityType: "PhoneCall",
        entityId: saved.id,
        entityName: `Call to ${contact.firstName} ${contact.lastName}`,
        userId: user.id,
        workspaceId: member.workspaceId,
        userAgent: request.headers.get("user-agent")?.slice(0, 512),
      },
      tx,
    );
    return saved;
  });
  try {
    const external = await initiateCall(config.fromNumber, to, call.id);
    // Do not overwrite a status already delivered by Twilio.
    await prisma.phoneCall.updateMany({ where: { id: call.id, externalId: null }, data: { externalId: external.sid } });
    const saved = await prisma.phoneCall.findUniqueOrThrow({ where: { id: call.id } });
    return Response.json(saved, { status: 201, headers });
  } catch {
    await prisma.phoneCall.updateMany({
      where: { id: call.id, externalId: null, status: "RINGING", dialStarted: false },
      data: { status: "FAILED" },
    });
    return Response.json(
      { error: "Could not confirm the call. Check the call log before trying again.", callId: call.id },
      { status: 502, headers },
    );
  }
}
