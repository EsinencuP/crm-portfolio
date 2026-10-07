import { readFormBody } from "@/lib/forms/access";
import { formLogKey, SubmissionError, submitLeadForm } from "@/lib/forms/submit";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The common [id] segment is the public slug here; Next.js disallows sibling [slug].
  const { id: slug } = await params;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const result = await submitLeadForm(slug, await readFormBody(request), request);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof SubmissionError)
      return Response.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: error.status, headers: { ...headers, ...(error.status === 429 ? { "Retry-After": "60" } : {}) } },
      );
    console.error("Public form submission failed", formLogKey(slug));
    return Response.json({ error: "Unable to submit. Please try again." }, { status: 503, headers });
  }
}
