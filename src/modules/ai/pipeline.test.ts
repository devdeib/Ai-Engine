/**
 * Server-derived pipeline snapshot tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import type { PipelineSnapshotInput } from "@/modules/ai/pipeline";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Flags = {
  scheduledAppointment: boolean;
  pendingFollowUp: boolean;
  pendingApproval: boolean;
};

function chain(result: { data: { id: string } | null }) {
  const terminal = {
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data, error: null }),
  };
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.eq = vi.fn(self);
  api.gt = vi.fn(self);
  api.limit = vi.fn(self);
  Object.assign(api, terminal);
  return api;
}

function mockFlags(flags: Flags) {
  const from = vi.fn((table: string) => {
    if (table === "appointments") {
      return {
        select: vi.fn(() =>
          chain({
            data: flags.scheduledAppointment ? { id: "hidden" } : null,
          })
        ),
      };
    }
    if (table === "lead_follow_ups") {
      return {
        select: vi.fn(() =>
          chain({
            data: flags.pendingFollowUp ? { id: "hidden" } : null,
          })
        ),
      };
    }
    if (table === "ai_tool_actions") {
      return {
        select: vi.fn(() =>
          chain({
            data: flags.pendingApproval ? { id: "hidden" } : null,
          })
        ),
      };
    }
    return { select: vi.fn() };
  });
  vi.mocked(createClient).mockResolvedValue({
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return from;
}

function baseInput(
  overrides: Partial<PipelineSnapshotInput> = {}
): PipelineSnapshotInput {
  return {
    organizationId: ORG_A,
    leadId: LEAD_1,
    conversationId: CONV_1,
    leadStatus: "contacted",
    conversationStatus: "open",
    requiresHuman: false,
    aiPausedAt: null,
    contactEmailPresent: true,
    contactPhonePresent: false,
    messages: [
      { direction: "inbound", createdAt: "2026-08-21T10:00:00Z" },
      { direction: "outbound", createdAt: "2026-08-21T10:05:00Z" },
      { direction: "inbound", createdAt: "2026-08-21T11:00:00Z" },
    ],
    ...overrides,
  };
}

describe("buildPipelineSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags({
      scheduledAppointment: false,
      pendingFollowUp: false,
      pendingApproval: false,
    });
  });

  it("derives paused, message recency, and contact flags from trusted inputs", async () => {
    const snapshot = await buildPipelineSnapshot(
      baseInput({ aiPausedAt: "2026-08-21T12:00:00Z" })
    );
    expect(snapshot.aiPaused).toBe(true);
    expect(snapshot.leadStatus).toBe("contacted");
    expect(snapshot.conversationStatus).toBe("open");
    expect(snapshot.requiresHuman).toBe(false);
    expect(snapshot.latestMessageDirection).toBe("inbound");
    expect(snapshot.lastInboundAt).toBe("2026-08-21T11:00:00Z");
    expect(snapshot.lastOutboundAt).toBe("2026-08-21T10:05:00Z");
    expect(snapshot.contactEmailPresent).toBe(true);
    expect(snapshot.contactPhonePresent).toBe(false);
  });

  it("sets hasScheduledAppointment from an EXISTS query, not the 5-row page", async () => {
    const from = mockFlags({
      scheduledAppointment: true,
      pendingFollowUp: false,
      pendingApproval: false,
    });
    const snapshot = await buildPipelineSnapshot(baseInput());
    expect(snapshot.hasScheduledAppointment).toBe(true);
    expect(from).toHaveBeenCalledWith("appointments");
  });

  it("sets hasPendingFollowUp from an EXISTS query", async () => {
    mockFlags({
      scheduledAppointment: false,
      pendingFollowUp: true,
      pendingApproval: false,
    });
    const snapshot = await buildPipelineSnapshot(baseInput());
    expect(snapshot.hasPendingFollowUp).toBe(true);
  });

  it("sets hasPendingAppointmentApproval for unexpired HITL create_appointment", async () => {
    const from = mockFlags({
      scheduledAppointment: false,
      pendingFollowUp: false,
      pendingApproval: true,
    });
    const snapshot = await buildPipelineSnapshot(baseInput());
    expect(snapshot.hasPendingAppointmentApproval).toBe(true);
    expect(from).toHaveBeenCalledWith("ai_tool_actions");
  });

  it("does not include UUIDs, emails, phones, notes, or scores", async () => {
    mockFlags({
      scheduledAppointment: true,
      pendingFollowUp: true,
      pendingApproval: true,
    });
    const snapshot = await buildPipelineSnapshot(baseInput());
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(UUID_PATTERN);
    expect(serialized).not.toContain("ahmed@example.com");
    expect(serialized).not.toContain("+20100");
    expect(serialized).not.toContain("secret");
    expect(snapshot).not.toHaveProperty("score");
    expect(snapshot).not.toHaveProperty("email");
    expect(snapshot).not.toHaveProperty("phone");
    expect(snapshot).not.toHaveProperty("owner_id");
  });

  it("rebuilds HITL approval after a later EXISTS result (post-tool turn)", async () => {
    mockFlags({
      scheduledAppointment: false,
      pendingFollowUp: false,
      pendingApproval: false,
    });
    const before = await buildPipelineSnapshot(baseInput());
    expect(before.hasPendingAppointmentApproval).toBe(false);

    mockFlags({
      scheduledAppointment: false,
      pendingFollowUp: false,
      pendingApproval: true,
    });
    const after = await buildPipelineSnapshot(baseInput());
    expect(after.hasPendingAppointmentApproval).toBe(true);
  });
});
