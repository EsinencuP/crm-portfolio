import "server-only";

import { google } from "googleapis";
import sanitizeHtml from "sanitize-html";

import { emailMimeContent, graphPdfAttachments, type PdfEmailAttachment } from "@/lib/email/attachments";
import { graphClient } from "@/lib/email/outlook-client";
import { accessTokenFor } from "@/lib/email/tokens";
import { assertTrackingReady, safeDestination, trackedClickUrl, trackingOrigin } from "@/lib/email/tracking";
import { canAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";

import { randomUUID } from "node:crypto";

export interface SendEmailInput {
  accountId: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  contactId?: string;
  dealId?: string;
  trackingEnabled?: boolean;
  userId: string;
  workspaceId: string;
  attachments?: PdfEmailAttachment[];
}

function prepareHtml(html: string, trackingId: string | null) {
  if (trackingId) assertTrackingReady();
  const clean = sanitizeHtml(html, {
    allowedTags: [
      "a",
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "hr",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => {
        const destination = attributes.href ? safeDestination(attributes.href) : null;
        return {
          tagName: "a",
          attribs: {
            ...attributes,
            ...(trackingId && destination ? { href: trackedClickUrl(trackingId, destination) } : {}),
          },
        };
      },
    },
  });
  if (!clean.trim()) throw new Error("Email body is empty");
  if (!trackingId) return clean;
  const pixel = new URL(`/api/track/open/${trackingId}`, trackingOrigin());
  return `${clean}<img src="${pixel.toString()}" width="1" height="1" alt="" style="display:none" />`;
}

export async function sendEmail(input: SendEmailInput) {
  if (
    input.attachments?.some(
      (file) =>
        !/^[a-zA-Z0-9._-]{1,120}$/.test(file.filename) ||
        file.contentType !== "application/pdf" ||
        file.content.byteLength > 5 * 1024 * 1024,
    ) ||
    (input.attachments?.length ?? 0) > 2
  )
    throw new Error("Invalid email attachments");
  const account = await prisma.emailAccount.findFirst({
    where: { id: input.accountId, userId: input.userId, workspaceId: input.workspaceId },
  });
  if (!account) throw new Error("Email account not found");
  if (account.provider !== "GMAIL" && account.provider !== "OUTLOOK") throw new Error("Unsupported email provider");
  if (input.contactId) {
    if (!(await canAccess(input.userId, "Contact", input.contactId, "EDIT", input.workspaceId)))
      throw new Error("Contact not accessible");
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { email: true },
    });
    if (!contact?.email || !input.to.some((address) => address.toLowerCase() === contact.email?.toLowerCase()))
      throw new Error("Recipient does not match contact email");
  }
  if (input.dealId && !(await canAccess(input.userId, "Deal", input.dealId, "EDIT", input.workspaceId)))
    throw new Error("Deal not accessible");

  let contactId = input.contactId ?? null;
  if (!contactId) {
    const matched = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, email: { equals: input.to[0], mode: "insensitive" } },
      select: { id: true },
    });
    if (matched && (await canAccess(input.userId, "Contact", matched.id, "EDIT", input.workspaceId)))
      contactId = matched.id;
  }

  const trackingId = input.trackingEnabled ? randomUUID() : null;
  const finalHtml = prepareHtml(input.bodyHtml, trackingId);
  const cc = input.cc ?? [];
  const message = await prisma.emailMessage.create({
    data: {
      accountId: account.id,
      workspaceId: account.workspaceId,
      direction: "OUTBOUND",
      from: account.email,
      to: input.to,
      cc,
      subject: input.subject,
      bodyHtml: finalHtml,
      snippet: sanitizeHtml(input.bodyHtml, { allowedTags: [], allowedAttributes: {} }).slice(0, 200),
      status: "SENDING",
      trackingId,
      contactId,
      dealId: input.dealId ?? null,
    },
  });
  let providerAccepted = false;
  try {
    const accessToken = await accessTokenFor(account);
    let externalId: string | null = null;
    if (account.provider === "GMAIL") {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const boundary = `crm-${randomUUID()}`;
      const attachments = input.attachments ?? [];
      const content = emailMimeContent(finalHtml, attachments, boundary);
      const raw = [
        `From: ${account.email}`,
        `To: ${input.to.join(", ")}`,
        ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
        `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        ...content,
      ].join("\r\n");
      const result = await google.gmail({ version: "v1", auth }).users.messages.send({
        userId: "me",
        requestBody: { raw: Buffer.from(raw).toString("base64url") },
      });
      externalId = result.data.id ?? null;
      providerAccepted = true;
    } else {
      await graphClient(accessToken)
        .api("/me/sendMail")
        .post({
          message: {
            subject: input.subject,
            body: { contentType: "HTML", content: finalHtml },
            toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
            ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
            ...(input.attachments?.length ? { attachments: graphPdfAttachments(input.attachments) } : {}),
          },
          saveToSentItems: true,
        });
      providerAccepted = true;
    }
    return await prisma.emailMessage.update({
      where: { id: message.id },
      data: { externalId, status: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    if (providerAccepted)
      throw new Error("Provider accepted the email, but CRM could not confirm it. Check Sent before retrying.");
    await prisma.emailMessage.updateMany({ where: { id: message.id, status: "SENDING" }, data: { status: "FAILED" } });
    throw error;
  }
}
