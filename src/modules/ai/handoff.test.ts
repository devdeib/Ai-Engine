/**
 * Handoff mutation tests. NO LIVE DATABASE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { pauseAI, resumeAI, escalateToHuman } from "@/modules/ai/handoff";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

function makeConversation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: null,
    channel_account_id: null,
    channel_identity_id: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function mockHandoffClient({
  current,
  updated,
  capturedUpdate,
}: {
  current: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
  capturedUpdate: { value: Record<string, unknown> | null };
}) {
  const selectSingle = vi.fn().mockResolvedValue({
    data: current,
    error: current ? null : { message: "No rows" },
  });
  const selectEqOrg = vi.fn().mockReturnValue({ single: selectSingle });
  const selectEqId = vi.fn().mockReturnValue({ eq: selectEqOrg });
  const select = vi.fn().mockReturnValue({ eq: selectEqId });

  const updateSingle = vi.fn().mockResolvedValue({
    data: updated,
    error: updated ? null : { message: "Update failed" },
  });
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelect });
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
  const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedUpdate.value = payload;
    return { eq: updateEqId };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({ select, update }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("AI handoff mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("pauseAI requires membership before touching the database", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(pauseAI(ORG_A, USER_1, CONV_1)).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("pauseAI returns 404 semantics for a cross-tenant conversation", async () => {
    mockHandoffClient({
      current: null,
      updated: null,
      capturedUpdate: { value: null },
    });
    await expect(pauseAI(ORG_A, USER_1, CONV_1)).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("pauseAI sets ai_paused_at and does not change requires_human", async () => {
    const capturedUpdate: { value: Record<string, unknown> | null } = {
      value: null,
    };
    const paused = makeConversation({
      ai_paused_at: "2026-08-21T12:00:00Z",
    });
    mockHandoffClient({
      current: makeConversation(),
      updated: paused,
      capturedUpdate,
    });

    const result = await pauseAI(ORG_A, USER_1, CONV_1);
    expect(result.ai_paused_at).toBeTruthy();
    expect(capturedUpdate.value).toEqual({
      ai_paused_at: expect.any(String),
    });
    expect(capturedUpdate.value).not.toHaveProperty("requires_human");
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "conversation",
      content: "AI paused",
    });
  });

  it("escalateToHuman sets requires_human and pauses AI", async () => {
    const capturedUpdate: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockHandoffClient({
      current: makeConversation(),
      updated: makeConversation({
        requires_human: true,
        ai_paused_at: "2026-08-21T12:00:00Z",
      }),
      capturedUpdate,
    });

    await escalateToHuman(ORG_A, USER_1, CONV_1);
    expect(capturedUpdate.value).toEqual({
      requires_human: true,
      ai_paused_at: expect.any(String),
    });
    expect(recordLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Escalated to human" })
    );
  });

  it("resumeAI clears pause and requires_human so the operator can return the thread to AI", async () => {
    const capturedUpdate: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockHandoffClient({
      current: makeConversation({
        requires_human: true,
        ai_paused_at: "2026-08-21T12:00:00Z",
      }),
      updated: makeConversation(),
      capturedUpdate,
    });

    const result = await resumeAI(ORG_A, USER_1, CONV_1);
    expect(result.requires_human).toBe(false);
    expect(result.ai_paused_at).toBeNull();
    expect(capturedUpdate.value).toEqual({
      ai_paused_at: null,
      requires_human: false,
    });
    expect(recordLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ content: "AI resumed" })
    );
  });
});
