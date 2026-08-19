import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "AI Agent" };

export default function AIAgentPage() {
  return (
    <ComingSoon
      title="AI Sales Agent"
      description="An AI agent that qualifies leads, answers property questions, and schedules viewings — with human handoff for sensitive decisions."
      icon={Bot}
      phase="Phase 4"
    />
  );
}
