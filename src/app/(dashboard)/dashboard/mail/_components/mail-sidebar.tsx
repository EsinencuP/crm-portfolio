"use client";

import Link from "next/link";

import { FilePenLine, Inbox, Send, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export type MailAccount = { id: string; email: string; provider: string };
export type MailFolder = "inbox" | "sent" | "drafts";

export function MailSidebar({
  accounts,
  accountId,
  folder,
  onAccount,
  onFolder,
  onCompose,
}: {
  accounts: MailAccount[];
  accountId: string;
  folder: MailFolder;
  onAccount: (id: string) => void;
  onFolder: (folder: MailFolder) => void;
  onCompose: () => void;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-5 border-r p-4">
      <Button onClick={onCompose} disabled={accounts.length === 0}>
        Compose
      </Button>
      <nav aria-label="Mail folders" className="space-y-1">
        <Button
          variant={folder === "inbox" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => onFolder("inbox")}
        >
          <Inbox /> Inbox
        </Button>
        <Button
          variant={folder === "sent" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => onFolder("sent")}
        >
          <Send /> Sent
        </Button>
        <Button
          variant={folder === "drafts" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => onFolder("drafts")}
        >
          <FilePenLine /> Drafts
        </Button>
      </nav>
      <div className="space-y-1">
        <p className="px-2 text-muted-foreground text-xs uppercase tracking-wide">Accounts</p>
        <Button
          variant={accountId === "" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => onAccount("")}
        >
          All accounts
        </Button>
        {accounts.map((account) => (
          <Button
            key={account.id}
            variant={accountId === account.id ? "secondary" : "ghost"}
            className="w-full justify-start truncate"
            title={account.email}
            onClick={() => onAccount(account.id)}
          >
            {account.email}
          </Button>
        ))}
      </div>
      <Link
        href="/dashboard/settings/email"
        className="mt-auto inline-flex items-center gap-2 px-2 text-muted-foreground text-sm hover:text-foreground"
      >
        <Settings2 className="size-4" /> Email settings
      </Link>
    </aside>
  );
}
