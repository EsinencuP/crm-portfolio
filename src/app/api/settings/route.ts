import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const settingsSchema = z.object({
  appName: z.string().trim().min(2).max(80),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid IANA time zone."),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  return Response.json(
    { settings: { appName: member.workspace.name, timezone: member.workspace.timezone } },
    { headers },
  );
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role !== "OWNER" && member.role !== "ADMIN")
    return Response.json({ error: "Owner or admin access required." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid settings.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  const workspace = await prisma.workspace.update({
    where: { id: member.workspaceId },
    data: { name: parsed.data.appName, timezone: parsed.data.timezone },
  });
  return Response.json({ settings: { appName: workspace.name, timezone: workspace.timezone } }, { headers });
}
