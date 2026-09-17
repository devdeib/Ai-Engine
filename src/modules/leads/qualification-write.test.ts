import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";
import type { Lead } from "@/lib/db/types";
import {
  CHANNEL_STUB_LEAD_FIRST_NAME,
  CHANNEL_STUB_LEAD_LAST_NAME,
} from "@/modules/channels/constants";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/leads/queries", () => ({
  getLead: vi.fn(),
}));
vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { getLead } from "@/modules/leads/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  applyOperatorQualificationFacts,
  applyRecordedCustomerFacts,
} from "@/modules/leads/qualification-write";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: null,
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: "human notes",
    qualification_facts: {},
    qualification_updated_at: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    ...overrides,
  };
}

function stubLead(overrides: Partial<Lead> = {}): Lead {
  return makeLead({
    first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
    last_name: CHANNEL_STUB_LEAD_LAST_NAME,
    email: null,
    phone: null,
    ...overrides,
  });
}

const updateCapture: {
  patch: Record<string, unknown> | null;
  eq: Array<[string, unknown]>;
} = {
  patch: null,
  eq: [],
};

function mockUpdate(saved: Lead) {
  updateCapture.patch = null;
  updateCapture.eq = [];
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== "leads") return {};
      return {
        update: (patch: Record<string, unknown>) => {
          updateCapture.patch = patch;
          return {
            eq: (column: string, value: unknown) => {
              updateCapture.eq.push([column, value]);
              return {
                eq: (column2: string, value2: unknown) => {
                  updateCapture.eq.push([column2, value2]);
                  return {
                    select: () => ({
                      single: async () => ({
                        data: { ...saved, ...patch },
                        error: null,
                      }),
                    }),
                  };
                },
              };
            },
          };
        },
      };
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("applyRecordedCustomerFacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({
      id: "member",
      organization_id: ORG_A,
      user_id: USER_1,
      role: "owner",
      invited_by: null,
      created_at: "2026-08-19T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
    });
    vi.mocked(recordLeadActivity).mockResolvedValue({
      id: "act-1",
      organization_id: ORG_A,
      lead_id: LEAD_1,
      user_id: USER_1,
      type: "ai",
      content: "AI recorded customer facts",
      created_at: "2026-08-19T00:00:00Z",
    });
  });

  it("writes empty email, phone, and company and skips filled values", async () => {
    const lead = makeLead({ phone: "+974" });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    const result = await applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, {
      email: "ahmed@example.com",
      phone: "+111",
      company_name: "Ali Co",
    });

    expect(result.applied).toEqual(["email", "company_name"]);
    expect(result.skipped).toEqual([{ field: "phone", reason: "already_set" }]);
    expect(result.email).toBe("ahmed@example.com");
    expect(result.phone).toBe("+974");
    expect(result.companyName).toBe("Ali Co");
    expect(recordLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ai",
        content: "AI recorded customer facts",
      })
    );
  });

  it("writes stub names and skips names on a real lead", async () => {
    vi.mocked(getLead).mockResolvedValue(stubLead());
    mockUpdate(stubLead());
    const stubResult = await applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, {
      first_name: "Sara",
      last_name: "Haddad",
    });
    expect(stubResult.applied).toEqual(["first_name", "last_name"]);

    vi.mocked(getLead).mockResolvedValue(makeLead());
    mockUpdate(makeLead());
    const realResult = await applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, {
      first_name: "Sara",
      last_name: "Haddad",
    });
    expect(realResult.applied).toEqual([]);
    expect(realResult.skipped).toEqual([
      { field: "first_name", reason: "not_stub" },
      { field: "last_name", reason: "not_stub" },
    ]);
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
  });

  it("merges facts and lets the latest explicit value win", async () => {
    const lead = makeLead({
      qualification_facts: { budget: "100k", timeline: "soon" },
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);
    const result = await applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, {
      budget: "250k",
      location: "Limassol",
    });
    expect(result.knownFacts).toEqual({
      budget: "250k",
      timeline: "soon",
      location: "Limassol",
    });
    expect(result.qualificationStatus).toBe("qualifying");
  });

  it("is QUALIFIED when required facts and a phone are present", async () => {
    const lead = makeLead({ phone: "+974" });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);
    const result = await applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
      timeline: "3 months",
      location: "Limassol",
      property_type: "apartment",
    });
    expect(result.qualificationStatus).toBe("qualified");
    expect(result.missingRequiredFields).toEqual([]);
  });

  it("does not require membership for channel userId null", async () => {
    const lead = makeLead();
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);
    await applyRecordedCustomerFacts(ORG_A, null, LEAD_1, { budget: "200k" });
    expect(requireOrgMembership).not.toHaveBeenCalled();
    expect(getLead).toHaveBeenCalledWith(LEAD_1, ORG_A, null);
  });

  it("cannot write a lead from another organization", async () => {
    vi.mocked(getLead).mockRejectedValue(new NotFoundError("Lead"));
    await expect(
      applyRecordedCustomerFacts(ORG_B, USER_1, LEAD_1, { budget: "200k" })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("propagates tenant access errors", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      applyRecordedCustomerFacts(ORG_A, USER_1, LEAD_1, { budget: "200k" })
    ).rejects.toThrow(TenantAccessError);
  });
});

