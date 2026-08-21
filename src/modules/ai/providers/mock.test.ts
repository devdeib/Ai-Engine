import { describe, it, expect } from "vitest";
import { MockAiProvider } from "@/modules/ai/providers/mock";
import type { AiContext } from "@/modules/ai/types";

const context: AiContext = {
  organization: { name: "Acme" },
  lead: {
    firstName: "Lina",
    lastName: "Hassan",
    companyName: null,
    email: null,
    phone: null,
    status: "new",
    score: null,
    notes: null,
  },
  conversation: {
    channel: "in_app",
    status: "open",
    requiresHuman: false,
    aiPausedAt: null,
  },
  messages: [],
  followUps: [],
  appointments: [],
  recentActivities: [],
};

describe("MockAiProvider", () => {
  it("returns a canned reply when provided", async () => {
    const provider = new MockAiProvider("Hello from mock.");
    const result = await provider.generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    expect(result.text).toBe("Hello from mock.");
  });

  it("uses the lead first name when no canned text is set", async () => {
    const result = await new MockAiProvider().generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    expect(result.text).toContain("Lina");
  });
});
