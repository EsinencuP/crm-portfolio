import "server-only";

import { type EmailAccount, Prisma } from "@prisma/client";
import { type gmail_v1, google } from "googleapis";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { accessTokenFor } from "./tokens";

function address(value?: string | null) {
  const match = value?.match(/<([^<>]+)>/);
  return (match?.[1] ?? value ?? "").trim().toLowerCase();
}

export async function autoLinkContact(emailAddress: string, workspaceId: string) {
  const contact = await prisma.contact.findFirst({
    where: { workspaceId, email: { equals: address(emailAddress), mode: "insensitive" } },
    select: { id: true },
  });
  return contact?.id ?? null;
}

function decode(value?: string | null) {
  if (!value) return null;
  return Buffer.from(value, "base64url").toString("utf8");
}

function gmailBodies(payload?: gmail_v1.Schema$MessagePart) {
  const result: { html: string | null; text: string | null } = { html: null, text: null };
  function visit(part?: gmail_v1.Schema$MessagePart) {
    if (!part) return;
    if (part.mimeType === "text/html") result.html = decode(part.body?.data) ?? result.html;
    if (part.mimeType === "text/plain") result.text = decode(part.body?.data) ?? result.text;
    for (const child of part.parts ?? []) visit(child);
  }
  visit(payload);
  return result;
}

