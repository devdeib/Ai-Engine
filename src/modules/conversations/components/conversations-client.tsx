"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationWithLead } from "@/lib/db/types";
import { ConversationList } from "@/modules/conversations/components/conversation-list";
import {
  ConversationThread,
  ConversationThreadSkeleton,
} from "@/modules/conversations/components/conversation-thread";
import { CreateConversationForm } from "@/modules/conversations/components/create-conversation-form";
import { cn } from "@/lib/utils";

interface ConversationsMeta {
  page: number;
  limit: number;
  count: number;
}

export interface ConversationsClientProps {
  organizationId: string;
}

export function ConversationsClient({ organizationId }: ConversationsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const selectedId = searchParams.get("conversation");
  const currentPage = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [conversations, setConversations] = useState<ConversationWithLead[]>([]);
  const [meta, setMeta] = useState<ConversationsMeta>({
    page: 1,
    limit: 20,
    count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<ConversationWithLead | null>(null);
  const [detailError, setDetailError] = useState<"not-found" | "error" | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "20",
      });
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations?${params}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        throw new Error("Failed to load conversations");
      }
      const json = (await res.json()) as {
        data: ConversationWithLead[];
        meta: ConversationsMeta;
      };
      setConversations(json.data);
      setMeta(json.meta);
    } catch {
      setFetchError("Unable to load conversations. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, currentPage, refreshKey]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  const selectedFromList = conversations.find((c) => c.id === selectedId) ?? null;
  const selected = selectedFromList ?? detail;

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    if (selectedFromList) {
      setDetail(selectedFromList);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    async function loadDetail() {
      setIsLoadingDetail(true);
      setDetailError(null);
      try {
        const res = await fetch(
          `/api/v1/organizations/${organizationId}/conversations/${selectedId}`,
          { credentials: "same-origin" }
        );
        if (cancelled) return;
        if (res.status === 404) {
          setDetail(null);
          setDetailError("not-found");
          return;
        }
        if (!res.ok) throw new Error("Failed to load conversation");
        const json = (await res.json()) as { data: ConversationWithLead };
        setDetail(json.data);
      } catch {
        if (!cancelled) setDetailError("error");
      } finally {
        if (!cancelled) setIsLoadingDetail(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedId, selectedFromList]);

  const replaceParams = useCallback(
    (updates: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      }
      const qs = current.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname, router]
  );

  const handleSelect = useCallback(
    (conversationId: string) => {
      replaceParams({ conversation: conversationId });
    },
    [replaceParams]
  );

  const handleBack = useCallback(() => {
    replaceParams({ conversation: null });
  }, [replaceParams]);

  const handleCreated = useCallback(
    (conversation: ConversationWithLead) => {
      setShowForm(false);
      setRefreshKey((k) => k + 1);
      replaceParams({ conversation: conversation.id, page: "1" });
    },
    [replaceParams]
  );

  const handleConversationUpdated = useCallback(
    (updated: ConversationWithLead) => {
      setDetail(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    },
    []
  );

  const threadOpen = Boolean(selectedId);

  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem)] min-h-[480px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Conversations</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            In-app threads with your leads.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={showForm} size="sm">
          <Plus className="h-4 w-4" />
          Start Conversation
        </Button>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Start conversation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-background shadow-xl">
            <CreateConversationForm
              organizationId={organizationId}
              onSuccess={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "w-full md:w-80 lg:w-96 shrink-0 border-r bg-background",
            threadOpen ? "hidden md:flex md:flex-col" : "flex flex-col"
          )}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            isLoading={isLoading}
            error={fetchError}
            page={currentPage}
            limit={meta.limit}
            count={meta.count}
            onSelect={handleSelect}
            onRetry={() => void fetchConversations()}
            onStart={() => setShowForm(true)}
            onPrevPage={() =>
              replaceParams({ page: String(currentPage - 1) })
            }
            onNextPage={() =>
              replaceParams({ page: String(currentPage + 1) })
            }
          />
        </aside>

        <section
          className={cn(
            "min-w-0 flex-1 bg-background",
            threadOpen ? "flex flex-col" : "hidden md:flex md:flex-col"
          )}
        >
          {selectedId && detailError === "not-found" ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <p className="font-medium">Conversation not found</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                This conversation may have been removed or you do not have access
                to it.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleBack}>
                Back to inbox
              </Button>
            </div>
          ) : selected ? (
            <ConversationThread
              key={selected.id}
              organizationId={organizationId}
              conversation={selected}
              onBack={handleBack}
              onConversationUpdated={handleConversationUpdated}
              onListRefresh={() => setRefreshKey((k) => k + 1)}
            />
          ) : isLoadingDetail ? (
            <ConversationThreadSkeleton />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">Select a conversation</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Choose a thread from the inbox or start a new conversation with a
                lead.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
