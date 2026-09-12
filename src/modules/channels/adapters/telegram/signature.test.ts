import { describe, it, expect } from "vitest";
import { telegramSecretTokensMatch } from "@/modules/channels/adapters/telegram/signature";

describe("Telegram webhook secret token", () => {
  it("accepts an exact matching secret token", () => {
    const secret = "s".repeat(64);
    expect(telegramSecretTokensMatch(secret, secret)).toBe(true);
  });

  it("rejects a different secret without throwing", () => {
    expect(telegramSecretTokensMatch("s".repeat(64), "t".repeat(64))).toBe(false);
  });

  it("rejects a bot token used in place of the webhook secret", () => {
    const webhookSecret = "s".repeat(64);
    const botToken = "123456:AA" + "t".repeat(30);
    expect(telegramSecretTokensMatch(webhookSecret, botToken)).toBe(false);
  });
});