describe("applyOperatorQualificationFacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({
      id: "member",
      organization_id: ORG_A,
      user_id: USER_1,
      role: "owner",
      invited_by: null,
      created_at: "2026-08-19T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
    });
  });

  it("sets budget", async () => {
    const lead = makeLead();
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    const result = await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({ budget: "200k" });
    expect(result.qualification_facts).toEqual({ budget: "200k" });
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("updates budget", async () => {
    const lead = makeLead({ qualification_facts: { budget: "100k" } });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "250k",
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({ budget: "250k" });
  });

  it("sets multiple facts", async () => {
    const lead = makeLead();
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
      location: "Limassol",
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({
      budget: "200k",
      location: "Limassol",
    });
  });

  it("preserves unrelated existing facts on a partial patch", async () => {
    const lead = makeLead({
      qualification_facts: {
        budget: "200k",
        timeline: "soon",
        location: "Limassol",
      },
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      financing: "cash",
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({
      budget: "200k",
      timeline: "soon",
      location: "Limassol",
      financing: "cash",
    });
  });

  it("clears one fact when the patch value is null", async () => {
    const lead = makeLead({
      qualification_facts: { budget: "200k", timeline: "soon" },
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      timeline: null,
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({ budget: "200k" });
  });

  it("clears one fact when the patch value is blank", async () => {
    const lead = makeLead({
      qualification_facts: { budget: "200k", timeline: "soon" },
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      timeline: "   ",
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({ budget: "200k" });
  });

  it("clears all facts when all six keys are null", async () => {
    const lead = makeLead({
      qualification_facts: {
        budget: "1",
        timeline: "2",
        location: "3",
        property_type: "4",
        financing: "5",
        decision_maker: "6",
      },
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: null,
      timeline: null,
      location: null,
      property_type: null,
      financing: null,
      decision_maker: null,
    });

    expect(updateCapture.patch?.qualification_facts).toEqual({});
  });

  it("updates qualification_updated_at when facts change", async () => {
    const lead = makeLead({
      qualification_facts: { budget: "100k" },
      qualification_updated_at: "2026-08-19T00:00:00Z",
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    const result = await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
    });

    expect(updateCapture.patch).toEqual({
      qualification_facts: { budget: "200k" },
      qualification_updated_at: expect.any(String),
    });
    expect(updateCapture.patch?.qualification_updated_at).not.toBe(
      "2026-08-19T00:00:00Z"
    );
    expect(result.qualification_updated_at).not.toBe("2026-08-19T00:00:00Z");
    expect(updateCapture.eq).toEqual([
      ["id", LEAD_1],
      ["organization_id", ORG_A],
    ]);
  });

  it("does not update qualification_updated_at on a no-op write", async () => {
    const lead = makeLead({
      qualification_facts: { budget: "200k" },
      qualification_updated_at: "2026-08-19T00:00:00Z",
    });
    vi.mocked(getLead).mockResolvedValue(lead);

    const result = await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: " 200k ",
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(result).toBe(lead);
    expect(result.qualification_updated_at).toBe("2026-08-19T00:00:00Z");
  });

  it("never modifies leads.status", async () => {
    const lead = makeLead({ status: "contacted" });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    const result = await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
    });

    expect(updateCapture.patch).not.toHaveProperty("status");
    expect(result.status).toBe("contacted");
  });

  it("never modifies score, notes, owner, source, or contact fields", async () => {
    const lead = makeLead({
      owner_id: USER_1,
      first_name: "Ahmed",
      last_name: "Ali",
      email: "ahmed@example.com",
      phone: "+974",
      company_name: "Acme",
      source: "website",
      status: "qualified",
      score: 80,
      notes: "human notes",
    });
    vi.mocked(getLead).mockResolvedValue(lead);
    mockUpdate(lead);

    const result = await applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, {
      budget: "200k",
    });

    expect(Object.keys(updateCapture.patch ?? {}).sort()).toEqual([
      "qualification_facts",
      "qualification_updated_at",
    ]);
    expect(result.score).toBe(80);
    expect(result.notes).toBe("human notes");
    expect(result.owner_id).toBe(USER_1);
    expect(result.source).toBe("website");
    expect(result.email).toBe("ahmed@example.com");
    expect(result.phone).toBe("+974");
    expect(result.company_name).toBe("Acme");
    expect(result.first_name).toBe("Ahmed");
    expect(result.last_name).toBe("Ali");
    expect(result.status).toBe("qualified");
  });

  it("cannot write a lead from another organization", async () => {
    vi.mocked(getLead).mockRejectedValue(new NotFoundError("Lead"));

    await expect(
      applyOperatorQualificationFacts(ORG_B, USER_1, LEAD_1, { budget: "200k" })
    ).rejects.toThrow(NotFoundError);

    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("propagates tenant access errors", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());

    await expect(
      applyOperatorQualificationFacts(ORG_A, USER_1, LEAD_1, { budget: "200k" })
    ).rejects.toThrow(TenantAccessError);

    expect(getLead).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