async function saveMessage(
  account: EmailAccount,
  data: {
    externalId: string;
    threadId?: string | null;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyHtml?: string | null;
    bodyText?: string | null;
    snippet?: string | null;
    sentAt?: Date | null;
    receivedAt?: Date | null;
    direction: "INBOUND" | "OUTBOUND";
  },
) {
  const existing = await prisma.emailMessage.findUnique({
    where: { accountId_externalId: { accountId: account.id, externalId: data.externalId } },
    select: { id: true },
  });
  if (existing) return;
  const contactId = await autoLinkContact(
    data.direction === "INBOUND" ? data.from : (data.to[0] ?? ""),
    account.workspaceId,
  );
  try {
    await prisma.emailMessage.create({
      data: {
        ...data,
        accountId: account.id,
        workspaceId: account.workspaceId,
        contactId,
        status: data.direction === "INBOUND" ? "DELIVERED" : "SENT",
      },
    });
    if (data.direction === "INBOUND") {
      try {
        await createNotification({
          type: "EMAIL_RECEIVED",
          title: `Email from ${data.from}`,
          body: data.subject,
          link: "/dashboard/mail",
          userId: account.userId,
          workspaceId: account.workspaceId,
        });
      } catch (error) {
        console.error(
          "Email notification could not be created",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

export async function syncGmailMessages(accountId: string) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account?.syncEnabled || account.provider !== "GMAIL") return;
  const token = await accessTokenFor(account);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const ownAddress = address(profile.data.emailAddress);
  const ids: string[] = [];
  let cursor = account.syncCursor;
  if (cursor) {
    try {
      let pageToken: string | undefined;
      do {
        const page = await gmail.users.history.list({
          userId: "me",
          startHistoryId: cursor,
          historyTypes: ["messageAdded"],
          pageToken,
          maxResults: 100,
        });
        for (const event of page.data.history ?? [])
          for (const added of event.messagesAdded ?? []) if (added.message?.id) ids.push(added.message.id);
        pageToken = page.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      const failure = error as { code?: number | string; response?: { status?: number } };
      const status = Number(failure.response?.status ?? failure.code);
      if (status !== 404) throw error;
      cursor = null;
    }
  }
  if (!cursor) {
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const page = await gmail.users.messages.list({ userId: "me", maxResults: 100, pageToken, q: "newer_than:30d" });
      for (const item of page.data.messages ?? []) if (item.id) ids.push(item.id);
      pageToken = page.data.nextPageToken ?? undefined;
      pages++;
    } while (pageToken && pages < 10);
  }
  for (const id of new Set(ids)) {
    const { data: message } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    if (!message.id || message.labelIds?.includes("DRAFT")) continue;
    const headers = Object.fromEntries(
      (message.payload?.headers ?? []).map((header) => [(header.name ?? "").toLowerCase(), header.value ?? ""]),
    );
    const from = address(headers.from);
    const to = (headers.to ?? "").split(",").map(address).filter(Boolean);
    const bodies = gmailBodies(message.payload ?? undefined);
    const date = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
    const direction = message.labelIds?.includes("SENT") || from === ownAddress ? "OUTBOUND" : "INBOUND";
    await saveMessage(account, {
      externalId: message.id,
      threadId: message.threadId,
      from,
      to,
      cc: (headers.cc ?? "").split(",").map(address).filter(Boolean),
      subject: headers.subject ?? "(No subject)",
      bodyHtml: bodies.html,
      bodyText: bodies.text,
      snippet: message.snippet,
      direction,
      sentAt: direction === "OUTBOUND" ? date : null,
      receivedAt: direction === "INBOUND" ? date : null,
    });
  }
  await prisma.emailAccount.updateMany({
    where: { id: account.id, syncEnabled: true },
    data: { syncCursor: profile.data.historyId ?? account.syncCursor, lastSyncAt: new Date() },
  });
}

type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  sentDateTime?: string;
  receivedDateTime?: string;
  isDraft?: boolean;
  "@removed"?: unknown;
};
type GraphPage = { value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

export async function syncOutlookMessages(accountId: string) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account?.syncEnabled || account.provider !== "OUTLOOK") return;
  const token = await accessTokenFor(account);
  const saved: Record<string, string> = account.syncCursor ? JSON.parse(account.syncCursor) : {};
  for (const folder of ["inbox", "sentitems"] as const) {
    let url =
      saved[folder] ??
      `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta?$select=id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isDraft&$top=100`;
    let pageCount = 0;
    while (url) {
      const graphUrl = new URL(url);
      if (
        graphUrl.origin !== "https://graph.microsoft.com" ||
        !/^\/v1\.0\/me\/mailfolders(?:\/|\()/i.test(graphUrl.pathname)
      )
        throw new Error("Invalid Graph sync cursor");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`Outlook sync failed: ${response.status}`);
      const page: GraphPage = await response.json();
      for (const message of page.value ?? []) {
        if (!message.id || message.isDraft || message["@removed"]) continue;
        const direction = folder === "sentitems" ? "OUTBOUND" : "INBOUND";
        const date = message.receivedDateTime ? new Date(message.receivedDateTime) : new Date();
        await saveMessage(account, {
          externalId: message.id,
          threadId: message.conversationId,
          from: address(message.from?.emailAddress?.address),
          to: (message.toRecipients ?? []).map((recipient) => address(recipient.emailAddress?.address)).filter(Boolean),
          cc: (message.ccRecipients ?? []).map((recipient) => address(recipient.emailAddress?.address)).filter(Boolean),
          subject: message.subject ?? "(No subject)",
          bodyHtml: message.body?.contentType === "html" ? message.body.content : null,
          bodyText: message.body?.contentType === "text" ? message.body.content : null,
          snippet: message.bodyPreview,
          direction,
          sentAt: direction === "OUTBOUND" ? new Date(message.sentDateTime ?? date) : null,
          receivedAt: direction === "INBOUND" ? date : null,
        });
      }
      pageCount++;
      const nextCursor = page["@odata.nextLink"] ?? page["@odata.deltaLink"];
      if (nextCursor) {
        saved[folder] = nextCursor;
        await prisma.emailAccount.updateMany({
          where: { id: account.id, syncEnabled: true },
          data: { syncCursor: JSON.stringify(saved), ...(page["@odata.deltaLink"] ? { lastSyncAt: new Date() } : {}) },
        });
      }
      url = page["@odata.nextLink"] ?? "";
      if (pageCount >= 25 && url) break;
    }
  }
}
