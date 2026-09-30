import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

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
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return Response.json({ settings: settings ?? { appName: "CRM Portfolio", timezone: "UTC" } }, { headers });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (user.role !== "ADMIN") return Response.json({ error: "Admin access required." }, { status: 403, headers });
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
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });
  return Response.json({ settings }, { headers });
}
