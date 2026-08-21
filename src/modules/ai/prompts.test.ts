import { describe, it, expect } from "vitest";
import {
  SALES_AGENT_PROMPT_V1,
  buildSalesAgentUserMessage,
  getSalesAgentPrompt,
} from "@/modules/ai/prompts";
import { SALES_AGENT_PROMPT_VERSION, type AiContext } from "@/modules/ai/types";

const context: AiContext = {
  organization: { name: "Acme Realty" },
  lead: {
    firstName: "Ahmed",
    lastName: "Ali",
    companyName: null,
    email: "ahmed@example.com",
    phone: null,
    status: "new",
    score: 40,
    notes: "Interested in downtown.",
  },
  conversation: {
    channel: "in_app",
    status: "open",
    requiresHuman: false,
    aiPausedAt: null,
  },
  messages: [
    {
      direction: "inbound",
      authorType: "human",
      body: "What is the price?",
      createdAt: "2026-08-21T10:00:00Z",
    },
  ],
  followUps: [],
  appointments: [],
  recentActivities: [],
};

describe("sales agent prompt", () => {
  it("is versioned as SALES_AGENT_PROMPT_V1", () => {
    expect(getSalesAgentPrompt().version).toBe(SALES_AGENT_PROMPT_VERSION);
    expect(getSalesAgentPrompt().systemPrompt).toBe(SALES_AGENT_PROMPT_V1);
  });

  it("forbids inventing facts and exposing internals", () => {
    expect(SALES_AGENT_PROMPT_V1).toMatch(/Never invent/i);
    expect(SALES_AGENT_PROMPT_V1).toMatch(/Do not pretend to be a human/i);
    expect(SALES_AGENT_PROMPT_V1).toMatch(/untrusted/i);
  });

  it("does not interpolate lead text into the system prompt", () => {
    expect(SALES_AGENT_PROMPT_V1).not.toContain("What is the price?");
    expect(SALES_AGENT_PROMPT_V1).not.toContain("Ahmed");
  });

  it("places CRM context in the user message, not the system prompt", () => {
    const user = buildSalesAgentUserMessage(context);
    expect(user).toContain("What is the price?");
    expect(user).toContain("Ahmed");
    expect(user).not.toContain("OPENAI");
    expect(user).not.toContain("apiKey");
  });
});
