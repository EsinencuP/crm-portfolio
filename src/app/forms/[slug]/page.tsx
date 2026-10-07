import { notFound } from "next/navigation";

import { PublicForm } from "@/components/forms/public-form";
import { fieldsSchema, styleSchema } from "@/lib/forms/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await prisma.leadCaptureForm.findFirst({
    where: { slug, isActive: true },
    select: { name: true, slug: true, description: true, fields: true, style: true },
  });
  if (!form) notFound();
  const fields = fieldsSchema.safeParse(form.fields);
  const style = styleSchema.safeParse(form.style ?? {});
  if (!fields.success || !style.success) notFound();
  return <PublicForm config={{ ...form, fields: fields.data, style: style.data }} />;
}
