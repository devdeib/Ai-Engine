/**
 * Internal AI job drain. Authenticated with CRON_SECRET only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/ai/jobs/worker", () => ({
  processDueAiJobs: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
}));

import { processDueAiJobs } from "@/modules/ai/jobs/worker";
import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";
import { GET, POST } from "./route";

const PATH = "/api/v1/internal/ai-jobs/drain";

function makeRequest(auth?: string, method = "POST") {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new NextRequest(`http://localhost:3000${PATH}`, { method, headers });
}

describe("/api/v1/internal/ai-jobs/drain", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.mocked(processDueAiJobs).mockResolvedValue(1);
    vi.mocked(processDueChannelDeliveryJobs).mockResolvedValue(0);
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
    expect(processDueAiJobs).not.toHaveBeenCalled();
    expect(processDueChannelDeliveryJobs).not.toHaveBeenCalled();
  });

  it("returns 401 for the wrong secret", async () => {
    const res = await POST(makeRequest("Bearer other-secret"));
    expect(res.status).toBe(401);
    expect(processDueAiJobs).not.toHaveBeenCalled();
    expect(processDueChannelDeliveryJobs).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest("Bearer test-cron-secret"));
    expect(res.status).toBe(401);
    expect(processDueAiJobs).not.toHaveBeenCalled();
    expect(processDueChannelDeliveryJobs).not.toHaveBeenCalled();
  });

  it("drains jobs with the admin worker on POST", async () => {
    const res = await POST(makeRequest("Bearer test-cron-secret"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { claimed: 1 } });
    expect(processDueAiJobs).toHaveBeenCalledWith({ useAdminClient: true });
    expect(processDueChannelDeliveryJobs).toHaveBeenCalledWith({
      useAdminClient: true,
    });
  });

  it("accepts GET for Vercel Cron", async () => {
    const res = await GET(makeRequest("Bearer test-cron-secret", "GET"));
    expect(res.status).toBe(200);
    expect(processDueAiJobs).toHaveBeenCalledWith({ useAdminClient: true });
    expect(processDueChannelDeliveryJobs).toHaveBeenCalledWith({
      useAdminClient: true,
    });
  });

  it("does not accept organization or job identity from the request", async () => {
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-cron-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: "bbbbbbbb-0000-0000-0000-000000000002",
        conversationId: "forged",
      }),
    });
    await POST(req);
    expect(processDueAiJobs).toHaveBeenCalledWith({ useAdminClient: true });
    expect(processDueAiJobs).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: expect.anything() })
    );
  });
});
