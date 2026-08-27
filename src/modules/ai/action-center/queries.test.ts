import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { listRecentActionableRecommendations } from "@/modules/ai/action-center/queries";
import { actionCenterCandidateLimit } from "@/modules/ai/action-center/constants";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";

describe("listRecentActionableRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("rejects non-members before querying", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      listRecentActionableRecommendations(ORG_A, USER_1)
    ).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("scopes to the organization, recorded status, and actionable kinds", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const inn = vi.fn(() => ({ order }));
    const eqStatus = vi.fn(() => ({ in: inn }));
    const eqOrg = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqOrg }));
    const from = vi.fn(() => ({ select }));

    vi.mocked(createClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await listRecentActionableRecommendations(ORG_A, USER_1, 20);

    expect(from).toHaveBeenCalledWith("ai_sales_recommendations");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(eqOrg).not.toHaveBeenCalledWith("organization_id", ORG_B);
    expect(eqStatus).toHaveBeenCalledWith("status", "recorded");
    expect(inn).toHaveBeenCalledWith("recommended_action", [
      "suggest_appointment_approval",
      "suggest_human_handoff",
    ]);
    expect(limit).toHaveBeenCalledWith(actionCenterCandidateLimit(20));
    const selectArg = String((select.mock.calls as unknown[][])[0]?.[0]);
    expect(selectArg).not.toContain("email");
    expect(selectArg).not.toContain("phone");
  });
});
