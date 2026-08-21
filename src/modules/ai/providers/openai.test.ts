import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAiProvider } from "@/modules/ai/providers/openai";
import { AiMalformedResponseError, AiProviderError } from "@/modules/ai/errors";
import type { AiContext } from "@/modules/ai/types";

const context: AiContext = {
  organization: { name: "Acme" },
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
    expect(result.text).toBe("Thanks for reaching out.");
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
});
