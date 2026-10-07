import { formActor, formHeaders } from "@/lib/forms/access";
import { getAccessibleEntityIds } from "@/lib/permissions";
import prisma from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const form = await prisma.leadCaptureForm.findFirst({
    where: { id, workspaceId: actor.member.workspaceId },
    select: { id: true },
  });
  if (!form) return Response.json({ error: "Form not found." }, { status: 404, headers: formHeaders });
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1),
  );
  const [rows, total, accessible] = await Promise.all([
    prisma.formSubmission.findMany({
      where: { formId: id },
      select: { id: true, data: true, createdAt: true, processed: true, contactId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.formSubmission.count({ where: { formId: id } }),
    getAccessibleEntityIds(actor.member.userId, "Contact", actor.member.workspaceId),
  ]);
  const ids = new Set(accessible);
  return Response.json(
    {
      submissions: rows.map((row) => ({
        ...row,
        contactId: row.contactId && ids.has(row.contactId) ? row.contactId : null,
      })),
      total,
      page,
    },
    { headers: formHeaders },
  );
}
