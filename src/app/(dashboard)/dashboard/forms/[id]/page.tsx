import { forbidden, notFound } from "next/navigation";

import { formConfigSchema } from "@/lib/forms/config";
import prisma from "@/lib/prisma";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { FormEditor } from "./_components/form-editor";

export default async function FormEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role)) forbidden();
  const { id } = await params;
  const form = await prisma.leadCaptureForm.findFirst({ where: { id, workspaceId: member.workspaceId } });
  if (!form) notFound();
  const config = formConfigSchema.parse({
    name: form.name,
    slug: form.slug,
    description: form.description,
    fields: form.fields,
    style: form.style ?? {},
    thankyouMessage: form.thankyouMessage ?? "Thank you!",
    redirectUrl: form.redirectUrl,
    assignToId: form.assignToId,
    tagIds: form.tagIds,
    pipelineStageId: form.pipelineStageId,
    isActive: form.isActive,
  });
  return (
    <FormEditor
      key={`${member.workspaceId}:${id}`}
      workspaceId={member.workspaceId}
      formId={id}
      initialConfig={config}
      initialVersion={form.updatedAt.toISOString()}
    />
  );
}
