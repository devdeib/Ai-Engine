/**
 * Durable write-tool + HITL approval tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError, TenantAccessError } from "@/lib/errors";
import type { AiToolAction, Appointment, LeadFollowUp } from "@/lib/db/types";
import type { AiToolContext } from "@/modules/ai/tools/types";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/follow-ups/actions", () => ({
  createLeadFollowUp: vi.fn(),
}));
vi.mock("@/modules/appointments/actions", () => ({
  createAppointment: vi.fn(),
}));
vi.mock("@/modules/leads/qualification-write", () => ({
  applyRecordedCustomerFacts: vi.fn(),
}));
vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { createLeadFollowUp } from "@/modules/follow-ups/actions";
import { createAppointment } from "@/modules/appointments/actions";
import { applyRecordedCustomerFacts } from "@/modules/leads/qualification-write";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  approveAiToolAction,
  executeCreateFollowUp,
  executeRecordCustomerFacts,
  rejectAiToolAction,
  requestCreateAppointment,
} from "@/modules/ai/actions/write";
import { hashAiToolInput } from "@/modules/ai/actions/hash";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const USER_2 = "00000000-0000-4000-8000-000000000002";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FU_1 = "ffffffff-0000-4000-8000-000000000001";
const APPT_1 = "aaaaaaaa-0000-4000-8000-0000000000aa";

const ctx: AiToolContext = {
  organizationId: ORG_A,
  userId: USER_1,
  triggerSource: "operator",
  channelIdentityId: null,
  conversationId: CONV_1,
  leadId: LEAD_1,
  inboundMessageId: INBOUND,
};

const followUpInput = {
  title: "Call Ahmed",
  notes: null as string | null,
  dueAt: "2026-08-22T10:00:00.000Z",
};

const appointmentInput = {
  startsAt: "2026-08-22T10:00:00.000Z",
  endsAt: "2026-08-22T11:00:00.000Z",
  location: "West Bay",
  notes: null as string | null,
};

let rows: AiToolAction[] = [];
let nextId = 0;

function makeFollowUp(): LeadFollowUp {
  return {
    id: FU_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    title: followUpInput.title,
    notes: null,
    due_at: followUpInput.dueAt,
    status: "pending",
    created_at: "2026-08-22T09:00:00Z",
    updated_at: "2026-08-22T09:00:00Z",
  };
}

function makeAppointment(): Appointment {
  return {
    id: APPT_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    starts_at: appointmentInput.startsAt,
    ends_at: appointmentInput.endsAt,
    status: "scheduled",
    location: appointmentInput.location,
    notes: null,
    created_at: "2026-08-22T09:00:00Z",
    updated_at: "2026-08-22T09:00:00Z",
  };
}

function matchEq(row: AiToolAction, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, value]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    return actual === value;
  });
}

function installStore() {
  rows = [];
  nextId = 0;

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== "ai_tool_actions") return {};

      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const duplicate = rows.find(
                (row) =>
                  row.organization_id === payload.organization_id &&
                  row.inbound_message_id === payload.inbound_message_id &&
                  row.tool_name === payload.tool_name &&
                  row.input_hash === payload.input_hash
              );
              if (duplicate) {
                return { data: null, error: { code: "23505", message: "duplicate" } };
              }
              nextId += 1;
              const row = {
                id: nextId === 1 ? ACTION_1 : `action-${nextId}`,
                created_at: "2026-08-22T09:00:00Z",
                updated_at: "2026-08-22T09:00:00Z",
                result_summary: payload.result_summary ?? null,
                result_resource_type: null,
                result_resource_id: null,
                approved_by_user_id: null,
                decided_at: null,
                executed_at: null,
                expires_at: payload.expires_at ?? null,
                error_code: null,
                ...payload,
              } as AiToolAction;
              rows.push(row);
              return { data: row, error: null };
            },
          }),
        }),
        select: () => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return chain;
            },
            maybeSingle: async () => {
              const found = rows.find((row) => matchEq(row, filters)) ?? null;
              return { data: found, error: found ? null : { message: "none" } };
            },
            single: async () => {
              const found = rows.find((row) => matchEq(row, filters)) ?? null;
              return { data: found, error: found ? null : { message: "none" } };
            },
          };
          return chain;
        },
        update: (patch: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                const index = rows.findIndex((row) => matchEq(row, filters));
                if (index < 0) return { data: null, error: null };
                const next = { ...rows[index], ...patch } as AiToolAction;
                rows[index] = next;
                return { data: next, error: null };
              },
            }),
          };
          return chain;
        },
      };
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("executeCreateFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(createLeadFollowUp).mockResolvedValue(makeFollowUp());
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
    installStore();
  });

  it("creates a follow-up with trusted context and no assignee", async () => {
    const result = await executeCreateFollowUp(ctx, followUpInput);
    expect(createLeadFollowUp).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_1,
      {
        title: "Call Ahmed",
        notes: null,
        due_at: followUpInput.dueAt,
      },
      { idempotencyKey: ACTION_1 }
    );
    expect(result).toEqual({
      status: "created",
      title: "Call Ahmed",
      dueAt: followUpInput.dueAt,
    });
    expect(JSON.stringify(result)).not.toContain(FU_1);
    expect(rows[0]?.result_resource_id).toBe(FU_1);
    expect(rows[0]?.requested_by_user_id).toBe(USER_1);
  });

  it("replays the stored result for the same inbound and args", async () => {
    await executeCreateFollowUp(ctx, followUpInput);
    const second = await executeCreateFollowUp(ctx, followUpInput);
    expect(createLeadFollowUp).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      status: "created",
      title: "Call Ahmed",
      dueAt: followUpInput.dueAt,
    });
    expect(rows).toHaveLength(1);
  });

  it("uses a different hash for different args", async () => {
    await executeCreateFollowUp(ctx, followUpInput);
    vi.mocked(createLeadFollowUp).mockResolvedValue({
      ...makeFollowUp(),
      id: "ffffffff-0000-4000-8000-000000000099",
      title: "Visit",
    });
    await executeCreateFollowUp(ctx, { ...followUpInput, title: "Visit" });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.input_hash).not.toBe(rows[1]?.input_hash);
    expect(rows[0]?.input_hash).toBe(hashAiToolInput({
      title: followUpInput.title,
      notes: null,
      dueAt: followUpInput.dueAt,
    }));
  });

  it("does not fake success when domain create fails", async () => {
    vi.mocked(createLeadFollowUp).mockRejectedValue(new Error("insert failed"));
    await expect(executeCreateFollowUp(ctx, followUpInput)).rejects.toThrow(
      "insert failed"
    );
    expect(rows[0]?.status).toBe("failed");
  });
});

describe("requestCreateAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
    installStore();
  });

  it("stores a pending action and does not create an appointment", async () => {
    const result = await requestCreateAppointment(ctx, appointmentInput);
    expect(createAppointment).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "pending_approval",
      startsAt: appointmentInput.startsAt,
      endsAt: appointmentInput.endsAt,
      location: "West Bay",
    });
    expect(JSON.stringify(result)).not.toContain(ACTION_1);
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.trust).toBe("human_approval");
    expect(rows[0]?.approved_by_user_id).toBeNull();
    expect(rows[0]?.expires_at).toBeTruthy();
    expect(recordLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ai",
        content: "AI requested an appointment approval.",
      })
    );
  });

  it("replays the same pending result for duplicate inbound + args", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    const second = await requestCreateAppointment(ctx, appointmentInput);
    expect(rows).toHaveLength(1);
    expect(second.status).toBe("pending_approval");
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
  });
});

describe("approveAiToolAction / rejectAiToolAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(createAppointment).mockResolvedValue(makeAppointment());
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
    installStore();
  });

  it("creates exactly one appointment as the approving human", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    const approved = await approveAiToolAction(ORG_A, USER_2, ACTION_1);
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(createAppointment).toHaveBeenCalledWith(
      ORG_A,
      USER_2,
      LEAD_1,
      expect.objectContaining({
        starts_at: appointmentInput.startsAt,
        location: "West Bay",
      }),
      { idempotencyKey: ACTION_1 }
    );
    expect(approved.status).toBe("executed");
    expect(approved.approved_by_user_id).toBe(USER_2);
    expect(approved.requested_by_user_id).toBe(USER_1);
    expect(approved.result_resource_id).toBe(APPT_1);
  });

  it("returns 409 semantics on a second sequential approve", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    await approveAiToolAction(ORG_A, USER_2, ACTION_1);
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow(
      ConflictError
    );
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });

  it("rejects without creating an appointment", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    const rejected = await rejectAiToolAction(ORG_A, USER_2, ACTION_1, "Not now");
    expect(createAppointment).not.toHaveBeenCalled();
    expect(rejected.status).toBe("rejected");
    expect(rejected.approved_by_user_id).toBe(USER_2);
  });

  it("does not create an appointment for an expired action", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    rows[0] = {
      ...rows[0]!,
      expires_at: "2020-01-01T00:00:00.000Z",
    };
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow(
      ConflictError
    );
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("does not re-execute rejected or failed actions", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    rows[0] = { ...rows[0]!, status: "failed" };
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow(
      ConflictError
    );
    rows[0] = { ...rows[0]!, status: "rejected" };
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow(
      ConflictError
    );
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or cross-tenant action", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    await expect(approveAiToolAction(ORG_B, USER_1, ACTION_1)).rejects.toThrow(
      NotFoundError
    );
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("revalidates payload before creating the appointment", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    rows[0] = {
      ...rows[0]!,
      payload: { startsAt: "not-a-date" },
    };
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("resumes executing with the same idempotency key", async () => {
    await requestCreateAppointment(ctx, appointmentInput);
    rows[0] = {
      ...rows[0]!,
      status: "executing",
      approved_by_user_id: USER_2,
    };
    await approveAiToolAction(ORG_A, USER_2, ACTION_1);
    expect(createAppointment).toHaveBeenCalledWith(
      ORG_A,
      USER_2,
      LEAD_1,
      expect.any(Object),
      { idempotencyKey: ACTION_1 }
    );
  });

  it("propagates membership failures", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(approveAiToolAction(ORG_A, USER_2, ACTION_1)).rejects.toThrow(
      TenantAccessError
    );
  });
});

describe("executeRecordCustomerFacts", () => {
  const factsInput = { email: "ahmed@example.com", budget: "200k" };
  const factsResult = {
    applied: ["email", "budget"] as Array<"email" | "budget">,
    skipped: [],
    appliedFacts: { budget: "200k" },
    priorFacts: {},
    firstName: "Ahmed",
    lastName: "Ali",
    email: "ahmed@example.com",
    phone: null,
    companyName: null,
    crmQualificationStatus: "qualifying" as const,
    missingRequiredFields: ["timeline", "location"] as Array<
      "timeline" | "location"
    >,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyRecordedCustomerFacts).mockResolvedValue(factsResult);
    installStore();
  });

  it("records facts autonomously and points the ledger at the lead", async () => {
    const result = await executeRecordCustomerFacts(ctx, factsInput);
    expect(applyRecordedCustomerFacts).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_1,
      factsInput
    );
    expect(result).toEqual(factsResult);
    expect(result).not.toHaveProperty("knownFacts");
    expect(result).not.toHaveProperty("qualificationStatus");
    expect(rows[0]?.tool_name).toBe("record_customer_facts");
    expect(rows[0]?.trust).toBe("autonomous");
    expect(rows[0]?.status).toBe("executed");
    expect(rows[0]?.result_resource_type).toBe("lead");
    expect(rows[0]?.result_resource_id).toBe(LEAD_1);
    expect(rows[0]?.result_summary).toEqual(factsResult);
    expect(rows[0]?.result_summary).not.toHaveProperty("knownFacts");
    expect(rows[0]?.result_summary).not.toHaveProperty("qualificationStatus");
    expect(JSON.stringify(result)).not.toContain(ACTION_1);
  });

  it("replays the stored result for the same inbound and args", async () => {
    await executeRecordCustomerFacts(ctx, factsInput);
    const second = await executeRecordCustomerFacts(ctx, factsInput);
    expect(applyRecordedCustomerFacts).toHaveBeenCalledTimes(1);
    expect(second).toEqual(factsResult);
    expect(rows).toHaveLength(1);
  });

  it("merges sequential different hashes", async () => {
    await executeRecordCustomerFacts(ctx, factsInput);
    vi.mocked(applyRecordedCustomerFacts).mockResolvedValue({
      ...factsResult,
      applied: ["timeline"],
      appliedFacts: { timeline: "3 months" },
      priorFacts: { budget: "200k" },
    });
    await executeRecordCustomerFacts(ctx, { timeline: "3 months" });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.input_hash).not.toBe(rows[1]?.input_hash);
    expect(applyRecordedCustomerFacts).toHaveBeenCalledTimes(2);
  });

  it("uses channel userId null without assigning an operator", async () => {
    await executeRecordCustomerFacts(
      { ...ctx, userId: null, triggerSource: "channel_ingress" },
      factsInput
    );
    expect(applyRecordedCustomerFacts).toHaveBeenCalledWith(
      ORG_A,
      null,
      LEAD_1,
      factsInput
    );
    expect(rows[0]?.requested_by_user_id).toBeNull();
  });
});
