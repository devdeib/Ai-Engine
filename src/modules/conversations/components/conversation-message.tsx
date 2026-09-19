"use client";

import { Zap } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { MessageWithDeliveryStatus } from "@/lib/db/types";
import { conversationMessageAttribution } from "@/modules/conversations/lib/conversation-labels";

export interface ConversationMessageProps {
  message: MessageWithDeliveryStatus;
}

export function ConversationMessage({ message }: ConversationMessageProps) {
  const isOutbound = message.direction === "outbound";
  const isAi = message.author_type === "ai";

  return (
    <li
      className={cn("flex flex-col gap-1", isOutbound ? "items-end" : "items-start")}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {isAi ? (
          <Zap className="h-3 w-3 text-zeus-blue" strokeWidth={2} aria-hidden="true" />
        ) : null}
        {conversationMessageAttribution(message)}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
          isOutbound && isAi && "border border-zeus-blue/25 bg-card text-foreground",
          isOutbound && !isAi && "bg-primary text-primary-foreground",
          !isOutbound && "border border-border bg-zeus-black/[0.03] text-foreground"
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
