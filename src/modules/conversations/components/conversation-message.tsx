"use client";

import { cn, formatDateTime } from "@/lib/utils";
import type { MessageWithDeliveryStatus } from "@/lib/db/types";
import { conversationMessageAttribution } from "@/modules/conversations/lib/conversation-labels";

export interface ConversationMessageProps {
  message: MessageWithDeliveryStatus;
}

export function ConversationMessage({ message }: ConversationMessageProps) {
  const isOutbound = message.direction === "outbound";

  return (
    <li
      className={cn("flex flex-col gap-1", isOutbound ? "items-end" : "items-start")}
    >
      <span className="text-[11px] font-medium text-muted-foreground">
        {conversationMessageAttribution(message)}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
          isOutbound
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {message.body}
      </div>
      <time
        className="text-[11px] text-muted-foreground tabular-nums"
        dateTime={message.created_at}
      >
        {formatDateTime(message.created_at)}
      </time>
    </li>
  );
}
