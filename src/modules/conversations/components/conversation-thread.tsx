"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ConversationWithLead,
  MessageWithDeliveryStatus,
} from "@/lib/db/types";
import { ConversationHeader } from "@/modules/conversations/components/conversation-header";
import { ConversationAiControls } from "@/modules/conversations/components/conversation-ai-controls";
import { ConversationMessage } from "@/modules/conversations/components/conversation-message";
import { MessageComposer } from "@/modules/conversations/components/message-composer";
import { PendingAiActionsPanel } from "@/modules/ai/components/pending-ai-actions-panel";
import { AiOperatorInsightPanel } from "@/modules/ai/components/ai-operator-insight-panel";
import { isExternalChannel } from "@/modules/channels/constants";
import {
  isChannelStubLead,
  type ChannelStubLeadFields,
} from "@/modules/channels/match";
import type { ConversationHeaderIdentity } from "@/modules/conversations/components/conversation-header";
import {
  CONVERSATION_CHANNEL_LABELS,
  CONVERSATION_STATUS_LABELS,
} from "@/modules/conversations/lib/conversation-labels";

const MESSAGE_PAGE_SIZE = 20;

export function ConversationThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden="true">
      <div className="border-b px-4 py-3 space-y-2 animate-pulse">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
      <div className="flex-1 space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
          >
            <div className="h-12 w-48 rounded-lg bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ConversationThreadProps {
  organizationId: string;
  conversation: ConversationWithLead;
  onBack: () => void;
  onConversationUpdated: (conversation: ConversationWithLead) => void;
  onListRefresh: () => void;
}

