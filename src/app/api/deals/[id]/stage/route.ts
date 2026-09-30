import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { changeDealStageSchema } from "@/lib/validations/deal";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to move deals." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid deal ID." }, { status: 400, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Please send JSON." }, { status: 415, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = changeDealStageSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Please provide a stageId only.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  try {
    const deal = await prisma.deal.update({
      where: { id: id.data },
      data: { stageId: parsed.data.stageId },
      select: { id: true, stageId: true, stage: true, updatedAt: true },
    });
    return Response.json(deal, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return Response.json({ error: "Deal not found." }, { status: 404, headers });
      if (error.code === "P2003") return Response.json({ error: "Stage not found." }, { status: 404, headers });
    }
    return Response.json({ error: "Unable to move deal." }, { status: 500, headers });
  }
}
