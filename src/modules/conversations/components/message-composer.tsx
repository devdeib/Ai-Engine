"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";

export interface MessageComposerProps {
  organizationId: string;
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string;
  onSent: () => void;
}

export function MessageComposer({
  organizationId,
  conversationId,
  disabled = false,
  disabledReason,
  onSent,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const overLimit = trimmed.length > MESSAGE_BODY_MAX;
  const canSend =
    !disabled && !isSubmitting && trimmed.length > 0 && !overLimit;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) {
      if (!trimmed) {
        setError("Message body is required");
      } else if (overLimit) {
        setError(`Message must be ${MESSAGE_BODY_MAX} characters or fewer`);
      }
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction: "outbound", body: trimmed }),
        }
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(json?.error?.message ?? "Failed to send message");
      }

      setBody("");
      onSent();
    } catch {
      setError("Unable to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSubmit(event as unknown as React.FormEvent);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-3 space-y-2">
      <Label htmlFor="conversation-message" className="sr-only">
        Write a message
      </Label>
      <textarea
        id="conversation-message"
        name="body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled ? (disabledReason ?? "Conversation is closed") : "Write a message…"
        }
        disabled={disabled || isSubmitting}
        maxLength={MESSAGE_BODY_MAX + 1}
        rows={3}
        aria-invalid={Boolean(error) || overLimit}
        aria-describedby={error ? "message-composer-error" : "message-composer-hint"}
        className={cn(
          "flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2",
          "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <p
          id="message-composer-hint"
          className={cn(
            "text-xs tabular-nums",
            overLimit ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {trimmed.length}/{MESSAGE_BODY_MAX}
        </p>
        <Button type="submit" disabled={!canSend} aria-label="Send message">
          {isSubmitting ? "Sending…" : "Send"}
        </Button>
      </div>
      {error ? (
        <p id="message-composer-error" className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
