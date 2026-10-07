import { configData, formActor, formFailure, formHeaders, readFormBody, validFormRouting } from "@/lib/forms/access";
import { formConfigSchema } from "@/lib/forms/config";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1),
  );
  const where = { workspaceId: actor.member.workspaceId };
  const [forms, total] = await Promise.all([
    prisma.leadCaptureForm.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        submissionCount: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.leadCaptureForm.count({ where }),
  ]);
  return Response.json({ forms, total, page }, { headers: formHeaders });
}
export async function POST(request: Request) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const parsed = formConfigSchema.safeParse(await readFormBody(request));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid form." },
      { status: 400, headers: formHeaders },
    );
  if (!(await validFormRouting(parsed.data, actor.member.workspaceId)))
    return Response.json(
      { error: "Owner, tags and stage must belong to this workspace; viewers cannot own leads." },
      { status: 400, headers: formHeaders },
    );
  try {
    const form = await prisma.leadCaptureForm.create({
      data: { ...configData(parsed.data), workspaceId: actor.member.workspaceId, createdById: actor.member.userId },
    });
    return Response.json({ form }, { status: 201, headers: formHeaders });
  } catch (error) {
    return formFailure(error);
  }
}
