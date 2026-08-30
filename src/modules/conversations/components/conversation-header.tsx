"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationWithLead } from "@/lib/db/types";
import {
  CONVERSATION_CHANNEL_LABELS,
  CONVERSATION_STATUS_CLASSES,
  CONVERSATION_STATUS_LABELS,
  leadDisplayName,
} from "@/modules/conversations/lib/conversation-labels";

export type InboxIdentityStatus = "hidden" | "loading" | "ready" | "unavailable";
export type InboxIdentityLinkState = "linked" | "unmatched";

export interface ConversationHeaderIdentity {
  status: InboxIdentityStatus;
  externalAddress: string | null;
  linkState: InboxIdentityLinkState | null;
}

export interface ConversationHeaderProps {
  conversation: ConversationWithLead;
  isUpdating: boolean;
  onBack: () => void;
  onToggleStatus: () => void;
  identity?: ConversationHeaderIdentity;
}

export function ConversationHeader({
  conversation,
  isUpdating,
  onBack,
  onToggleStatus,
  identity = { status: "hidden", externalAddress: null, linkState: null },
}: ConversationHeaderProps) {
  const name = leadDisplayName(conversation.lead);
  const isOpen = conversation.status === "open";
  const channelLabel = CONVERSATION_CHANNEL_LABELS[conversation.channel];
  const showAddress =
    identity.status === "ready" && Boolean(identity.externalAddress);

  return (
    <header className="flex items-start gap-2 border-b px-3 py-3 sm:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0"
        onClick={onBack}
        aria-label="Back to conversations"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold truncate">{name}</h2>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              CONVERSATION_STATUS_CLASSES[conversation.status]
            )}
          >
            {CONVERSATION_STATUS_LABELS[conversation.status]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {channelLabel}
          {showAddress ? (
            <>
              <span aria-hidden="true"> · </span>
              <span data-testid="inbox-identity-address">
                {identity.externalAddress}
              </span>
            </>
          ) : null}
          {conversation.lead ? (
            <>
              <span aria-hidden="true"> · </span>
              <Link
                href={`/dashboard/leads/${conversation.lead.id}`}
                className="hover:underline focus-visible:underline focus-visible:outline-none"
              >
                View lead
              </Link>
            </>
          ) : null}
        </p>
        {identity.status === "loading" ||
        identity.status === "unavailable" ||
        (identity.status === "ready" && identity.linkState) ? (
          <p
            className="mt-0.5 text-xs text-muted-foreground"
            data-testid="inbox-identity-state"
            aria-live="polite"
          >
            {identity.status === "loading"
              ? "Loading identity…"
              : identity.status === "unavailable"
                ? "Identity unavailable"
                : identity.linkState === "unmatched"
                  ? "Identity: Unmatched"
                  : "Identity: Linked"}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onToggleStatus}
        disabled={isUpdating}
        aria-label={isOpen ? "Close conversation" : "Reopen conversation"}
      >
        {isUpdating ? "Saving…" : isOpen ? "Close conversation" : "Reopen conversation"}
      </Button>
    </header>
  );
}
