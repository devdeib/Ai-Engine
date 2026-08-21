/**
 * Tests for PATCH /api/v1/organizations/:organizationId/follow-ups/:followUpId
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { LeadFollowUp, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/follow-ups/actions", () => ({
  createLeadFollowUp: vi.fn(),
  updateLeadFollowUp: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { updateLeadFollowUp } from "@/modules/follow-ups/actions";
import { PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const FU_1 = "ffffffff-0000-4000-8000-000000000001";
const INVALID_ID = "not-a-uuid";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/follow-ups/${FU_1}`;

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
const mockOrgContext = { user: mockUser, member: mockMember, organizationId: ORG_A };

function makeFollowUp(overrides: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id: FU_1,
    organization_id: ORG_A,
    lead_id: "11111111-1111-4111-8111-111111111111",
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: null,
    due_at: "2026-08-22T10:00:00Z",
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function makePatchRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId = ORG_A, followUpId = FU_1) {
  return { params: Promise.resolve({ organizationId, followUpId }) };
}

describe("PATCH /follow-ups/:followUpId — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /follow-ups/:followUpId — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for a malformed follow-up UUID", async () => {
    const res = await PATCH(
      makePatchRequest(
        `/api/v1/organizations/${ORG_A}/follow-ups/${INVALID_ID}`,
        { status: "completed" }
      ),
      makeContext(ORG_A, INVALID_ID)
    );
    expect(res.status).toBe(422);
    expect(updateLeadFollowUp).not.toHaveBeenCalled();
  });

  it("returns 422 for an empty body", async () => {
    const res = await PATCH(makePatchRequest(BASE_PATH, {}), makeContext());
    expect(res.status).toBe(422);
  });

  it("returns 422 for an invalid status", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "pending" }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for an invalid timestamp", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { due_at: "not-a-date" }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for a blank title", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { title: "  " }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });
});

describe("PATCH /follow-ups/:followUpId — success and isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 when completing a follow-up", async () => {
    vi.mocked(updateLeadFollowUp).mockResolvedValue(
      makeFollowUp({ status: "completed" })
    );
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    const body = (await res.json()) as { data: LeadFollowUp };
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("completed");
  });

  it("returns 200 when cancelling a follow-up", async () => {
    vi.mocked(updateLeadFollowUp).mockResolvedValue(
      makeFollowUp({ status: "cancelled" })
    );
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "cancelled" }),
      makeContext()
    );
    const body = (await res.json()) as { data: LeadFollowUp };
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("cancelled");
  });

  it("passes verified organizationId and userId", async () => {
    vi.mocked(updateLeadFollowUp).mockResolvedValue(makeFollowUp());
    await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    expect(updateLeadFollowUp).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      FU_1,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("strips forged organization_id from the body", async () => {
    vi.mocked(updateLeadFollowUp).mockResolvedValue(makeFollowUp());
    await PATCH(
      makePatchRequest(BASE_PATH, {
        status: "completed",
        organization_id: ORG_B,
      }),
      makeContext()
    );
    const input = vi.mocked(updateLeadFollowUp).mock.calls[0]?.[3] as Record<
      string,
      unknown
    >;
    expect(input).not.toHaveProperty("organization_id");
  });

  it("returns 404 for a cross-tenant follow-up", async () => {
    vi.mocked(updateLeadFollowUp).mockRejectedValue(
      new NotFoundError("Follow-up")
    );
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for an invalid lifecycle transition", async () => {
    vi.mocked(updateLeadFollowUp).mockRejectedValue(
      new ValidationError("Invalid follow-up data", {
        status: ["Only pending follow-ups can be updated"],
      })
    );
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed" }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });
});
