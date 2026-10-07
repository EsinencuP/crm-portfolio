"use client";

import { Badge } from "@/components/ui/badge";
import { type Conversation, conversationName } from "@/lib/messaging/types";

import { PlatformIcon } from "./platform-icon";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {!conversations.length && (
        <p className="p-6 text-center text-muted-foreground text-sm">
          No conversations match. Connect a channel and receive a message to start.
        </p>
      )}
      <ul className="space-y-1">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              aria-pressed={selectedId === conversation.id}
              className={`flex w-full gap-3 rounded-lg p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${selectedId === conversation.id ? "bg-muted" : "hover:bg-muted/60"}`}
              onClick={() => onSelect(conversation.id)}
            >
              <PlatformIcon platform={conversation.channel.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-sm">{conversationName(conversation)}</span>
                  {conversation.lastMessageAt && (
                    <time dateTime={conversation.lastMessageAt} className="shrink-0 text-muted-foreground text-xs">
                      {new Date(conversation.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  )}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {conversation.channel.channelName} · {conversation.status.toLowerCase()}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-muted-foreground text-sm">
                    {conversation.lastMessage?.content ?? conversation.lastMessage?.mediaType ?? "No messages"}
                  </p>
                  {conversation.unreadCount > 0 && (
                    <Badge aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount}</Badge>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
