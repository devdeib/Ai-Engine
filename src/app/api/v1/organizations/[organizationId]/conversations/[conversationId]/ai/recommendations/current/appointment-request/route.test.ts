/**
 * POST /conversations/:conversationId/ai/recommendations/current/appointment-request
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember } from "@/lib/db/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/recommendation/appointment-request", () => ({
  requestAppointmentHitlFromRecommendation: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { requestAppointmentHitlFromRecommendation } from "@/modules/ai/recommendation/appointment-request";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const STARTS_AT = "2026-08-22T10:00:00.000Z";

const mockUser = { id: USER_1, email: "user@example.com" } as unknown as User;
const mockMember: OrganizationMember = {
  id: "ffffffff-0000-0000-0000-000000000001",
  organization_id: ORG_A,
  user_id: USER_1,
  role: "owner",
  invited_by: null,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};

const publicAction: AiToolActionPublic = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  toolName: "create_appointment",
  trust: "human_approval",
  status: "pending",
  conversationId: CONV_1,
  createdAt: "2026-08-22T09:00:00Z",
  expiresAt: "2026-08-23T09:00:00Z",
  lead: { firstName: "Ahmed", lastName: "Ali", companyName: null },
  summary: { startsAt: STARTS_AT, endsAt: null, status: "pending_approval" },
};

function makePost(body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/recommendations/current/appointment-request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const routeContext = {
  params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
};

describe("POST appointment-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(requestAppointmentHitlFromRecommendation).mockResolvedValue(
      publicAction
    );
  });

  it("returns 201 with the public HITL action", async () => {
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(publicAction);
    expect(body.data).not.toHaveProperty("payload");
    expect(requestAppointmentHitlFromRecommendation).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      payload: expect.objectContaining({ startsAt: expect.any(String) }),
    });
    expect(JSON.stringify(body)).not.toContain(ORG_A);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(401);
    expect(requestAppointmentHitlFromRecommendation).not.toHaveBeenCalled();
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the current recommendation is missing", async () => {
    vi.mocked(requestAppointmentHitlFromRecommendation).mockRejectedValue(
      new NotFoundError("Recommendation")
    );
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the conversation is missing", async () => {
    vi.mocked(requestAppointmentHitlFromRecommendation).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the live recommendation is no longer valid", async () => {
    vi.mocked(requestAppointmentHitlFromRecommendation).mockRejectedValue(
      new ConflictError("This recommendation cannot create an appointment request")
    );
    const res = await POST(makePost({ startsAt: STARTS_AT }), routeContext);
    expect(res.status).toBe(409);
  });

  it("returns 422 when startsAt is missing", async () => {
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(422);
    expect(requestAppointmentHitlFromRecommendation).not.toHaveBeenCalled();
  });

  it("returns 422 when startsAt is invalid", async () => {
    const res = await POST(makePost({ startsAt: "nope" }), routeContext);
    expect(res.status).toBe(422);
  });

  it("returns 422 when endsAt is not after startsAt", async () => {
    const res = await POST(
      makePost({ startsAt: STARTS_AT, endsAt: STARTS_AT }),
      routeContext
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when an extra field is present", async () => {
    const res = await POST(
      makePost({ startsAt: STARTS_AT, organizationId: ORG_A }),
      routeContext
    );
    expect(res.status).toBe(422);
    expect(requestAppointmentHitlFromRecommendation).not.toHaveBeenCalled();
  });
});
