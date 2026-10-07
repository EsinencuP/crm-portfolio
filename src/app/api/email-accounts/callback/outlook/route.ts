import { handleEmailCallback } from "@/lib/email/callback";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleEmailCallback(request, "OUTLOOK");
}
