"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
import type { ConversationWithLead } from "@/lib/db/types";
import {
  CONVERSATION_CHANNEL_LABELS,
  CONVERSATION_STATUS_CLASSES,
  CONVERSATION_STATUS_LABELS,
  leadDisplayName,
} from "@/modules/conversations/lib/conversation-labels";

export interface ConversationListItemProps {
  conversation: ConversationWithLead;
  selected: boolean;
  onSelect: (conversationId: string) => void;
}

export function ConversationListItem({
  conversation,
  selected,
  onSelect,
}: ConversationListItemProps) {
  const name = leadDisplayName(conversation.lead);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-zeus-blue/8" : "hover:bg-zeus-blue/10"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm truncate">{name}</p>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
              CONVERSATION_STATUS_CLASSES[conversation.status]
            )}
          >
            {CONVERSATION_STATUS_LABELS[conversation.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          <time dateTime={conversation.updated_at}>
            {formatRelativeTime(conversation.updated_at)}
          </time>
          <span aria-hidden="true"> · </span>
          {CONVERSATION_CHANNEL_LABELS[conversation.channel]}
        </p>
        {conversation.lead?.company_name ? (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {conversation.lead.company_name}
          </p>
        ) : null}
      </button>
    </li>
  );
}
