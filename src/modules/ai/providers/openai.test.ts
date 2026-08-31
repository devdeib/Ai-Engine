import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAiProvider } from "@/modules/ai/providers/openai";
import { AiMalformedResponseError, AiProviderError } from "@/modules/ai/errors";
import { AiSalesAnalysisError } from "@/modules/ai/analysis/errors";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";
import type { AiContext } from "@/modules/ai/types";
import { EMPTY_AI_SALES_PROFILE } from "@/modules/ai/types";

const context: AiContext = {
  organization: { name: "Acme", salesProfile: EMPTY_AI_SALES_PROFILE },
  lead: {
    firstName: "Ahmed",
    lastName: "Ali",
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

const request = {
  systemPrompt: "Be helpful.",
  promptVersion: "SALES_AGENT_PROMPT_V1",
  context,
};

describe("OpenAiProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the assistant text on success", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  Thanks for reaching out.  " } }],
      }),
    } as Response);

    const result = await new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(
      request
    );
    expect(result).toEqual({ type: "text", text: "Thanks for reaching out." });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.stringify(init.headers)).toContain("Bearer sk-test");
  });

  it("maps HTTP failures to AiProviderError without leaking the body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "secret stack" } }),
    } as Response);

    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request)
    ).rejects.toThrow(AiProviderError);
  });

  it("maps network/timeout failures to AiProviderError", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("AbortError"));
    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request)
    ).rejects.toThrow(AiProviderError);
  });

  it("maps a malformed payload to AiMalformedResponseError", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);

    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request)
    ).rejects.toThrow(AiMalformedResponseError);
  });

  it("maps empty model text to AiMalformedResponseError", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " } }] }),
    } as Response);

    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request)
    ).rejects.toThrow(AiMalformedResponseError);
  });

  it("maps oversized model text to AiMalformedResponseError", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "x".repeat(MESSAGE_BODY_MAX + 1) } }],
      }),
    } as Response);

    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request)
    ).rejects.toThrow(AiMalformedResponseError);
  });

  it("sends provider-independent tools in OpenAI format without identity fields", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello." } }],
      }),
    } as Response);

    await new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse({
      ...request,
      tools: [
        {
          name: "get_lead_context",
          description: "Read the current lead",
          inputJsonSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
      history: [
        {
          role: "assistant",
          turn: {
            type: "tool_call",
            id: "call-1",
            name: "get_lead_context",
            arguments: {},
          },
        },
        {
          role: "tool",
          id: "call-1",
          name: "get_lead_context",
          result: { ok: true, name: "get_lead_context", data: { firstName: "Ahmed" } },
        },
      ],
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      tools: unknown;
      messages: Array<{ role: string }>;
    };
    expect(JSON.stringify(body.tools)).toContain("get_lead_context");
    expect(JSON.stringify(body.tools)).not.toContain("organizationId");
    expect(JSON.stringify(body.tools)).not.toContain("userId");
    expect(body.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("maps native OpenAI tool_calls into the provider-independent turn", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-9",
                  type: "function",
                  function: {
                    name: "get_lead_appointments",
                    arguments: "{}",
                  },
                },
              ],
            },
          },
        ],
      }),
    } as Response);

    const result = await new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(
      request
    );
    expect(result).toEqual({
      type: "tool_call",
      id: "call-9",
      name: "get_lead_appointments",
      arguments: {},
    });
  });

  it("does not send structured analysis format on generateResponse", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hi" } }],
      }),
    } as Response);
    await new OpenAiProvider("sk-test", "gpt-4o-mini").generateResponse(request);
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.body).not.toContain("json_schema");
    expect(init.body).not.toContain("promptVersion");
  });

  it("parses analysis JSON without throwing AiProviderError on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    await expect(
      new OpenAiProvider("sk-test", "gpt-4o-mini").generateSalesAnalysis({
        systemPrompt: "classify",
        promptVersion: "AI_SALES_ANALYSIS_PROMPT_V1",
        schemaVersion: "AI_SALES_ANALYSIS_V1",
        context,
        draftReply: "Thanks.",
      })
    ).rejects.toBeInstanceOf(AiSalesAnalysisError);
  });

  it("returns parsed analysis JSON from message content", async () => {
    const analysis = {
      inboundIntent: "pricing",
      objection: "none",
      urgency: "low",
      qualification: "unknown",
      inferredStage: "exploring",
      buyingSignals: [],
      missingInformation: [],
      nextBestAction: "wait_for_customer",
      rationale: "Price question.",
      confidence: 0.4,
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(analysis) } }],
      }),
    } as Response);
    const result = await new OpenAiProvider(
      "sk-test",
      "gpt-4o-mini"
    ).generateSalesAnalysis({
      systemPrompt: "classify",
      promptVersion: "AI_SALES_ANALYSIS_PROMPT_V1",
      schemaVersion: "AI_SALES_ANALYSIS_V1",
      context,
      draftReply: "Thanks.",
    });
    expect(result).toEqual(analysis);
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toContain("json_schema");
    expect(init.body).not.toContain("tools");
  });
});
