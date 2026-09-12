/**
 * AI context builder tests. Domain queries are mocked — no live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/modules/organizations/queries", () => ({
  getOrganization: vi.fn(),
  getOrganizationName: vi.fn(),
}));
vi.mock("@/modules/organizations/sales-profile", () => ({
  getOrganizationSalesProfile: vi.fn(),
}));
vi.mock("@/modules/leads/queries", () => ({
  getLead: vi.fn(),
}));
vi.mock("@/modules/conversations/queries", () => ({
  getConversation: vi.fn(),
  listRecentConversationMessages: vi.fn(),
}));
vi.mock("@/modules/follow-ups/queries", () => ({
  listLeadFollowUps: vi.fn(),
}));
vi.mock("@/modules/appointments/queries", () => ({
  listLeadAppointments: vi.fn(),
}));
vi.mock("@/modules/leads/activities/queries", () => ({
  listLeadActivities: vi.fn(),
}));
vi.mock("@/modules/ai/pipeline", () => ({
  buildPipelineSnapshot: vi.fn(),
}));

import { getOrganization, getOrganizationName } from "@/modules/organizations/queries";
import { getOrganizationSalesProfile } from "@/modules/organizations/sales-profile";
import { getLead } from "@/modules/leads/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { listLeadActivities } from "@/modules/leads/activities/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import { buildAiContext } from "@/modules/ai/context";
import { EMPTY_AI_SALES_PROFILE } from "@/modules/ai/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

function stubHappyPath() {
  vi.mocked(getConversation).mockResolvedValue({
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
    lead: { id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: null },
  });
  vi.mocked(getOrganization).mockResolvedValue({
    id: ORG_A,
    name: "Acme Realty",
    slug: "acme",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    role: "owner",
  });
  vi.mocked(getLead).mockResolvedValue({
    id: LEAD_1,
    organization_id: ORG_A,
    first_name: "Ahmed",
    last_name: "Ali",
    company_name: "Ali Co",
    email: "ahmed@example.com",
    phone: "+20100",
    status: "new",
    source: "website",
    score: 55,
    notes: "Downtown interest",
    owner_id: USER_1,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  });
  vi.mocked(listRecentConversationMessages).mockResolvedValue([
    {
      id: "m1",
      organization_id: ORG_A,
      conversation_id: CONV_1,
      author_user_id: USER_1,
      author_type: "human",
      direction: "inbound",
      body: "Hello",
      in_reply_to_message_id: null,
      channel_identity_id: null,
      created_at: "2026-08-21T10:00:00Z",
    },
  ]);
  vi.mocked(listLeadFollowUps).mockResolvedValue([
    {
      id: "f1",
      organization_id: ORG_A,
      lead_id: LEAD_1,
      assigned_user_id: null,
      title: "Call back",
      notes: "secret notes",
      due_at: "2026-08-25T10:00:00Z",
      status: "pending",
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-20T00:00:00Z",
    },
  ]);
  vi.mocked(listLeadAppointments).mockResolvedValue([
    {
      id: "a1",
      organization_id: ORG_A,
      lead_id: LEAD_1,
      assigned_user_id: null,
      starts_at: "2026-08-26T10:00:00Z",
      ends_at: null,
      location: "Office",
      notes: "internal",
      status: "scheduled",
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-20T00:00:00Z",
    },
  ]);
  vi.mocked(listLeadActivities).mockResolvedValue([
    {
      id: "act1",
      organization_id: ORG_A,
      lead_id: LEAD_1,
      user_id: USER_1,
      type: "note",
      content: "Called the lead",
      created_at: "2026-08-20T09:00:00Z",
    },
  ]);
  vi.mocked(buildPipelineSnapshot).mockResolvedValue({
    leadStatus: "new",
    conversationStatus: "open",
    requiresHuman: false,
    aiPaused: false,
    latestMessageDirection: "inbound",
    lastInboundAt: "2026-08-21T10:00:00Z",
    lastOutboundAt: null,
    hasScheduledAppointment: true,
    hasPendingFollowUp: true,
    hasPendingAppointmentApproval: false,
    contactEmailPresent: true,
    contactPhonePresent: true,
  });
  vi.mocked(getOrganizationSalesProfile).mockResolvedValue({
    offering_summary: null,
    service_area: null,
    qualification_criteria: null,
    constraints: null,
    typical_next_step: null,
  });
}

describe("buildAiContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a prompt-safe context for the correct lead and organization", async () => {
    stubHappyPath();
    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });

    expect(context.organization.name).toBe("Acme Realty");
    expect(context.organization.salesProfile).toEqual(EMPTY_AI_SALES_PROFILE);
    expect(context.lead.firstName).toBe("Ahmed");
    expect(context.lead.lastName).toBe("Ali");
    expect(context.lead.email).toBe("ahmed@example.com");
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]?.body).toBe("Hello");
    expect(context.followUps[0]?.title).toBe("Call back");
    expect(context.appointments[0]?.location).toBe("Office");
    expect(context.recentActivities[0]?.content).toBe("Called the lead");
    expect(context.pipeline.hasScheduledAppointment).toBe(true);
    expect(context.pipeline.hasPendingFollowUp).toBe(true);
    expect(JSON.stringify(context.pipeline)).not.toContain(ORG_A);
    expect(JSON.stringify(context.pipeline)).not.toContain(LEAD_1);
    expect(JSON.stringify(context)).not.toContain(ORG_A);
    expect(JSON.stringify(context)).not.toContain(LEAD_1);
    expect(JSON.stringify(context)).not.toContain("secret notes");
  });

  it("uses the CRM lead first name as the model-facing display name", async () => {
    stubHappyPath();
    vi.mocked(getLead).mockResolvedValue({
      id: LEAD_1,
      organization_id: ORG_A,
      first_name: "Sara",
      last_name: "Customer",
      company_name: null,
      email: null,
      phone: null,
      status: "new",
      source: "other",
      score: null,
      notes: null,
      owner_id: USER_1,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    });
    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });
    expect(context.lead.firstName).toBe("Sara");
    expect(context.lead.firstName).not.toBe("Unknown");
    expect(context.lead.lastName).toBe("Customer");
  });

  it("does not include follow-up notes or appointment notes", async () => {
    stubHappyPath();
    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });
    expect(JSON.stringify(context.followUps)).not.toContain("secret notes");
    expect(JSON.stringify(context.appointments)).not.toContain("internal");
  });

  it("propagates NotFoundError for a cross-tenant conversation", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
    await expect(
      buildAiContext({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
      })
    ).rejects.toThrow(NotFoundError);
    expect(getLead).not.toHaveBeenCalled();
  });

  it("propagates TenantAccessError when membership fails", async () => {
    vi.mocked(getConversation).mockRejectedValue(new TenantAccessError());
    await expect(
      buildAiContext({
        organizationId: ORG_B,
        userId: USER_1,
        conversationId: CONV_1,
      })
    ).rejects.toThrow(TenantAccessError);
  });

  it("includes the configured sales profile for the requested organization", async () => {
    stubHappyPath();
    vi.mocked(getOrganizationSalesProfile).mockResolvedValue({
      offering_summary: "Waterfront apartments",
      service_area: "Dubai Marina",
      qualification_criteria: "Ask budget, timeline, and preferred area",
      constraints: "Never invent prices or availability",
      typical_next_step: "Arrange a viewing",
    });

    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });

    expect(getOrganizationSalesProfile).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(getOrganizationSalesProfile).not.toHaveBeenCalledWith(ORG_B, expect.anything());
    expect(context.organization.salesProfile).toEqual({
      offeringSummary: "Waterfront apartments",
      serviceArea: "Dubai Marina",
      qualificationCriteria: "Ask budget, timeline, and preferred area",
      constraints: "Never invent prices or availability",
      typicalNextStep: "Arrange a viewing",
    });
    expect(JSON.stringify(context)).not.toContain(ORG_A);
  });

  it("does not invent business facts when the profile is empty", async () => {
    stubHappyPath();
    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });
    expect(context.organization.salesProfile).toEqual(EMPTY_AI_SALES_PROFILE);
    expect(context.organization.salesProfile.offeringSummary).toBeNull();
    expect(context.organization.salesProfile.serviceArea).toBeNull();
  });

  it("loads the same organization's profile for trusted userId-null execution", async () => {
    stubHappyPath();
    vi.mocked(getOrganizationName).mockResolvedValue("Acme Realty");
    const context = await buildAiContext({
      organizationId: ORG_A,
      userId: null,
      conversationId: CONV_1,
    });
    expect(getOrganizationName).toHaveBeenCalledWith(ORG_A);
    expect(getOrganizationSalesProfile).toHaveBeenCalledWith(ORG_A, null);
    expect(context.organization.name).toBe("Acme Realty");
    expect(context.organization.salesProfile).toEqual(EMPTY_AI_SALES_PROFILE);
  });
});
