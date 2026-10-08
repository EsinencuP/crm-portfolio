import { z } from "zod";

import { getAccessibleEntityIds } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { DocumentError, documentActor, documentError, documentHeaders } from "@/lib/quotations/access";
export const runtime = "nodejs";
const querySchema = z.object({
  type: z.enum(["contact", "company"]),
  search: z.string().trim().max(100).default(""),
  companyId: z.string().max(128).optional(),
});
export async function GET(request: Request) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const params = new URL(request.url).searchParams,
      query = querySchema.parse(
        Object.fromEntries(["type", "search", "companyId"].map((key) => [key, params.get(key) ?? undefined])),
      );
    const { workspaceId, userId } = actor.member;
    if (query.type === "company") {
      const ids = await getAccessibleEntityIds(userId, "Company", workspaceId);
      const rows = await prisma.company.findMany({
        where: {
          workspaceId,
          id: { in: ids },
          ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 25,
      });
      return Response.json(
        { options: rows.map((row) => ({ id: row.id, label: row.name })) },
        { headers: documentHeaders },
      );
    }
    const ids = await getAccessibleEntityIds(userId, "Contact", workspaceId);
    if (query.companyId && !(await getAccessibleEntityIds(userId, "Company", workspaceId)).includes(query.companyId))
      throw new DocumentError("Company is not accessible.", 403);
    const rows = await prisma.contact.findMany({
      where: {
        workspaceId,
        id: { in: ids },
        status: { not: "ARCHIVED" },
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: "insensitive" as const } },
                { lastName: { contains: query.search, mode: "insensitive" as const } },
                { email: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, companyId: true },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      take: 25,
    });
    return Response.json(
      {
        options: rows.map((row) => ({
          id: row.id,
          label: `${row.firstName} ${row.lastName}`,
          email: row.email,
          companyId: row.companyId,
        })),
      },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Invalid client search." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
