import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const searchSchema = z.string().trim().max(100);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view companies." }, { status: 401, headers });

  const search = searchSchema.safeParse(new URL(request.url).searchParams.get("search") ?? "");
  if (!search.success) return Response.json({ error: "Search is too long." }, { status: 400, headers });

  try {
    const companies = await prisma.company.findMany({
      where: search.data ? { name: { contains: search.data, mode: "insensitive" } } : undefined,
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 20,
    });
    return Response.json({ companies }, { headers });
  } catch {
    return Response.json({ error: "Unable to load companies. Please try again." }, { status: 500, headers });
  }
}
