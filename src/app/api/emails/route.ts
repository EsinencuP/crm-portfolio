import { EmailDirection, EmailStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

import { POST as sendPost } from "./send/route";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const listSchema = z.object({
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  direction: z.enum(EmailDirection).optional(),
  status: z.enum(EmailStatus).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

async function scope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const member = await getActiveWorkspaceMember(user.id);
  return member ? { userId: user.id, workspaceId: member.workspaceId } : null;
}

export async function GET(request: Request) {
  const current = await scope();
  if (!current) return Response.json({ error: "Not authorized" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const messageId = params.get("messageId");
  if (messageId) {
    if (messageId.length > 128) return Response.json({ error: "Invalid message" }, { status: 400, headers });
    const message = await prisma.emailMessage.findFirst({
      where: { id: messageId, workspaceId: current.workspaceId, account: { userId: current.userId } },
      select: {
        id: true,
        accountId: true,
        direction: true,
        from: true,
        to: true,
        cc: true,
        subject: true,
        snippet: true,
        bodyHtml: true,
        bodyText: true,
        sentAt: true,
        receivedAt: true,
        status: true,
        contactId: true,
        dealId: true,
        createdAt: true,
      },
    });
    return message
      ? Response.json({ message }, { headers })
      : Response.json({ error: "Message not found" }, { status: 404, headers });
  }
  const query = listSchema.safeParse(Object.fromEntries(params));
  if (!query.success) return Response.json({ error: "Invalid email filters" }, { status: 400, headers });
  const { accountId, contactId, dealId, direction, status, search, page, limit } = query.data;
  const where: Prisma.EmailMessageWhereInput = {
    workspaceId: current.workspaceId,
    account: { userId: current.userId, workspaceId: current.workspaceId },
    ...(accountId ? { accountId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(dealId ? { dealId } : {}),
    ...(direction ? { direction } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" } },
            { from: { contains: search, mode: "insensitive" } },
            { snippet: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [messages, total] = await prisma.$transaction([
    prisma.emailMessage.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        accountId: true,
        direction: true,
        from: true,
        to: true,
        cc: true,
        subject: true,
        snippet: true,
        bodyHtml: true,
        bodyText: true,
        sentAt: true,
        receivedAt: true,
        status: true,
        contactId: true,
        dealId: true,
        createdAt: true,
      },
    }),
    prisma.emailMessage.count({ where }),
  ]);
  return Response.json({ messages, total, page, totalPages: Math.ceil(total / limit) }, { headers });
}

export async function POST(request: Request) {
  return sendPost(request);
}
