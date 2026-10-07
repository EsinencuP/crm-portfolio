import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { fieldsSchema, submissionSchema } from "@/lib/forms/config";
import { createNotification } from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { createContactSchema } from "@/lib/validations/contact";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

const envelope = z
  .object({
    data: z.record(z.string(), z.union([z.string().max(10000), z.boolean()])),
    requestId: z.uuid(),
    website: z.string().max(1000).default(""),
  })
  .strict();
export class SubmissionError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
// Only trust forwarding headers when the deployment strips client-supplied values.
export function submissionIp(request: Request) {
  if (process.env.FORMS_TRUST_PROXY !== "true") return null;
  const value = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return value && isIP(value) ? value : null;
}
export async function submitLeadForm(slug: string, body: unknown, request: Request) {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) throw new SubmissionError(400, "Invalid submission.");
  const input = parsed.data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize this form's submissions and configuration edits, including replay checks.
        const locked = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "LeadCaptureForm" WHERE "slug" = ${slug} FOR UPDATE`;
        if (!locked.length) throw new SubmissionError(404, "Form not available.");
        const form = await tx.leadCaptureForm.findUniqueOrThrow({ where: { id: locked[0].id } });
        if (!form.isActive) throw new SubmissionError(404, "Form not available.");
        const result = {
          message: form.thankyouMessage ?? "Thank you! We'll be in touch.",
          redirectUrl: form.redirectUrl,
        };
        if (input.website) return result;
        const fields = fieldsSchema.safeParse(form.fields);
        if (!fields.success) throw new SubmissionError(503, "Form configuration needs attention.");
        const values = submissionSchema(fields.data).safeParse(input.data);
        if (!values.success) {
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of values.error.issues) {
            const name = String(issue.path[0] ?? "form");
            fieldErrors[name] = [...(fieldErrors[name] ?? []), issue.message];
          }
          throw new SubmissionError(400, "Check the highlighted fields.", fieldErrors);
        }
        const replay = await tx.formSubmission.findUnique({
          where: { formId_clientRequestId: { formId: form.id, clientRequestId: input.requestId } },
          select: { id: true },
        });
        if (replay) return result;
        const ipAddress = submissionIp(request);
        const since = new Date(Date.now() - 60000);
        const [formRate, ipRate] = await Promise.all([
          tx.formSubmission.count({ where: { formId: form.id, createdAt: { gte: since } } }),
          ipAddress ? tx.formSubmission.count({ where: { formId: form.id, ipAddress, createdAt: { gte: since } } }) : 0,
        ]);
        if (formRate >= 60 || ipRate >= 5)
          throw new SubmissionError(429, "Too many submissions. Please try again in a minute.");
        const data = values.data;
        const text = (name: string) => (typeof data[name] === "string" ? (data[name] as string) : "");
        const email = text("email").toLowerCase() || null;
        let contact = email
          ? await tx.contact.findFirst({
              where: { workspaceId: form.workspaceId, email: { equals: email, mode: "insensitive" } },
              select: { id: true, ownerId: true },
            })
          : null;
        const routingIds = [form.assignToId, form.createdById].filter((id): id is string => Boolean(id));
        const routingMembers = await tx.workspaceMember.findMany({
          where: {
            workspaceId: form.workspaceId,
            OR: [{ userId: { in: routingIds } }, { role: { in: ["OWNER", "ADMIN"] } }],
            role: { not: "VIEWER" },
          },
          orderBy: { joinedAt: "asc" },
        });
        const operator =
          routingMembers.find((member) => member.userId === form.assignToId) ??
          routingMembers.find((member) => member.userId === form.createdById) ??
          routingMembers.find((member) => ["OWNER", "ADMIN"].includes(member.role));
        if (!operator)
          throw new SubmissionError(503, "No lead owner is available. Please contact the business directly.");
        let canEdit = !contact || contact.ownerId === operator.userId || ["OWNER", "ADMIN"].includes(operator.role);
        if (contact && !canEdit) {
          const grant = await tx.recordPermission.findUnique({
            where: {
              workspaceId_entityType_entityId_userId: {
                workspaceId: form.workspaceId,
                entityType: "Contact",
                entityId: contact.id,
                userId: operator.userId,
              },
            },
            select: { permission: true },
          });
          canEdit = Boolean(grant && ["EDIT", "FULL"].includes(grant.permission));
        }
        const tags =
          canEdit && form.tagIds.length
            ? await tx.tag.findMany({
                where: { id: { in: form.tagIds }, workspaceId: form.workspaceId },
                select: { id: true },
              })
            : [];
        if (!contact) {
          const contactData = createContactSchema.parse({
            firstName: text("firstName") || "Website",
            lastName: text("lastName") || "Lead",
            email,
            phone: text("phone") || null,
            notes_text: text("message") || null,
            source: "WEBSITE",
            ownerId: operator.userId,
          });
          contact = await tx.contact.create({
            data: {
              ...contactData,
              workspaceId: form.workspaceId,
              customFields: data as Prisma.InputJsonValue,
              tags: { connect: tags },
            },
            select: { id: true, ownerId: true },
          });
        } else if (canEdit && (tags.length || !contact.ownerId)) {
          await tx.contact.update({
            where: { id: contact.id, workspaceId: form.workspaceId },
            data: { ...(!contact.ownerId ? { ownerId: operator.userId } : {}), tags: { connect: tags } },
          });
        }
        const stage =
          canEdit && form.pipelineStageId
            ? await tx.pipelineStage.findFirst({
                where: { id: form.pipelineStageId, workspaceId: form.workspaceId },
                select: { id: true },
              })
            : null;
        if (stage) {
          const workspace = await tx.workspace.findUniqueOrThrow({
            where: { id: form.workspaceId },
            select: { defaultCurrency: true },
          });
          await tx.deal.create({
            data: {
              title: `${form.name}: ${text("firstName") || "Website lead"}`.slice(0, 200),
              stageId: stage.id,
              contactId: contact.id,
              workspaceId: form.workspaceId,
              currency: workspace.defaultCurrency,
              ownerId: operator.userId,
              description: text("message") || null,
            },
          });
        }
        const submission = await tx.formSubmission.create({
          data: {
            formId: form.id,
            data: data as Prisma.InputJsonValue,
            contactId: contact.id,
            clientRequestId: input.requestId,
            ipAddress,
            userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
            referrer: request.headers.get("referer")?.slice(0, 2048) ?? null,
            processed: true,
          },
        });
        // Preserve editor version: incoming submissions must not conflict with settings saves.
        await tx.leadCaptureForm.update({
          where: { id: form.id },
          data: { submissionCount: { increment: 1 }, updatedAt: form.updatedAt },
        });
        let notificationLink = "/dashboard/notifications";
        if (["OWNER", "ADMIN", "MANAGER"].includes(operator.role)) notificationLink = `/dashboard/forms/${form.id}`;
        else if (canEdit) notificationLink = `/dashboard/contacts/${contact.id}`;
        await createNotification(
          {
            type: "FORM_SUBMISSION",
            title: `New lead from ${form.name}`,
            body: "A new form submission is ready to review.",
            link: notificationLink,
            userId: operator.userId,
            workspaceId: form.workspaceId,
            metadata: { formId: form.id, submissionId: submission.id },
          },
          tx,
        );
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code) &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
  throw new SubmissionError(503, "Please try again.");
}

// Stable key utility for logs; do not log submitted personal data.
export function formLogKey(slug: string) {
  return createHash("sha256").update(slug).digest("hex").slice(0, 12);
}
