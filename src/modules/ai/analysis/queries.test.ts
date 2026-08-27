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

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { getConversation } from "@/modules/conversations/queries";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
  listAiSalesAnalyses,
} from "@/modules/ai/analysis/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

describe("ai sales analysis queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue({} as never);
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listAiSalesAnalyses(ORG_A, USER_1, CONV_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("returns 404 via NotFoundError when no current analysis exists", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                range: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        })),
      })),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      getLatestAiSalesAnalysis(ORG_A, USER_1, CONV_1)
    ).rejects.toThrow(NotFoundError);
  });

  it("loads the latest inbound id for freshness", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "inbound-latest" },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(getLatestInboundMessageId(ORG_A, CONV_1)).resolves.toBe(
      "inbound-latest"
    );
  });
});
