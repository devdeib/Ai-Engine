import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConversationAiControls,
  conversationAiState,
} from "./conversation-ai-controls";
import type { ConversationWithLead } from "@/lib/db/types";

const conversation: ConversationWithLead = {
  id: "cccccccc-0000-4000-8000-000000000001",
  organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
  lead_id: "11111111-1111-4111-8111-111111111111",
  channel: "in_app",
  status: "open",
  requires_human: false,
  ai_paused_at: null,
  created_at: "2026-08-20T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
  lead: {
    id: "11111111-1111-4111-8111-111111111111",
    first_name: "Ahmed",
    last_name: "Ali",
    company_name: null,
  },
};

describe("conversationAiState", () => {
  it("classifies active, paused, human-required, and closed", () => {
    expect(conversationAiState(conversation)).toBe("active");
    expect(
      conversationAiState({ ...conversation, ai_paused_at: "2026-08-21T00:00:00Z" })
    ).toBe("paused");
    expect(
      conversationAiState({ ...conversation, requires_human: true })
    ).toBe("requires_human");
    expect(conversationAiState({ ...conversation, status: "closed" })).toBe(
      "closed"
    );
  });
});

describe("ConversationAiControls", () => {
  it("shows AI active and enables generate/pause", () => {
    render(
      <ConversationAiControls
        conversation={conversation}
        isBusy={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEscalate={vi.fn()}
        onGenerate={vi.fn()}
      />
    );
    expect(screen.getByText("AI active")).toBeInTheDocument();
    expect(screen.getByLabelText("Pause AI")).toBeEnabled();
    expect(screen.getByLabelText("Generate AI reply")).toBeEnabled();
  });

  it("disables generate when paused and offers resume", () => {
    render(
      <ConversationAiControls
        conversation={{ ...conversation, ai_paused_at: "2026-08-21T00:00:00Z" }}
        isBusy={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEscalate={vi.fn()}
        onGenerate={vi.fn()}
      />
    );
    expect(screen.getByText("AI paused")).toBeInTheDocument();
    expect(screen.getByLabelText("Generate AI reply")).toBeDisabled();
    expect(screen.getByLabelText("Resume AI")).toBeEnabled();
  });

  it("shows human required and disables escalate/generate", () => {
    render(
      <ConversationAiControls
        conversation={{ ...conversation, requires_human: true }}
        isBusy={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEscalate={vi.fn()}
        onGenerate={vi.fn()}
      />
    );
    expect(screen.getByText("Human required")).toBeInTheDocument();
    expect(screen.getByLabelText("Escalate to human")).toBeDisabled();
    expect(screen.getByLabelText("Generate AI reply")).toBeDisabled();
  });

  it("invokes pause when clicked", async () => {
    const onPause = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationAiControls
        conversation={conversation}
        isBusy={false}
        onPause={onPause}
        onResume={vi.fn()}
        onEscalate={vi.fn()}
        onGenerate={vi.fn()}
      />
    );
    await user.click(screen.getByLabelText("Pause AI"));
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
