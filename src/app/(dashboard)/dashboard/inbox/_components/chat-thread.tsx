"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Conversation, conversationName, type InboxMessage } from "@/lib/messaging/types";

import type { InboxMember } from "./inbox-client";
import { PlatformIcon } from "./platform-icon";

type MessagePage = { messages: InboxMessage[]; nextCursor: string | null };
export function ChatThread({
  conversation,
  members,
  onBack,
}: {
  conversation: Conversation;
  members: InboxMember[];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [attach, setAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState("text");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const requestId = useRef<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["inbox-messages", conversation.id],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<MessagePage> => {
      const url = `/api/messaging/conversations/${encodeURIComponent(conversation.id)}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`;
      const response = await fetch(url, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load messages.");
      return result;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 5_000,
    maxPages: 5,
  });
  const uniqueMessages = new Map(
    query.data?.pages.flatMap((page) => page.messages).map((message) => [message.id, message]),
  );
  const messages = Array.from(uniqueMessages.values()).sort(
    (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt) || left.id.localeCompare(right.id),
  );
  const unreadIds = messages
    .filter((message) => message.direction === "INBOUND" && !message.readAt)
    .slice(-100)
    .map((message) => message.id)
    .join(",");
  useEffect(() => {
    if (!unreadIds) return;
    const controller = new AbortController();
    void fetch(`/api/messaging/conversations/${encodeURIComponent(conversation.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readIds: unreadIds.split(",") }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) {
          await queryClient.invalidateQueries({ queryKey: ["inbox"] });
          await queryClient.invalidateQueries({ queryKey: ["inbox-messages", conversation.id] });
        }
      })
      .catch(() => {
        /* Polling reconciles unread state after a transient failure. */
      });
    return () => controller.abort();
  }, [unreadIds, conversation.id, queryClient]);

  async function patch(data: Record<string, string | null>) {
    setSaving(true);
    try {
      const response = await fetch(`/api/messaging/conversations/${encodeURIComponent(conversation.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update conversation.");
      await queryClient.invalidateQueries({ queryKey: ["inbox-conversation"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update conversation.");
    } finally {
      setSaving(false);
    }
  }
  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const payload =
        mode === "template"
          ? {
              template: {
                name: templateName,
                language,
                params: content
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              },
            }
          : { content, ...(mediaUrl && { mediaUrl }) };
      const response = await fetch(`/api/messaging/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send message.");
      if (result.message?.status === "FAILED" || result.message?.status === "PENDING")
        throw new Error("This attempt is not confirmed. Check the provider before editing and sending a new attempt.");
      setContent("");
      setMediaUrl("");
      requestId.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send message.");
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["inbox-messages", conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    }
  }
  const writable = conversation.canWrite && conversation.channel.isActive;
  return (
    <>
      <header className="space-y-3 border-b p-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to conversations"
            className="md:hidden"
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <PlatformIcon platform={conversation.channel.platform} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium">{conversationName(conversation)}</h2>
            <p className="text-muted-foreground text-xs">
              {conversation.channel.channelName} · {conversation.externalId}
            </p>
          </div>
          {conversation.contact && (
            <Link
              className="text-primary text-xs underline"
              href={`/dashboard/contacts/${encodeURIComponent(conversation.contact.id)}`}
            >
              Contact
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={conversation.assignedToId ?? "unassigned"}
            disabled={!conversation.canWrite || saving}
            onValueChange={(value) => {
              if (value) void patch({ assignedToId: value === "unassigned" ? null : value });
            }}
          >
            <SelectTrigger aria-label="Assign conversation" className="max-w-56">
              <SelectValue placeholder="Assign to team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members
                .filter((member) => member.role !== "VIEWER")
                .map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={conversation.status}
            disabled={!conversation.canWrite || saving}
            onValueChange={(value) => {
              if (value) void patch({ status: value });
            }}
          >
            <SelectTrigger aria-label="Conversation status" className="max-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((status) => (
                <SelectItem key={status} value={status}>
                  {status.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 p-4">
              {query.hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load older messages
                </Button>
              )}
              {query.isLoading && (
                <p role="status" className="text-muted-foreground text-sm">
                  Loading messages…
                </p>
              )}
              {query.isError && (
                <div role="alert" className="text-destructive text-sm">
                  {query.error.message}
                  <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              {!query.isLoading && !messages.length && (
                <p className="text-muted-foreground text-sm">No messages yet.</p>
              )}
              {messages.map((message) => {
                const outbound = message.direction === "OUTBOUND";
                return (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={outbound}>
                    <Message align={outbound ? "end" : "start"}>
                      <MessageContent>
                        <Bubble align={outbound ? "end" : "start"} variant={outbound ? "default" : "muted"}>
                          <BubbleContent>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            {(message.mediaId || message.mediaUrl) && (
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 block underline"
                                href={
                                  message.mediaId
                                    ? `/api/messaging/messages/${encodeURIComponent(message.id)}/media`
                                    : (message.mediaUrl ?? undefined)
                                }
                              >
                                Open {message.mediaType ?? "attachment"}
                              </a>
                            )}
                          </BubbleContent>
                        </Bubble>
                        <MessageFooter className="gap-2">
                          <time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString()}</time>
                          {outbound && <span>{message.status.toLowerCase()}</span>}
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {!writable && (
          <p className="text-muted-foreground text-sm">
            {conversation.channel.isActive ? "Read-only conversation." : "This channel is paused."}
          </p>
        )}
        {conversation.channel.platform === "WHATSAPP" && (
          <Select
            value={mode}
            disabled={!writable || sending}
            onValueChange={(value) => {
              setMode(value ?? "text");
              requestId.current = null;
              setMediaUrl("");
            }}
          >
            <SelectTrigger aria-label="Reply type" className="max-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Reply within 24 hours</SelectItem>
              <SelectItem value="template">Approved template</SelectItem>
            </SelectContent>
          </Select>
        )}
        {mode === "template" && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Approved template name"
              placeholder="Template name"
              value={templateName}
              disabled={!writable || sending}
              onChange={(event) => {
                setTemplateName(event.target.value);
                requestId.current = null;
              }}
            />
            <Input
              aria-label="Template language"
              placeholder="en_US"
              value={language}
              disabled={!writable || sending}
              onChange={(event) => {
                setLanguage(event.target.value);
                requestId.current = null;
              }}
            />
          </div>
        )}
        {attach && mode === "text" && (
          <Input
            type="url"
            aria-label="Public HTTPS image URL"
            placeholder="https://… (public image URL)"
            value={mediaUrl}
            disabled={!writable || sending}
            onChange={(event) => {
              setMediaUrl(event.target.value);
              requestId.current = null;
            }}
          />
        )}
        <Textarea
          aria-label={mode === "template" ? "Template parameters, one per line" : "Message"}
          placeholder={mode === "template" ? "Template parameters, one per line" : "Write a message…"}
          value={content}
          maxLength={4096}
          rows={2}
          disabled={!writable || sending}
          onChange={(event) => {
            setContent(event.target.value);
            requestId.current = null;
          }}
        />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!writable || sending || mode === "template"}
            aria-pressed={attach}
            onClick={() => {
              setAttach(!attach);
              if (attach) {
                setMediaUrl("");
                requestId.current = null;
              }
            }}
          >
            <Paperclip /> Image URL
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!writable || sending || (mode === "text" ? !content.trim() && !mediaUrl : !templateName.trim())}
          >
            <Send /> {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </>
  );
}