export function ConversationThread({
  organizationId,
  conversation,
  onBack,
  onConversationUpdated,
  onListRefresh,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<MessageWithDeliveryStatus[]>([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"not-found" | "error" | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingAi, setIsUpdatingAi] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [hitlRefreshKey, setHitlRefreshKey] = useState(0);
  const [identity, setIdentity] = useState<ConversationHeaderIdentity>({
    status: "hidden",
    externalAddress: null,
    linkState: null,
  });
  const listRef = useRef<HTMLUListElement>(null);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(MESSAGE_PAGE_SIZE),
      });
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversation.id}/messages?${params}`,
        { credentials: "same-origin" }
      );
      if (res.status === 404) {
        setFetchError("not-found");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      const json = (await res.json()) as {
        data: MessageWithDeliveryStatus[];
        meta: { page: number; limit: number; count: number };
      };
      setMessages(json.data);
      setCount(json.meta.count);
    } catch {
      setFetchError("error");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, conversation.id, page]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!isExternalChannel(conversation.channel)) {
      setIdentity({ status: "hidden", externalAddress: null, linkState: null });
      return;
    }

    const identityId = conversation.channel_identity_id;
    if (!identityId) {
      setIdentity({
        status: "unavailable",
        externalAddress: null,
        linkState: null,
      });
      return;
    }

    let cancelled = false;
    setIdentity({
      status: "loading",
      externalAddress: null,
      linkState: null,
    });

    async function loadIdentityContext() {
      try {
        const identityUrl = `/api/v1/organizations/${organizationId}/channel-identities/${identityId}`;
        const leadUrl = conversation.lead_id
          ? `/api/v1/organizations/${organizationId}/leads/${conversation.lead_id}`
          : null;

        const [identityRes, leadRes] = await Promise.all([
          fetch(identityUrl, { credentials: "same-origin" }),
          leadUrl
            ? fetch(leadUrl, { credentials: "same-origin" })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        if (!identityRes.ok) {
          setIdentity({
            status: "unavailable",
            externalAddress: null,
            linkState: null,
          });
          return;
        }

        const identityJson = (await identityRes.json()) as {
          data?: { externalAddress?: unknown };
        };
        const externalAddress =
          typeof identityJson.data?.externalAddress === "string" &&
          identityJson.data.externalAddress.length > 0
            ? identityJson.data.externalAddress
            : null;

        let linkState: ConversationHeaderIdentity["linkState"] = null;
        if (leadRes?.ok) {
          const leadJson = (await leadRes.json()) as { data?: ChannelStubLeadFields };
          const lead = leadJson.data;
          if (
            lead &&
            typeof lead.first_name === "string" &&
            typeof lead.last_name === "string"
          ) {
            linkState = isChannelStubLead({
              first_name: lead.first_name,
              last_name: lead.last_name,
              email: lead.email ?? null,
              phone: lead.phone ?? null,
            })
              ? "unmatched"
              : "linked";
          }
        }

        setIdentity({
          status: "ready",
          externalAddress,
          linkState,
        });
      } catch {
        if (!cancelled) {
          setIdentity({
            status: "unavailable",
            externalAddress: null,
            linkState: null,
          });
        }
      }
    }

    void loadIdentityContext();
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    conversation.id,
    conversation.channel,
    conversation.channel_identity_id,
    conversation.lead_id,
  ]);

  useEffect(() => {
    setPage(1);
  }, [conversation.id]);

  useEffect(() => {
    if (!isLoading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isLoading, messages]);

  async function handleToggleStatus() {
    if (isUpdatingStatus) return;
    const nextStatus = conversation.status === "open" ? "closed" : "open";
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversation.id}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to update conversation");
      }
      const json = (await res.json()) as { data: ConversationWithLead };
      onConversationUpdated(json.data);
      onListRefresh();
    } catch {
      setStatusError("Unable to update conversation status. Please try again.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function postAiAction(path: "pause" | "resume" | "escalate" | "process") {
    if (isUpdatingAi) return;
    setIsUpdatingAi(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversation.id}/ai/${path}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        throw new Error("AI action failed");
      }
      if (path === "process") {
        void fetchMessages();
        onListRefresh();
        return;
      }
      const json = (await res.json()) as { data: ConversationWithLead };
      onConversationUpdated(json.data);
      onListRefresh();
    } catch {
      setStatusError("Unable to update AI controls. Please try again.");
    } finally {
      setIsUpdatingAi(false);
    }
  }

  const hasPrevPage = page > 1;
  const hasNextPage = count >= MESSAGE_PAGE_SIZE;
  const composerDisabled = conversation.status === "closed";

  if (fetchError === "not-found") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-muted">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Conversation not found</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          This conversation may have been removed or you do not have access to it.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
          Back to inbox
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ConversationHeader
        conversation={conversation}
        isUpdating={isUpdatingStatus}
        onBack={onBack}
        onToggleStatus={() => void handleToggleStatus()}
        identity={identity}
      />

      <ConversationAiControls
        conversation={conversation}
        isBusy={isUpdatingAi || isUpdatingStatus}
        onPause={() => void postAiAction("pause")}
        onResume={() => void postAiAction("resume")}
        onEscalate={() => void postAiAction("escalate")}
        onGenerate={() => void postAiAction("process")}
      />

      <AiOperatorInsightPanel
        organizationId={organizationId}
        conversationId={conversation.id}
        compact
        onAppointmentRequested={() => setHitlRefreshKey((key) => key + 1)}
        onHandoffConfirmed={(updated) => {
          onConversationUpdated(updated);
          onListRefresh();
        }}
      />

      <PendingAiActionsPanel
        organizationId={organizationId}
        conversationId={conversation.id}
        compact
        refreshKey={hitlRefreshKey}
      />

      {statusError ? (
        <p className="px-4 py-2 text-sm text-destructive" role="alert">
          {statusError}
        </p>
      ) : null}

      {isLoading ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              aria-hidden="true"
            >
              <div className="h-12 w-48 rounded-lg bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : fetchError === "error" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-muted">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <p className="font-medium">Failed to load messages</p>
          <p className="mt-1 text-sm text-muted-foreground">
            An error occurred while loading this thread.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void fetchMessages()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : (
        <>
          {(hasPrevPage || hasNextPage) && (
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Page {page} · oldest first
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!hasPrevPage}
                  aria-label="Older messages"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Older
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNextPage}
                  aria-label="Newer messages"
                >
                  Newer
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
              <p className="font-medium">No messages yet</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                {composerDisabled
                  ? "Reopen this conversation to send a message."
                  : "Send the first message to start this thread."}
              </p>
            </div>
          ) : (
            <ul
              ref={listRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4"
              aria-label="Messages"
            >
              {messages.map((message) => (
                <ConversationMessage key={message.id} message={message} />
              ))}
            </ul>
          )}
        </>
      )}

      <MessageComposer
        organizationId={organizationId}
        conversationId={conversation.id}
        disabled={composerDisabled}
        disabledReason="Reopen the conversation to send a message"
        onSent={() => {
          void fetchMessages();
          onListRefresh();
        }}
      />
    </div>
    <aside className="hidden xl:flex w-64 shrink-0 flex-col border-l border-border px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground">Customer</p>
      {conversation.lead?.company_name ? (
        <p className="mt-2 text-sm text-foreground">
          {conversation.lead.company_name}
        </p>
      ) : null}
      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Channel</dt>
          <dd className="mt-0.5">{CONVERSATION_CHANNEL_LABELS[conversation.channel]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-0.5">{CONVERSATION_STATUS_LABELS[conversation.status]}</dd>
        </div>
      </dl>
      {conversation.lead ? (
        <Button variant="outline" size="sm" className="mt-6 w-full" asChild>
          <Link href={`/dashboard/leads/${conversation.lead.id}`}>View lead</Link>
        </Button>
      ) : null}
    </aside>
    </div>
  );
}
