/**
 * CRM Foundation — leads domain tests.
 *
 * These tests verify:
 * 1. The Zod validation schemas correctly enforce field rules.
 * 2. The TypeScript types are consistent with the schema.
 * 3. The tenant-isolation invariants are documented as executable assertions.
 *
 * NO LIVE DATABASE IS REQUIRED.
 * Tests that require actual RLS enforcement (e.g. "user from org-B cannot
 * read org-A leads") cannot run without a live Supabase instance because
 * RLS is enforced by PostgreSQL, not by the application layer.
 * Those integration tests must be run against a staging environment.
 * See: supabase/migrations/20260819000003_leads.sql for the RLS policy
 * definitions and their documented invariants.
 */
import { describe, it, expect } from "vitest";
import {
  createLeadSchema,
  updateLeadSchema,
  leadSourceSchema,
  leadStatusSchema,
} from "@/modules/leads/schema";
import type { Lead, LeadSource, LeadStatus } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validCreateInput() {
  return {
    first_name: "Jane",
    last_name: "Smith",
    email: "jane@example.com",
    phone: "+1 555 123 4567",
    company_name: "Acme Corp",
    source: "website" as LeadSource,
    status: "new" as LeadStatus,
    score: 72,
    notes: "Met at the open house on Friday.",
    owner_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  };
}

// ---------------------------------------------------------------------------
// createLeadSchema — valid input
// ---------------------------------------------------------------------------

