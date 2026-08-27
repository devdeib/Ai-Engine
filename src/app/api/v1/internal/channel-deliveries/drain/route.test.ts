/**
 * Internal channel delivery drain. Authenticated with CRON_SECRET only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
}));
vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";
import { processConversationMessage } from "@/modules/ai/service";
import { GET, POST } from "./route";

const PATH = "/api/v1/internal/channel-deliveries/drain";

function makeRequest(auth?: string, method = "POST") {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new NextRequest(`http://localhost:3000${PATH}`, { method, headers });
}

describe("/api/v1/internal/channel-deliveries/drain", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.mocked(processDueChannelDeliveryJobs).mockResolvedValue(1);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("returns 401 without a bearer secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(processDueChannelDeliveryJobs).not.toHaveBeenCalled();
  });

  it("drains delivery jobs without invoking AI execution", async () => {
    const res = await POST(makeRequest("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    expect(processDueChannelDeliveryJobs).toHaveBeenCalledWith({
      useAdminClient: true,
    });
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("accepts GET for Vercel Cron", async () => {
    const res = await GET(makeRequest("Bearer test-cron-secret", "GET"));
    expect(res.status).toBe(200);
  });
});
