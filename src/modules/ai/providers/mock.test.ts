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
  pipeline: {
    leadStatus: "new",
    conversationStatus: "open",
    requiresHuman: false,
    aiPaused: false,
    latestMessageDirection: "inbound",
    lastInboundAt: null,
    lastOutboundAt: null,
    hasScheduledAppointment: false,
    hasPendingFollowUp: false,
    hasPendingAppointmentApproval: false,
    contactEmailPresent: false,
    contactPhonePresent: false,
  },
};

describe("MockAiProvider", () => {
  it("returns a canned reply when provided", async () => {
    const provider = new MockAiProvider("Hello from mock.");
    const result = await provider.generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    expect(result).toEqual({ type: "text", text: "Hello from mock." });
  });

  it("uses the lead first name when no canned text is set", async () => {
    const result = await new MockAiProvider().generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    expect(result).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("Lina") })
    );
  });

  it("plays a scripted tool-call turn then canned text", async () => {
    const provider = new MockAiProvider("Final reply.", [
      {
        type: "tool_call",
        id: "call-1",
        name: "get_lead_context",
        arguments: {},
      },
    ]);
    const first = await provider.generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    const second = await provider.generateResponse({
      systemPrompt: "sys",
      promptVersion: "SALES_AGENT_PROMPT_V1",
      context,
    });
    expect(first).toEqual({
      type: "tool_call",
      id: "call-1",
      name: "get_lead_context",
      arguments: {},
    });
    expect(second).toEqual({ type: "text", text: "Final reply." });
  });

  it("returns canned sales analysis", async () => {
    const result = await new MockAiProvider().generateSalesAnalysis({
      systemPrompt: "classify",
      promptVersion: "AI_SALES_ANALYSIS_PROMPT_V1",
      schemaVersion: "AI_SALES_ANALYSIS_V1",
      context,
      draftReply: "Thanks.",
    });
    expect(result).toMatchObject({ inboundIntent: "general_question", confidence: 0.5 });
  });

  it("allows tests to inject malformed analysis", async () => {
    const provider = new MockAiProvider("Hi", [], { bad: true });
    await expect(
      provider.generateSalesAnalysis({
        systemPrompt: "classify",
        promptVersion: "AI_SALES_ANALYSIS_PROMPT_V1",
        schemaVersion: "AI_SALES_ANALYSIS_V1",
        context,
        draftReply: "Thanks.",
      })
    ).resolves.toEqual({ bad: true });
  });
});
