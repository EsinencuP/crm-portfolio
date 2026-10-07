"use client";

import { formatDistanceToNow } from "date-fns";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export type MailRow = {
  id: string;
  accountId: string;
  direction: "INBOUND" | "OUTBOUND";
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  status: string;
};

export function MailList({
  messages,
  selectedId,
  search,
  onSearch,
  onSelect,
  loading,
}: {
  messages: MailRow[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <section aria-label="Messages" className="flex min-w-0 flex-col border-r">
      <div className="border-b p-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search mail"
            placeholder="Search mail"
            className="pl-8"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="h-[60vh] lg:h-[70vh]">
        <div className="divide-y">
          {loading && <p className="p-6 text-muted-foreground text-sm">Loading mail…</p>}
          {!loading && messages.length === 0 && <p className="p-6 text-muted-foreground text-sm">No messages here.</p>}
          {messages.map((message) => (
            <button
              type="button"
              key={message.id}
              onClick={() => onSelect(message.id)}
              aria-current={selectedId === message.id ? "true" : undefined}
              className={`block w-full p-4 text-left hover:bg-muted/50 ${selectedId === message.id ? "bg-muted" : ""}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-sm">
                  {message.direction === "INBOUND" ? message.from : message.to.join(", ")}
                </span>
                <time
                  className="shrink-0 text-muted-foreground text-xs"
                  dateTime={message.receivedAt ?? message.sentAt ?? message.createdAt}
                >
                  {formatDistanceToNow(new Date(message.receivedAt ?? message.sentAt ?? message.createdAt), {
                    addSuffix: true,
                  })}
                </time>
              </span>
              <span className="mt-1 block truncate text-sm">{message.subject}</span>
              <span className="mt-1 block truncate text-muted-foreground text-xs">
                {message.snippet ?? message.bodyText ?? ""}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
