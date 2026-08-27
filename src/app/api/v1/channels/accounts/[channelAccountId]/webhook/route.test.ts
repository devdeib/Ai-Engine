/**
 * Signed test webhook route. No session cookie.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError } from "@/lib/errors";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/channels/ingest", () => ({
  ingestChannelWebhook: vi.fn(),
  ingestTestWebhook: vi.fn(),
}));
vi.mock("@/modules/channels/adapters/whatsapp/challenge", () => ({
  handleWhatsAppWebhookChallenge: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { ingestChannelWebhook } from "@/modules/channels/ingest";
import { handleWhatsAppWebhookChallenge } from "@/modules/channels/adapters/whatsapp/challenge";
import { GET, POST } from "./route";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATH = `/api/v1/channels/accounts/${ACCOUNT_ID}/webhook`;

describe("POST /channels/accounts/:id/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ingestChannelWebhook).mockResolvedValue({ accepted: true });
  });

  it("does not require a session cookie", async () => {
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: {
        "x-vg-timestamp": "1710000000",
        "x-vg-signature": "sig",
      },
      body: '{"providerMessageId":"m1","from":"a","to":"b","body":"hi"}',
    });
    const res = await POST(req, {
      params: Promise.resolve({ channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(200);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(ingestChannelWebhook).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      rawBody: '{"providerMessageId":"m1","from":"a","to":"b","body":"hi"}',
      headers: expect.any(Headers),
    });
  });

  it("returns 401 without leaking account existence", async () => {
    vi.mocked(ingestChannelWebhook).mockRejectedValue(new AuthenticationError());
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, {
      params: Promise.resolve({ channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /channels/accounts/:id/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(handleWhatsAppWebhookChallenge).mockResolvedValue("1158201444");
  });

  it("returns the WhatsApp challenge as plain text without persisting or running AI", async () => {
    const req = new NextRequest(
      `http://localhost:3000${PATH}?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=1158201444`
    );
    const res = await GET(req, {
      params: Promise.resolve({ channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("1158201444");
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(ingestChannelWebhook).not.toHaveBeenCalled();
  });

  it("returns generic 401 when challenge verification fails", async () => {
    vi.mocked(handleWhatsAppWebhookChallenge).mockRejectedValue(
      new AuthenticationError()
    );
    const req = new NextRequest(`http://localhost:3000${PATH}`);
    const res = await GET(req, {
      params: Promise.resolve({ channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(JSON.stringify(body)).not.toContain("verify");
  });
});
