import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/conversations/queries", () => ({
  getConversation: vi.fn(),
}));
vi.mock("@/modules/ai/analysis/queries", () => ({
  getLatestInboundMessageId: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { getConversation } from "@/modules/conversations/queries";
import { getLatestInboundMessageId } from "@/modules/ai/analysis/queries";
import {
  getCurrentAiSalesRecommendation,
  listAiSalesRecommendations,
} from "@/modules/ai/recommendation/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

describe("ai sales recommendation queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue({} as never);
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      listAiSalesRecommendations(ORG_A, USER_1, CONV_1)
    ).rejects.toThrow(TenantAccessError);
  });

  it("returns 404 when the conversation has no inbound message", async () => {
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(null);
    await expect(
      getCurrentAiSalesRecommendation(ORG_A, USER_1, CONV_1)
    ).rejects.toThrow(NotFoundError);
  });

  it("returns 404 when no recommendation exists for the latest inbound", async () => {
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        })),
      })),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      getCurrentAiSalesRecommendation(ORG_A, USER_1, CONV_1)
    ).rejects.toThrow(NotFoundError);
  });
});
