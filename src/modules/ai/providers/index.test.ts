import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("createAiProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to the mock provider when no key is configured", async () => {
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expect(createAiProvider().name).toBe("mock");
  });

  it("uses OpenAI when AI_PROVIDER=openai and a key is present", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expect(createAiProvider().name).toBe("openai");
  });

  it("uses the mock provider when AI_PROVIDER=mock even if a key exists", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.OPENAI_API_KEY = "sk-test";
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expect(createAiProvider().name).toBe("mock");
  });
});
