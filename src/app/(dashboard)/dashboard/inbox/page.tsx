import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { InboxClient } from "./_components/inbox-client";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversationId?: string }> }) {
  const member = await requireActiveWorkspaceMember();
  const query = await searchParams;
  return (
    <InboxClient
      key={member.workspaceId}
      initialConversationId={typeof query.conversationId === "string" ? query.conversationId : null}
      canManageChannels={["OWNER", "ADMIN"].includes(member.role)}
      workspaceId={member.workspaceId}
      userId={member.userId}
    />
  );
}
