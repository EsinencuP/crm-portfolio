import { z } from "zod";

import { configData, formActor, formFailure, formHeaders, readFormBody, validFormRouting } from "@/lib/forms/access";
import { formConfigSchema } from "@/lib/forms/config";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const form = await prisma.leadCaptureForm.findFirst({ where: { id, workspaceId: actor.member.workspaceId } });
  return form
    ? Response.json({ form }, { headers: formHeaders })
    : Response.json({ error: "Form not found." }, { status: 404, headers: formHeaders });
}
const patchSchema = z.union([
  formConfigSchema.extend({ updatedAt: z.iso.datetime() }),
  z.object({ isActive: z.boolean(), updatedAt: z.iso.datetime() }).strict(),
]);
export async function PATCH(request: Request, { params }: Context) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await readFormBody(request));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid form." },
      { status: 400, headers: formHeaders },
    );
  const { updatedAt, ...input } = parsed.data;
  if (!(await validFormRouting(input, actor.member.workspaceId)))
    return Response.json({ error: "Invalid workspace routing." }, { status: 400, headers: formHeaders });
  try {
    const form = await prisma.leadCaptureForm.update({
      where: { id, workspaceId: actor.member.workspaceId, updatedAt: new Date(updatedAt) },
      data: "fields" in input ? configData(input) : input,
    });
    return Response.json({ form }, { headers: formHeaders });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025")
      return Response.json(
        { error: "Form changed or was deleted. Reload before saving." },
        { status: 409, headers: formHeaders },
      );
    return formFailure(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const input = z
    .object({ updatedAt: z.iso.datetime() })
    .strict()
    .safeParse(await readFormBody(request));
  if (!input.success)
    return Response.json({ error: "Provide the current form version." }, { status: 400, headers: formHeaders });
  try {
    await prisma.leadCaptureForm.delete({
      where: { id, workspaceId: actor.member.workspaceId, updatedAt: new Date(input.data.updatedAt) },
    });
    return new Response(null, { status: 204, headers: formHeaders });
  } catch (error) {
    return formFailure(error);
  }
}
