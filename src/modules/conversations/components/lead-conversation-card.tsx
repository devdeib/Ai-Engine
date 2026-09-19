"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConversationWithLead } from "@/lib/db/types";
import { CreateConversationForm } from "@/modules/conversations/components/create-conversation-form";

export interface LeadConversationCardProps {
  organizationId: string;
  leadId: string;
}

export function LeadConversationCard({
  organizationId,
  leadId,
}: LeadConversationCardProps) {
  const router = useRouter();
  const [openConversation, setOpenConversation] =
    useState<ConversationWithLead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenConversation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lead_id: leadId,
        status: "open",
        limit: "1",
      });
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations?${params}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Failed to load conversation");
      const json = (await res.json()) as { data: ConversationWithLead[] };
      setOpenConversation(json.data[0] ?? null);
    } catch {
      setError("Unable to load conversation status.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, leadId]);

  useEffect(() => {
    void fetchOpenConversation();
  }, [fetchOpenConversation]);

  function handleCreated(conversation: ConversationWithLead) {
    setShowForm(false);
    router.push(`/dashboard/conversations?conversation=${conversation.id}`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Conversation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : openConversation ? (
          <Button
            onClick={() =>
              router.push(
                `/dashboard/conversations?conversation=${openConversation.id}`
              )
            }
          >
            <MessageSquare className="h-4 w-4" />
            Open Conversation
          </Button>
        ) : (
          <Button onClick={() => setShowForm(true)}>
            <MessageSquare className="h-4 w-4" />
            Start Conversation
          </Button>
        )}

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
                leadId={leadId}
                onSuccess={handleCreated}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
