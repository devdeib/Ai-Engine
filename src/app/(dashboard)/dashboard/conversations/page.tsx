import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  return (
    <ComingSoon
      title="Conversations"
      description="View and manage all conversations with leads. Full message history, AI-assisted responses, and human handoff."
      icon={MessageSquare}
      phase="Phase 3"
    />
  );
}
