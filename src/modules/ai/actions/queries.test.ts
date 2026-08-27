import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { getAiToolAction, listAiToolActions, loadAiToolActionByInboundHash } from "@/modules/ai/actions/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("listAiToolActions / getAiToolAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("does not query when membership fails", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listAiToolActions(ORG_A, USER_1)).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or cross-tenant action", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "none" } }),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(getAiToolAction(ORG_A, USER_1, ACTION_1)).rejects.toThrow(
      NotFoundError
    );
  });

  it("loads an action by inbound identity and input hash", async () => {
    const row = { id: ACTION_1, input_hash: "a".repeat(64) };
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: row, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const loaded = await loadAiToolActionByInboundHash(
      ORG_A,
      "11111111-0000-4000-8000-0000000000aa",
      "create_appointment",
      "a".repeat(64)
    );
    expect(loaded).toEqual(row);
  });
});
