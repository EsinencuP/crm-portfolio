import "server-only";

import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const productHeaders = { "Cache-Control": "private, no-store" };
export const productSelect = {
  id: true,
  name: true,
  sku: true,
  description: true,
  unitPrice: true,
  currency: true,
  unit: true,
  taxRate: true,
  isActive: true,
  category: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;
export async function productActor(write = false) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401, headers: productHeaders }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member)
    return { error: Response.json({ error: "Select a workspace." }, { status: 409, headers: productHeaders }) };
  if (write && member.role === "VIEWER")
    return { error: Response.json({ error: "Viewer role is read-only." }, { status: 403, headers: productHeaders }) };
  return { member };
}
export async function readProductBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return { error: Response.json({ error: "Please send JSON." }, { status: 415, headers: productHeaders }) };
  const reader = request.body?.getReader();
  if (!reader)
    return { error: Response.json({ error: "Invalid JSON body." }, { status: 400, headers: productHeaders }) };
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return {
          error: Response.json({ error: "Product payload exceeds 32 KiB." }, { status: 413, headers: productHeaders }),
        };
      }
      chunks.push(result.value);
    }
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch {
    return { error: Response.json({ error: "Invalid JSON body." }, { status: 400, headers: productHeaders }) };
  } finally {
    reader.releaseLock();
  }
}
export function productFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2002")
    return Response.json(
      {
        error: "This SKU is already used in this workspace, including deleted products.",
        fieldErrors: { sku: ["SKU must be unique in this workspace."] },
      },
      { status: 409, headers: productHeaders },
    );
  if (code === "P2025")
    return Response.json(
      { error: "Product changed or was deleted. Reload before saving." },
      { status: 409, headers: productHeaders },
    );
  console.error("Product operation failed", code ?? "unexpected");
  return Response.json({ error: "Unable to update the product catalog." }, { status: 500, headers: productHeaders });
}
