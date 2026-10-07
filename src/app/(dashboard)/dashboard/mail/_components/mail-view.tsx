"use client";

import { format } from "date-fns";

import type { MailRow } from "./mail-list";

export function MailView({ message }: { message: MailRow | null }) {
  if (!message)
    return (
      <section className="flex min-h-72 items-center justify-center p-6 text-muted-foreground">
        Select an email to read it.
      </section>
    );
  const safeDocument = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;"><meta name="referrer" content="no-referrer"><body>${message.bodyHtml ?? ""}</body>`;
  return (
    <section aria-label="Message content" className="min-w-0 p-5">
      <h2 className="break-words font-semibold text-xl">{message.subject}</h2>
      <div className="mt-4 space-y-1 border-b pb-4 text-sm">
        <p>
          <strong>From:</strong> {message.from}
        </p>
        <p>
          <strong>To:</strong> {message.to.join(", ")}
        </p>
        {message.cc.length > 0 && (
          <p>
            <strong>Cc:</strong> {message.cc.join(", ")}
          </p>
        )}
        <p className="text-muted-foreground">
          {format(new Date(message.receivedAt ?? message.sentAt ?? message.createdAt), "PPpp")}
        </p>
      </div>
      {message.bodyHtml ? (
        <iframe
          title={`Email body: ${message.subject}`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={safeDocument}
          className="mt-4 min-h-[55vh] w-full rounded-lg border bg-white"
        />
      ) : (
        <p className="mt-4 whitespace-pre-wrap break-words text-sm">
          {message.bodyText ?? message.snippet ?? "(Empty message)"}
        </p>
      )}
    </section>
  );
}
