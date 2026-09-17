/**
 * PATCH /api/v1/organizations/:organizationId/leads/:leadId/qualification-facts
 *
 * HTTP boundary tests. Domain writer is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { Lead, OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";
import { QUALIFICATION_FACT_VALUE_MAX } from "@/modules/leads/qualification";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/leads/qualification-write", () => ({
  applyOperatorQualificationFacts: vi.fn(),
  applyRecordedCustomerFacts: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { applyOperatorQualificationFacts } from "@/modules/leads/qualification-write";
import { PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INVALID_UUID = "not-a-uuid";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads/${LEAD_1}/qualification-facts`;

const mockUser = { id: USER_1, email: "user@example.com" } as unknown as User;

const mockMember: OrganizationMember = {
  id: "ffffffff-0000-4000-8000-000000000001",
  organization_id: ORG_A,
  user_id: USER_1,
  role: "owner",
  invited_by: null,
  created_at: "2026-08-19T00:00:00Z",
  updated_at: "2026-08-19T00:00:00Z",
};

const mockOrgContext = {
  user: mockUser,
  member: mockMember,
  organizationId: ORG_A,
};

function makeLeadRow(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: "+974 55 123 456",
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

function makePatchRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId: string = ORG_A, leadId: string = LEAD_1) {
  return { params: Promise.resolve({ organizationId, leadId }) };
}

describe("PATCH qualification-facts — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { budget: "200k" } }),
      makeContext()
    );

    expect(res.status).toBe(401);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { budget: "200k" } }),
      makeContext()
    );

    expect(res.status).toBe(403);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });
});

describe("PATCH qualification-facts — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the organizationId is not a valid UUID", async () => {
    const res = await PATCH(
      makePatchRequest(
        `/api/v1/organizations/${INVALID_UUID}/leads/${LEAD_1}/qualification-facts`,
        { facts: { budget: "200k" } }
      ),
      makeContext(INVALID_UUID, LEAD_1)
    );

    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 422 when the leadId is not a valid UUID", async () => {
    const res = await PATCH(
      makePatchRequest(
        `/api/v1/organizations/${ORG_A}/leads/${INVALID_UUID}/qualification-facts`,
        { facts: { budget: "200k" } }
      ),
      makeContext(ORG_A, INVALID_UUID)
    );

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });
});

describe("PATCH qualification-facts — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when facts is missing", async () => {
    const res = await PATCH(makePatchRequest(BASE_PATH, {}), makeContext());

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 422 when facts is empty", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: {} }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 422 for an unknown fact key", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { wealth: "high" } }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 422 for an unknown top-level key", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, {
        facts: { budget: "200k" },
        status: "qualified",
      }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });

  it("returns 422 for an overlong value", async () => {
    const res = await PATCH(
      makePatchRequest(BASE_PATH, {
        facts: { budget: "x".repeat(QUALIFICATION_FACT_VALUE_MAX + 1) },
      }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(applyOperatorQualificationFacts).not.toHaveBeenCalled();
  });
});

describe("PATCH qualification-facts — success and tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the saved lead", async () => {
    const saved = makeLeadRow({
      qualification_facts: { budget: "200k", timeline: "soon" },
      qualification_updated_at: "2026-09-13T18:00:00Z",
    });
    vi.mocked(applyOperatorQualificationFacts).mockResolvedValue(saved);

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { budget: "200k" } }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(LEAD_1);
    expect(body.data.qualification_facts).toEqual({
      budget: "200k",
      timeline: "soon",
    });
    expect(body.data.status).toBe("new");
    expect(body.data).not.toHaveProperty("qualificationStatus");
    expect(applyOperatorQualificationFacts).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_1,
      { budget: "200k" }
    );
  });

  it("passes whitespace values through for the writer to clear", async () => {
    vi.mocked(applyOperatorQualificationFacts).mockResolvedValue(makeLeadRow());

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { timeline: "   " } }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(applyOperatorQualificationFacts).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_1,
      { timeline: "   " }
    );
  });

  it("returns 404 when the lead does not exist in the organization", async () => {
    vi.mocked(applyOperatorQualificationFacts).mockRejectedValue(
      new NotFoundError("Lead")
    );

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { budget: "200k" } }),
      makeContext(ORG_B, LEAD_1)
    );

    expect(res.status).toBe(404);
  });

  it("returns preserved facts from a partial patch", async () => {
    vi.mocked(applyOperatorQualificationFacts).mockResolvedValue(
      makeLeadRow({
        qualification_facts: {
          budget: "200k",
          timeline: "soon",
          location: "Limassol",
        },
      })
    );

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { location: "Limassol" } }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.qualification_facts).toEqual({
      budget: "200k",
      timeline: "soon",
      location: "Limassol",
    });
    expect(applyOperatorQualificationFacts).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_1,
      { location: "Limassol" }
    );
  });

  it("leaves pipeline status unchanged", async () => {
    vi.mocked(applyOperatorQualificationFacts).mockResolvedValue(
      makeLeadRow({
        status: "contacted",
        qualification_facts: { budget: "200k" },
      })
    );

    const res = await PATCH(
      makePatchRequest(BASE_PATH, { facts: { budget: "200k" } }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("contacted");
  });
});
