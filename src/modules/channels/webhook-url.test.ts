import { describe, it, expect } from "vitest";
import {
  buildChannelWebhookUrl,
  channelAccountWebhookPath,
} from "@/modules/channels/webhook-url";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPECTED =
  "https://app.example.com/api/v1/channels/accounts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/webhook";

describe("buildChannelWebhookUrl", () => {
  it("joins origin and account id without a double slash", () => {
    expect(buildChannelWebhookUrl("https://app.example.com", ACCOUNT_ID)).toBe(
      EXPECTED
    );
  });

  it("strips a trailing slash on the origin", () => {
    expect(buildChannelWebhookUrl("https://app.example.com/", ACCOUNT_ID)).toBe(
      EXPECTED
    );
  });

  it("does not include secrets, organization ids, or destinations", () => {
    const url = buildChannelWebhookUrl("https://app.example.com", ACCOUNT_ID);
    expect(url).not.toContain("secret");
    expect(url).not.toContain("token");
    expect(url).not.toContain("whsec_");
    expect(url).not.toMatch(/organizations\//);
  });
});

describe("channelAccountWebhookPath", () => {
  it("returns the public relative webhook path", () => {
    expect(channelAccountWebhookPath(ACCOUNT_ID)).toBe(
      `/api/v1/channels/accounts/${ACCOUNT_ID}/webhook`
    );
  });
});