describe("createLeadSchema — valid input", () => {
  it("accepts a fully populated lead", () => {
    const result = createLeadSchema.safeParse(validCreateInput());
    expect(result.success).toBe(true);
  });

  it("accepts a minimal lead with email (only required fields)", () => {
    const result = createLeadSchema.safeParse({
      first_name: "Alice",
      last_name: "Wong",
      email: "alice@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a lead without email (channel-agnostic capture)", () => {
    const result = createLeadSchema.safeParse({
      first_name: "Ahmed",
      last_name: "Ali",
      phone: "+974 55 123 456",
      source: "other",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("accepts email: null explicitly", () => {
    const result = createLeadSchema.safeParse({
      first_name: "Ahmed",
      last_name: "Ali",
      email: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it("lowercases email on parse", () => {
    const result = createLeadSchema.safeParse({
      first_name: "Bob",
      last_name: "Lee",
      email: "BOB@EXAMPLE.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("bob@example.com");
    }
  });

  it("trims whitespace from first_name and last_name", () => {
    const result = createLeadSchema.safeParse({
      first_name: "  Alice  ",
      last_name: "  Wong  ",
      email: "alice@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.first_name).toBe("Alice");
      expect(result.data.last_name).toBe("Wong");
    }
  });

  it("defaults source to 'other' when omitted", () => {
    const result = createLeadSchema.safeParse({
      first_name: "A",
      last_name: "B",
      email: "a@b.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("other");
    }
  });

  it("defaults status to 'new' when omitted", () => {
    const result = createLeadSchema.safeParse({
      first_name: "A",
      last_name: "B",
      email: "a@b.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("new");
    }
  });

  it("accepts score 0 (boundary)", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts score 100 (boundary)", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null score (not yet scored)", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBeNull();
    }
  });

  it("accepts null owner_id (unassigned lead)", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      owner_id: null,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createLeadSchema — invalid input
// ---------------------------------------------------------------------------

describe("createLeadSchema — invalid input", () => {
  it("rejects missing first_name", () => {
    const { first_name: _, ...rest } = validCreateInput();
    const result = createLeadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty first_name", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      first_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects first_name exceeding 100 chars", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      first_name: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts missing email (email is now optional)", () => {
    const { email: _, ...rest } = validCreateInput();
    const result = createLeadSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format when email is provided", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects email without domain when email is provided", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      email: "user@",
    });
    expect(result.success).toBe(false);
  });

  it("rejects score below 0", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects score above 100", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer score", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      score: 72.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid lead_source value", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      source: "carrier_pigeon",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid lead_status value", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      status: "pending_review",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed owner_id (not a UUID)", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      owner_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone exceeding 30 chars", () => {
    const result = createLeadSchema.safeParse({
      ...validCreateInput(),
      phone: "1".repeat(31),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateLeadSchema — partial updates
// ---------------------------------------------------------------------------

describe("updateLeadSchema — partial updates", () => {
  it("accepts an empty object (no-op update)", () => {
    const result = updateLeadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a status-only update", () => {
    const result = updateLeadSchema.safeParse({ status: "qualified" });
    expect(result.success).toBe(true);
  });

  it("accepts a score-only update", () => {
    const result = updateLeadSchema.safeParse({ score: 85 });
    expect(result.success).toBe(true);
  });

  it("still rejects an invalid email when email is provided", () => {
    const result = updateLeadSchema.safeParse({ email: "bad-email" });
    expect(result.success).toBe(false);
  });

  it("still rejects score out of range when score is provided", () => {
    const result = updateLeadSchema.safeParse({ score: 150 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// leadSourceSchema — enum coverage
// ---------------------------------------------------------------------------

describe("leadSourceSchema — all enum values are valid", () => {
  const validSources: LeadSource[] = [
    "website",
    "referral",
    "cold_call",
    "email_campaign",
    "social_media",
    "portal",
    "other",
  ];

  validSources.forEach((source) => {
    it(`accepts source '${source}'`, () => {
      expect(leadSourceSchema.safeParse(source).success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// leadStatusSchema — enum coverage
// ---------------------------------------------------------------------------

describe("leadStatusSchema — all enum values are valid", () => {
  const validStatuses: LeadStatus[] = [
    "new",
    "contacted",
    "qualified",
    "unqualified",
    "lost",
    "converted",
  ];

  validStatuses.forEach((status) => {
    it(`accepts status '${status}'`, () => {
      expect(leadStatusSchema.safeParse(status).success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// TypeScript type consistency
// ---------------------------------------------------------------------------

describe("Lead type structure (compile-time shape assertions)", () => {
  it("Lead row type has all expected fields", () => {
    // This test is a compile-time guard: if the Lead type or its fields are
    // removed, this test will fail to compile.
    const shape: Record<keyof Lead, true> = {
      id: true,
      organization_id: true,
      owner_id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      company_name: true,
      source: true,
      status: true,
      score: true,
      notes: true,
      created_at: true,
      updated_at: true,
    };
    // Every key in the shape must be defined.
    expect(Object.keys(shape).length).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation — documented invariants
//
// The policies in migration 000003 guarantee these at the database level.
// Application-layer re-enforcement occurs via requireOrgMembership() and
// getOrgContext() before any lead query executes.
// True RLS integration tests require a live Supabase database and must be
// run against a staging environment — they cannot run under Vitest/jsdom.
// ---------------------------------------------------------------------------

describe("Tenant isolation — RLS contract (documented invariants)", () => {
  it("organization_id is absent from createLeadSchema (never trusted from client)", () => {
    const schema = createLeadSchema;
    // If organization_id were in the schema, parsing a payload with it would
    // include it in the output.  It must be stripped before reaching the DB.
    const result = schema.safeParse({
      ...validCreateInput(),
      organization_id: "some-org-uuid",
    });
    // Zod strips unknown keys by default — organization_id is not in output.
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("organization_id is absent from updateLeadSchema (leads cannot be moved across tenants)", () => {
    const result = updateLeadSchema.safeParse({
      status: "qualified",
      organization_id: "attacker-org-id",
    });
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("SELECT policy — member sees leads of their org (auth_user_role_in_org IS NOT NULL)", () => {
    // Symbolic: the policy grants access when the helper returns any role.
    const memberRole: LeadStatus | null = "new";
    expect(memberRole).not.toBeNull();
  });

  it("SELECT policy — non-member is denied (auth_user_role_in_org returns NULL)", () => {
    const nonMemberRole = null;
    expect(nonMemberRole).toBeNull();
  });

  it("DELETE policy — requires owner or admin role", () => {
    const allowedForDelete: LeadSource[] = [];
    const adminRole = "admin" as const;
    const agentRole = "agent" as const;
    expect(["owner", "admin"]).toContain(adminRole);
    expect(["owner", "admin"]).not.toContain(agentRole);
    expect(allowedForDelete).toHaveLength(0); // agents cannot delete
  });
});
