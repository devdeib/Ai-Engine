import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiSalesRecommendation } from "@/lib/db/types";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  hasInboundFollowUpAction,
  listConversationToolActions,
  loadRecommendationByInbound,
} from "@/modules/ai/execution/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

function chain(result: { data: unknown; error?: { message: string } | null }) {
  const terminal = {
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data,
      error: result.error ?? null,
    }),
  };
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.eq = vi.fn(self);
  api.in = vi.fn(self);
  api.limit = vi.fn(self);
  Object.assign(api, terminal);
  return api;
}

describe("execution queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a recommendation by organization and inbound", async () => {
    const row = { id: "rec-1", organization_id: ORG_A } as AiSalesRecommendation;
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        expect(table).toBe("ai_sales_recommendations");
        return { select: vi.fn(() => chain({ data: row })) };
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const loaded = await loadRecommendationByInbound(ORG_A, INBOUND);
    expect(loaded).toEqual(row);
  });

  it("returns null when no recommendation exists", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => chain({ data: null })),
      })),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    expect(await loadRecommendationByInbound(ORG_A, INBOUND)).toBeNull();
  });

  it("detects an existing inbound create_follow_up action", async () => {
    const from = vi.fn((table: string) => {
      expect(table).toBe("ai_tool_actions");
      return { select: vi.fn(() => chain({ data: { id: "action-1" } })) };
    });
    vi.mocked(createClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    expect(await hasInboundFollowUpAction(ORG_A, INBOUND)).toBe(true);
  });

  it("returns false when no inbound follow-up action exists", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => chain({ data: null })),
      })),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    expect(await hasInboundFollowUpAction(ORG_A, INBOUND)).toBe(false);
  });

  it("lists conversation tool actions without loading payloads", async () => {
    const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
    const rows = [
      {
        id: "action-1",
        tool_name: "create_follow_up",
        status: "executed",
        trust: "autonomous",
        expires_at: null,
        created_at: "2026-08-21T10:02:00Z",
        inbound_message_id: INBOUND,
      },
    ];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        expect(table).toBe("ai_tool_actions");
        return query;
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const listed = await listConversationToolActions(ORG_A, CONV_1);
    expect(listed).toEqual(rows);
    expect(query.select).toHaveBeenCalledWith(
      "id, tool_name, status, trust, expires_at, created_at, inbound_message_id"
    );
    expect(JSON.stringify(listed)).not.toContain("payload");
  });
});
