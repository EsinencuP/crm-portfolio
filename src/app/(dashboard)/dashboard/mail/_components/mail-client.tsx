"use client";

import { useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { ComposeEmail } from "./compose-email";
import { MailList, type MailRow } from "./mail-list";
import { type MailAccount, type MailFolder, MailSidebar } from "./mail-sidebar";
import { MailView } from "./mail-view";

export function MailClient() {
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("messageId");
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [messages, setMessages] = useState<MailRow[]>([]);
  const [linkedMessage, setLinkedMessage] = useState<MailRow | null>(null);
  const [accountId, setAccountId] = useState("");
  const [folder, setFolder] = useState<MailFolder>(searchParams.get("folder") === "sent" ? "sent" : "inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(linkedId);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email-accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { accounts?: MailAccount[] }) => {
        if (!cancelled) setAccounts(data.accounts ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load email accounts");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!linkedId) return;
    const controller = new AbortController();
    fetch(`/api/emails?messageId=${encodeURIComponent(linkedId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ message: MailRow }>) : null))
      .then((result) => {
        if (result) setLinkedMessage(result.message);
      })
      .catch(() => {
        if (!controller.signal.aborted) toast.error("Could not open the linked email");
      });
    return () => controller.abort();
  }, [linkedId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({
            page: String(page),
            limit: "30",
            refresh: String(revision),
          });
          if (folder === "drafts") params.set("status", "DRAFT");
          else params.set("direction", folder === "inbox" ? "INBOUND" : "OUTBOUND");
          if (accountId) params.set("accountId", accountId);
          if (search.trim()) params.set("search", search.trim());
          const response = await fetch(`/api/emails?${params}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Could not load messages");
          const data: { messages: MailRow[]; totalPages: number } = await response.json();
          setMessages(data.messages);
          setTotalPages(data.totalPages);
        } catch (error) {
          if (!controller.signal.aborted)
            toast.error(error instanceof Error ? error.message : "Could not load messages");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [accountId, folder, search, page, revision]);

  const selected =
    messages.find((message) => message.id === selectedId) ?? (linkedMessage?.id === selectedId ? linkedMessage : null);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Mail</h1>
        <p className="text-muted-foreground text-sm">Inbox and sent messages from your connected accounts.</p>
      </div>
      <div className="grid min-h-[65vh] overflow-hidden rounded-xl border bg-card md:grid-cols-[12rem_minmax(16rem,1fr)] xl:grid-cols-[12rem_minmax(16rem,1fr)_minmax(20rem,1.4fr)]">
        <MailSidebar
          accounts={accounts}
          accountId={accountId}
          folder={folder}
          onAccount={(id) => {
            setAccountId(id);
            setPage(1);
            setSelectedId(null);
          }}
          onFolder={(value) => {
            setFolder(value);
            setPage(1);
            setSelectedId(null);
          }}
          onCompose={() => setComposeOpen(true)}
        />
        <div className="min-w-0">
          <MailList
            messages={messages}
            selectedId={selectedId}
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            onSelect={setSelectedId}
            loading={loading}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-2 text-xs">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
        <div className="min-w-0 border-t md:col-span-2 xl:col-span-1 xl:border-t-0">
          <MailView message={selected} />
        </div>
      </div>
      <ComposeEmail
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        defaultAccountId={accountId}
        onSent={() => {
          setFolder("sent");
          setRevision((value) => value + 1);
        }}
      />
    </div>
  );
}
