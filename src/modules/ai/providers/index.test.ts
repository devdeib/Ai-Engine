import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function expectProviderConfigError(fn: () => unknown) {
  try {
    fn();
    throw new Error("expected AI provider configuration error");
  } catch (error) {
    expect(error).toMatchObject({
      name: "AiProviderError",
      code: "AI_PROVIDER_ERROR",
      message: "AI provider is not configured.",
    });
  }
}

describe("createAiProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.VERCEL_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("throws when AI_PROVIDER=openai and the key is missing", async () => {
    process.env.AI_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expectProviderConfigError(() => createAiProvider());
  });

  it("fails closed in production when OpenAI is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expectProviderConfigError(() => createAiProvider());
  });

  it("keeps explicit mock available even in production-like runtimes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";
    process.env.AI_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expect(createAiProvider().name).toBe("mock");
  });

  it("fails closed on Vercel preview when OpenAI is not configured", async () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    const { createAiProvider } = await import("@/modules/ai/providers/index");
    expectProviderConfigError(() => createAiProvider());
  });
});
