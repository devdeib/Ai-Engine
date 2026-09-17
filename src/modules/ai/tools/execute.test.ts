import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError, ValidationError } from "@/lib/errors";
import { AiToolError } from "@/modules/ai/errors";

vi.mock("@/modules/leads/queries", () => ({
  getLead: vi.fn(),
}));
vi.mock("@/modules/conversations/queries", () => ({
  listRecentConversationMessages: vi.fn(),
}));
vi.mock("@/modules/appointments/queries", () => ({
  listLeadAppointments: vi.fn(),
}));
vi.mock("@/modules/follow-ups/queries", () => ({
  listLeadFollowUps: vi.fn(),
}));
vi.mock("@/modules/ai/actions/write", () => ({
  executeCreateFollowUp: vi.fn(),
  executeRecordCustomerFacts: vi.fn(),
  requestCreateAppointment: vi.fn(),
  approveAiToolAction: vi.fn(),
  rejectAiToolAction: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getLead } from "@/modules/leads/queries";
import { listRecentConversationMessages } from "@/modules/conversations/queries";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { executeCreateFollowUp, requestCreateAppointment } from "@/modules/ai/actions/write";
import { runAiToolCall } from "@/modules/ai/tools/execute";
import { logger } from "@/lib/logger";
import type { AiToolContext } from "@/modules/ai/tools/types";
import type { Lead } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

const ctx: AiToolContext = {
  organizationId: ORG_A,
  userId: USER_1,
  triggerSource: "operator",
  channelIdentityId: null,
  conversationId: CONV_1,
  leadId: LEAD_1,
  inboundMessageId: "11111111-0000-4000-8000-0000000000aa",
};

const lead = {
  id: LEAD_1,
  organization_id: ORG_A,
  owner_id: USER_1,
  first_name: "Ahmed",
  last_name: "Ali",
  email: "ahmed@example.com",
  phone: null,
  company_name: null,
  source: "other",
  status: "new",
  score: 10,
  notes: "VIP",
  qualification_facts: {},
  qualification_updated_at: null,
} as Lead;

describe("runAiToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLead).mockResolvedValue(lead);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([]);
    vi.mocked(listLeadAppointments).mockResolvedValue([]);
    vi.mocked(listLeadFollowUps).mockResolvedValue([]);
    vi.mocked(executeCreateFollowUp).mockResolvedValue({
      status: "created",
      title: "Call Ahmed",
      dueAt: "2026-08-22T10:00:00.000Z",
    });
    vi.mocked(requestCreateAppointment).mockResolvedValue({
      status: "pending_approval",
      startsAt: "2026-08-22T10:00:00.000Z",
      endsAt: "2026-08-22T11:00:00.000Z",
      location: "West Bay",
    });
  });

  it("rejects an unknown tool without executing domain queries", async () => {
    const result = await runAiToolCall(
      { id: "1", name: "eval", arguments: {} },
      ctx
    );
    expect(result).toEqual({
      ok: false,
      name: "eval",
      code: "AI_UNKNOWN_TOOL",
    });
    expect(getLead).not.toHaveBeenCalled();
  });

  it("rejects extra identity fields from the model", async () => {
    const result = await runAiToolCall(
      {
        id: "1",
        name: "get_lead_context",
        arguments: {
          organizationId: ORG_B,
          userId: "forged",
          conversationId: "forged",
          leadId: "forged",
        },
      },
      ctx
    );
    expect(result).toEqual({
      ok: false,
      name: "get_lead_context",
      code: "AI_TOOL_INVALID_ARGUMENTS",
    });
    expect(getLead).not.toHaveBeenCalled();
  });

  it("executes get_lead_context with trusted context and validated output", async () => {
    const result = await runAiToolCall(
      { id: "1", name: "get_lead_context", arguments: {} },
      ctx
    );
    expect(getLead).toHaveBeenCalledWith(LEAD_1, ORG_A, USER_1);
    expect(result).toEqual({
      ok: true,
      name: "get_lead_context",
      data: {
        firstName: "Ahmed",
        lastName: "Ali",
        companyName: null,
        email: "ahmed@example.com",
        phone: null,
        status: "new",
        score: 10,
        notes: "VIP",
        priorQualificationFacts: {},
        priorQualificationStatus: "not_started",
        priorMissingRequiredFields: ["budget", "timeline", "location"],
      },
    });
    if (result.ok) {
      expect(JSON.stringify(result.data)).not.toContain(ORG_A);
      expect(JSON.stringify(result.data)).not.toContain(LEAD_1);
      expect(result.data).not.toHaveProperty("qualificationFacts");
      expect(result.data).not.toHaveProperty("qualificationStatus");
      expect(result.data).not.toHaveProperty("missingRequiredFields");
    }
  });

  it("executes conversation, appointment, and follow-up tools via domain queries", async () => {
    await runAiToolCall(
      { id: "1", name: "get_conversation_history", arguments: {} },
      ctx
    );
    await runAiToolCall(
      { id: "2", name: "get_lead_appointments", arguments: {} },
      ctx
    );
    await runAiToolCall(
      { id: "3", name: "get_lead_follow_ups", arguments: {} },
      ctx
    );
    expect(listRecentConversationMessages).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      20
    );
    expect(listLeadAppointments).toHaveBeenCalledWith(ORG_A, USER_1, LEAD_1, {
      page: 1,
      limit: 5,
    });
    expect(listLeadFollowUps).toHaveBeenCalledWith(ORG_A, USER_1, LEAD_1, {
      page: 1,
      limit: 5,
    });
  });

  it("aborts on tenant access errors instead of returning them to the model", async () => {
    vi.mocked(getLead).mockRejectedValue(new TenantAccessError());
    await expect(
      runAiToolCall({ id: "1", name: "get_lead_context", arguments: {} }, ctx)
    ).rejects.toThrow(TenantAccessError);
  });

  it("returns a safe not-found envelope for missing records", async () => {
    vi.mocked(getLead).mockRejectedValue(new NotFoundError("Lead"));
    await expect(
      runAiToolCall({ id: "1", name: "get_lead_context", arguments: {} }, ctx)
    ).resolves.toEqual({
      ok: false,
      name: "get_lead_context",
      code: "AI_TOOL_NOT_FOUND",
    });
  });

  it("aborts internal tool failures without leaking SQL", async () => {
    vi.mocked(getLead).mockRejectedValue(
      new Error("Failed to fetch leads: permission denied")
    );
    await expect(
      runAiToolCall({ id: "1", name: "get_lead_context", arguments: {} }, ctx)
    ).rejects.toThrow(AiToolError);
  });

  it("logs tool name and outcome without raw arguments or CRM payloads", async () => {
    await runAiToolCall(
      { id: "1", name: "get_lead_context", arguments: {} },
      ctx
    );
    expect(logger.info).toHaveBeenCalledWith(
      "AI tool executed",
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        tool: "get_lead_context",
        outcome: "ok",
      })
    );
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain("ahmed@example.com");
    expect(logged).not.toContain("VIP");
    expect(logged).not.toContain("arguments");
  });

  it("rejects forged identity fields on create_follow_up before domain execution", async () => {
    const result = await runAiToolCall(
      {
        id: "1",
        name: "create_follow_up",
        arguments: {
          title: "Call Ahmed",
          dueAt: "2026-08-22T10:00:00Z",
          organizationId: ORG_B,
          userId: "forged",
          conversationId: "forged",
          leadId: "forged",
          assigned_user_id: USER_1,
          owner_id: USER_1,
          actionId: "forged",
          status: "approved",
        },
      },
      ctx
    );
    expect(result).toEqual({
      ok: false,
      name: "create_follow_up",
      code: "AI_TOOL_INVALID_ARGUMENTS",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("executes create_follow_up through runAiToolCall with trusted context", async () => {
    const result = await runAiToolCall(
      {
        id: "1",
        name: "create_follow_up",
        arguments: { title: "Call Ahmed", dueAt: "2026-08-22T10:00:00Z" },
      },
      ctx
    );
    expect(executeCreateFollowUp).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ title: "Call Ahmed" })
    );
    expect(result).toEqual({
      ok: true,
      name: "create_follow_up",
      data: {
        status: "created",
        title: "Call Ahmed",
        dueAt: "2026-08-22T10:00:00.000Z",
      },
    });
  });

  it("returns pending_approval for create_appointment without an appointment id", async () => {
    const result = await runAiToolCall(
      {
        id: "1",
        name: "create_appointment",
        arguments: { startsAt: "2026-08-22T10:00:00Z" },
      },
      ctx
    );
    expect(requestCreateAppointment).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ startsAt: expect.any(String) })
    );
    expect(result).toEqual({
      ok: true,
      name: "create_appointment",
      data: {
        status: "pending_approval",
        startsAt: "2026-08-22T10:00:00.000Z",
        endsAt: "2026-08-22T11:00:00.000Z",
        location: "West Bay",
      },
    });
    if (result.ok) {
      expect(JSON.stringify(result.data)).not.toContain("action");
    }
  });

  it("returns a business-rule envelope instead of aborting", async () => {
    vi.mocked(executeCreateFollowUp).mockRejectedValue(
      new ValidationError("Invalid follow-up data")
    );
    const result = await runAiToolCall(
      {
        id: "1",
        name: "create_follow_up",
        arguments: { title: "Call Ahmed", dueAt: "2026-08-22T10:00:00Z" },
      },
      ctx
    );
    expect(result).toEqual({
      ok: false,
      name: "create_follow_up",
      code: "AI_TOOL_REJECTED",
    });
  });
});
