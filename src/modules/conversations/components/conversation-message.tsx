"use client";

import { cn, formatDateTime } from "@/lib/utils";
import type { Message } from "@/lib/db/types";

export interface ConversationMessageProps {
  message: Message;
}

export function ConversationMessage({ message }: ConversationMessageProps) {
  const isOutbound = message.direction === "outbound";

  return (
    <li
      className={cn("flex flex-col gap-1", isOutbound ? "items-end" : "items-start")}
    >
      <span className="text-[11px] font-medium text-muted-foreground">
        {message.author_type === "ai"
          ? "AI"
          : isOutbound
            ? "Sent"
            : "Received"}
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
