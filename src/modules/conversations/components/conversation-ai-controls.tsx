"use client";

import { Bot, Pause, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationWithLead } from "@/lib/db/types";

export interface ConversationAiControlsProps {
  conversation: ConversationWithLead;
  isBusy: boolean;
  onPause: () => void;
  onResume: () => void;
  onEscalate: () => void;
  onGenerate: () => void;
}

export function conversationAiState(
  conversation: Pick<ConversationWithLead, "status" | "requires_human" | "ai_paused_at">
): "closed" | "requires_human" | "paused" | "active" {
  if (conversation.status === "closed") return "closed";
  if (conversation.requires_human) return "requires_human";
  if (conversation.ai_paused_at) return "paused";
  return "active";
}

const STATE_LABELS = {
  closed: "AI unavailable",
  requires_human: "Human required",
  paused: "AI paused",
  active: "AI active",
} as const;

export function ConversationAiControls({
  conversation,
  isBusy,
  onPause,
  onResume,
  onEscalate,
  onGenerate,
}: ConversationAiControlsProps) {
  const state = conversationAiState(conversation);
  const canControl = conversation.status === "open";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
          state === "active" && "bg-zeus-blue/12 text-zeus-blue",
          state === "paused" && "bg-zeus-black/[0.06] text-zeus-black/75",
          state === "requires_human" && "bg-destructive/10 text-red-700",
          state === "closed" && "bg-zeus-black/[0.04] text-muted-foreground"
        )}
      >
        <Bot className="h-3 w-3" aria-hidden="true" />
        {STATE_LABELS[state]}
      </span>

      <div className="ml-auto flex flex-wrap gap-1.5">
        {state === "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canControl || isBusy}
            onClick={onPause}
            aria-label="Pause AI"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause AI
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canControl || isBusy || state === "closed"}
            onClick={onResume}
            aria-label="Resume AI"
          >
            <Play className="h-3.5 w-3.5" />
            Resume AI
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canControl || isBusy || state === "requires_human"}
          onClick={onEscalate}
          aria-label="Escalate to human"
        >
          <UserRound className="h-3.5 w-3.5" />
          Escalate
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canControl || isBusy || state !== "active"}
          onClick={onGenerate}
          aria-label="Generate AI reply"
        >
          <Bot className="h-3.5 w-3.5" />
          Generate reply
        </Button>
      </div>
    </div>
  );
}
