"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Conversation } from "@/lib/messaging/types";

import { ChatThread } from "./chat-thread";
import { ConversationList } from "./conversation-list";

export type InboxMember = { id: string; name: string; role: string };
async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not load inbox.");
  return result;
}
export function InboxClient({
  initialConversationId,
  workspaceId,
  userId,
  canManageChannels,
}: {
  initialConversationId: string | null;
  workspaceId: string;
  userId: string;
  canManageChannels: boolean;
}) {
  const [selected, setSelected] = useState(initialConversationId);
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [assigned, setAssigned] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), search });
  if (platform !== "all") query.set("platform", platform);
  if (status !== "all") query.set("status", status);
  if (assigned !== "all") query.set("assignedToId", assigned === "me" ? userId : assigned);
  const conversations = useQuery({
    queryKey: ["inbox", workspaceId, platform, status, assigned, search, page],
    queryFn: ({ signal }) =>
      readJson<{ conversations: Conversation[]; totalPages: number }>(`/api/messaging/conversations?${query}`, signal),
    refetchInterval: 5_000,
  });
  const details = useQuery({
    queryKey: ["inbox-conversation", workspaceId, selected],
    enabled: Boolean(selected),
    queryFn: ({ signal }) =>
      readJson<Conversation>(`/api/messaging/conversations/${encodeURIComponent(selected ?? "")}`, signal),
    refetchInterval: 5_000,
    retry: false,
  });
  const team = useQuery({
    queryKey: ["inbox-team", workspaceId],
    queryFn: ({ signal }) => readJson<{ members: InboxMember[] }>("/api/team-members", signal),
    staleTime: 60_000,
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Inbox</h1>
          <p className="text-muted-foreground text-sm">WhatsApp and Telegram conversations in one place.</p>
        </div>
        {canManageChannels && (
          <Link href="/dashboard/settings/messaging" className="text-primary text-sm underline underline-offset-4">
            Manage channels
          </Link>
        )}
      </header>
      <div className="grid h-[calc(100svh-12rem)] min-h-96 overflow-hidden rounded-xl border bg-card md:grid-cols-[20rem_minmax(0,1fr)]">
        <section
          aria-label="Conversations"
          className={`${selected ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col border-r`}
        >
          <div className="space-y-2 border-b p-3">
            <Input
              aria-label="Search conversations"
              placeholder="Search name or chat ID…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={platform}
                onValueChange={(value) => {
                  setPlatform(value ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="TELEGRAM">Telegram</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Conversation status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((item) => (
                    <SelectItem key={item} value={item}>
                      {item.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select
              value={assigned}
              onValueChange={(value) => {
                setAssigned(value ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Assigned to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.data?.members
                  .filter((member) => member.id !== userId)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {conversations.isLoading && (
            <p role="status" className="p-4 text-muted-foreground text-sm">
              Loading conversations…
            </p>
          )}
          {conversations.isError && (
            <div role="alert" className="space-y-2 p-4 text-destructive text-sm">
              <p>{conversations.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void conversations.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {conversations.data && (
            <ConversationList
              conversations={conversations.data.conversations}
              selectedId={selected}
              onSelect={setSelected}
            />
          )}
          {conversations.data && conversations.data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-2">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-xs">
                {page} / {conversations.data.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= conversations.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
        <section
          aria-label="Chat thread"
          className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`}
        >
          {!selected && (
            <p className="m-auto p-8 text-center text-muted-foreground text-sm">
              Choose a conversation to read and reply.
            </p>
          )}
          {selected && details.isLoading && (
            <p role="status" className="p-4 text-muted-foreground text-sm">
              Loading thread…
            </p>
          )}
          {details.isError && (
            <div role="alert" className="space-y-3 p-4 text-destructive text-sm">
              <p>{details.error.message}</p>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Back to conversations
              </Button>
            </div>
          )}
          {details.data && !details.isError && (
            <ChatThread
              key={`${workspaceId}:${details.data.id}`}
              conversation={details.data}
              members={team.data?.members ?? []}
              onBack={() => setSelected(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
