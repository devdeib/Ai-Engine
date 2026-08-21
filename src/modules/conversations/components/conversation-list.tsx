"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationWithLead } from "@/lib/db/types";
import { ConversationListItem } from "@/modules/conversations/components/conversation-list-item";

export function ConversationListSkeleton() {
  return (
    <ul className="divide-y" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-4 py-3 space-y-2 animate-pulse">
          <div className="flex justify-between gap-2">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-12 rounded-full bg-muted" />
          </div>
          <div className="h-3 w-24 rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

interface ConversationListErrorProps {
  onRetry: () => void;
}

export function ConversationListError({ onRetry }: ConversationListErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-muted">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="font-medium">Failed to load conversations</p>
      <p className="mt-1 text-sm text-muted-foreground">
        An error occurred while loading your inbox.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

interface ConversationListEmptyProps {
  onStart: () => void;
}

export function ConversationListEmpty({ onStart }: ConversationListEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
        <MessageSquare className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No conversations yet</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Conversations appear here when you start a thread with a lead.
      </p>
      <Button className="mt-6" onClick={onStart}>
        <Plus className="h-4 w-4" />
        Start Conversation
      </Button>
    </div>
  );
}

export interface ConversationListProps {
  conversations: ConversationWithLead[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  limit: number;
  count: number;
  onSelect: (conversationId: string) => void;
  onRetry: () => void;
  onStart: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function ConversationList({
  conversations,
  selectedId,
  isLoading,
  error,
  page,
  limit,
  count,
  onSelect,
  onRetry,
  onStart,
  onPrevPage,
  onNextPage,
}: ConversationListProps) {
  const hasPrevPage = page > 1;
  const hasNextPage = count >= limit;
  const showPagination = !isLoading && !error && (conversations.length > 0 || page > 1);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : error ? (
          <ConversationListError onRetry={onRetry} />
        ) : conversations.length === 0 ? (
          <ConversationListEmpty onStart={onStart} />
        ) : (
          <nav aria-label="Conversations">
            <ul>
              {conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </nav>
        )}
      </div>

      {showPagination && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <p className="text-xs text-muted-foreground">Page {page}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevPage}
              disabled={!hasPrevPage}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNextPage}
              disabled={!hasNextPage}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
