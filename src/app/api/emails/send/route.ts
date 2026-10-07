import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { sendEmail } from "@/lib/email/send";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

const emailSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  to: z.array(z.email()).min(1).max(20),
  cc: z.array(z.email()).max(20).default([]),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((value) => !/[\r\n]/.test(value)),
  bodyHtml: z.string().trim().min(1).max(100_000),
  contactId: z.string().trim().min(1).max(128).optional(),
  dealId: z.string().trim().min(1).max(128).optional(),
  trackingEnabled: z.boolean().default(false),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first" }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Read-only workspace" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return Response.json({ error: "Send JSON" }, { status: 415, headers });
  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid email fields" }, { status: 400, headers });
  try {
    const message = await sendEmail({ ...parsed.data, userId: user.id, workspaceId: member.workspaceId });
    return Response.json({ message }, { status: 201, headers });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not send email";
    if (text === "Email account not found") return Response.json({ error: text }, { status: 404, headers });
    if (text === "Contact not accessible" || text === "Deal not accessible")
      return Response.json({ error: text }, { status: 403, headers });
    if (
      text === "Recipient does not match contact email" ||
      text === "Unsupported email provider" ||
      text === "Email body is empty"
    )
      return Response.json({ error: text }, { status: 400, headers });
    if (text.startsWith("Provider accepted the email")) return Response.json({ error: text }, { status: 502, headers });
    return Response.json(
      { error: "Could not send email. Check account authorization and tracking configuration." },
      { status: 502, headers },
    );
  }
}
