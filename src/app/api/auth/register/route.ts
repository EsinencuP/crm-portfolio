import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { registrationSchema } from "@/lib/validations/registration";
import { defaultPipelineStages } from "@/lib/workspace-defaults";

export const runtime = "nodejs";

const emailConflict = () => Response.json({ error: "An account with this email already exists." }, { status: 409 });

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Please send registration details as JSON." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Please check your registration details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const { name, email, password } = parsed.data;
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) return emailConflict();

    const passwordHash = await hash(password, 12);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, email, passwordHash }, select: { id: true } });
      const workspace = await tx.workspace.create({
        data: { name: `${name}'s Workspace`, slug: `personal-${user.id}` },
      });
      await tx.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: "OWNER", isDefault: true },
      });
      await tx.pipelineStage.createMany({
        data: defaultPipelineStages.map((stage) => ({ ...stage, workspaceId: workspace.id })),
      });
    });

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    // The unique constraint also handles two concurrent requests for the same email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return emailConflict();

    console.error(
      "Registration failed.",
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "Unexpected error",
    );
    return Response.json({ error: "Unable to create your account. Please try again." }, { status: 500 });
  }
}
