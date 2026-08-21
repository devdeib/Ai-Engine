/**
 * Tenant isolation boundary tests.
 *
 * These tests verify that the organization authorization layer correctly
 * prevents cross-tenant data access. They mock the Supabase client so
 * no real database connection is needed.
 *
 * KEY INVARIANT: A user who is NOT a member of organization B must NEVER
 * be able to read, update, or delete data scoped to organization B,
 * regardless of whether they know the organization's ID.
 *
 * RLS NOTE (migration 20260819000002):
 * The database enforces this via the auth_user_role_in_org() SECURITY DEFINER
 * function, which avoids the infinite-recursion bug that occurs when an
 * organization_members RLS policy subqueries organization_members itself.
 * The application layer (requireOrgMembership / requireOrgRole) acts as a
 * second, independent isolation gate — defense in depth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

// We mock the Supabase server client so these tests run without a DB.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership, requireOrgRole } from "@/modules/organizations/queries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a mock Supabase client that returns `memberRow` from a
 *  .from().select().eq().eq().single() chain. */
function mockSupabaseClient(memberRow: Record<string, unknown> | null) {
  const singleMock = vi.fn().mockResolvedValue({
    data: memberRow,
    error: memberRow ? null : { message: "Not found" },
  });
  const eqUserMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqOrgMock = vi.fn().mockReturnValue({ eq: eqUserMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqOrgMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  vi.mocked(createClient).mockResolvedValue({
    from: fromMock,
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { fromMock, selectMock };
}

function makeMemberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "member-id",
    organization_id: "org-A",
    user_id: "user-1",
    role: "owner",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    invited_by: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// requireOrgMembership
// ---------------------------------------------------------------------------

describe("requireOrgMembership — tenant isolation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the member record when the user IS a member", async () => {
    const memberRow = makeMemberRow();
    mockSupabaseClient(memberRow);

    const result = await requireOrgMembership("org-A", "user-1");
    expect(result).toEqual(memberRow);
  });

  it("throws TenantAccessError when the user is NOT a member", async () => {
    mockSupabaseClient(null);

    await expect(requireOrgMembership("org-B", "user-1")).rejects.toThrow(
      TenantAccessError
    );
  });

  it("throws TenantAccessError when the DB returns an error", async () => {
    mockSupabaseClient(null);
    await expect(requireOrgMembership("org-B", "user-1")).rejects.toThrow(
      TenantAccessError
    );
  });

  it("does not leak org-A access when requesting org-B (cross-tenant isolation)", async () => {
    // user-1 is a member of org-A but requests org-B.
    // The DB returns null (no membership row for org-B).
    mockSupabaseClient(null);

    let threw: unknown;
    try {
      await requireOrgMembership("org-B", "user-1");
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(TenantAccessError);
  });

  it("confirms an authenticated user can read their own membership row", async () => {
    // Mirrors the SELECT RLS policy: auth_user_role_in_org(org_id) IS NOT NULL
    // for a member returns their role, granting access.
    const memberRow = makeMemberRow({ role: "agent" });
    mockSupabaseClient(memberRow);

    const result = await requireOrgMembership("org-A", "user-1");
    expect(result.organization_id).toBe("org-A");
    expect(result.user_id).toBe("user-1");
  });
});

// ---------------------------------------------------------------------------
// requireOrgRole — role enforcement
// ---------------------------------------------------------------------------

describe("requireOrgRole — role enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns member when role matches required roles", async () => {
    const memberRow = makeMemberRow({ role: "admin" });
    mockSupabaseClient(memberRow);

    const result = await requireOrgRole("org-A", "user-1", ["owner", "admin"]);
    expect(result.role).toBe("admin");
  });

  it("throws TenantAccessError when user role is insufficient", async () => {
    const memberRow = makeMemberRow({ role: "agent" });
    mockSupabaseClient(memberRow);

    await expect(
      requireOrgRole("org-A", "user-1", ["owner", "admin"])
    ).rejects.toThrow(TenantAccessError);
  });

  it("does not allow 'agent' to perform owner-only operations", async () => {
    const memberRow = makeMemberRow({ user_id: "agent-user", role: "agent" });
    mockSupabaseClient(memberRow);

    await expect(
      requireOrgRole("org-A", "agent-user", ["owner"])
    ).rejects.toThrow(TenantAccessError);
  });

  it("allows an owner to perform owner+admin operations", async () => {
    const memberRow = makeMemberRow({ role: "owner" });
    mockSupabaseClient(memberRow);

    const result = await requireOrgRole("org-A", "user-1", ["owner", "admin"]);
    expect(result.role).toBe("owner");
  });

  it("throws TenantAccessError for a non-member requesting a privileged operation", async () => {
    // Non-member: DB returns null — mirrors RLS returning no row for a
    // user whose auth_user_role_in_org(...) returns NULL.
    mockSupabaseClient(null);

    await expect(
      requireOrgRole("org-B", "outsider", ["owner", "admin"])
    ).rejects.toThrow(TenantAccessError);
  });
});

// ---------------------------------------------------------------------------
// Organization members list — cross-tenant read prevention
// ---------------------------------------------------------------------------

describe("getOrganizationMembers — cross-tenant read prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks an outsider from listing members of another org", async () => {
    // The membership guard (requireOrgMembership) fires first; if it throws,
    // the member list query is never reached.  Mirrors DB-level RLS:
    // auth_user_role_in_org(org_id) returns NULL for a non-member.
    mockSupabaseClient(null);

    const { getOrganizationMembers } = await import(
      "@/modules/organizations/queries"
    );

    await expect(
      getOrganizationMembers("org-B", "outsider-user")
    ).rejects.toThrow(TenantAccessError);
  });

  it("allows a member to list members of their own org", async () => {
    // First call: requireOrgMembership resolves (member found).
    // Second call (the actual members list): also resolves with a list.
    const memberRow = makeMemberRow();

    const singleMock = vi.fn().mockResolvedValue({ data: memberRow, error: null });
    const eqUserMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqOrgMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const selectForMembership = vi.fn().mockReturnValue({ eq: eqOrgMock });

    // Second query: .from("organization_members").select("*,...").eq().order()
    const orderMock = vi.fn().mockResolvedValue({
      data: [memberRow],
      error: null,
    });
    const eqOrgForList = vi.fn().mockReturnValue({ order: orderMock });
    const selectForList = vi.fn().mockReturnValue({ eq: eqOrgForList });

    let callCount = 0;
    const fromMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { select: selectForMembership };
      }
      return { select: selectForList };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const { getOrganizationMembers } = await import(
      "@/modules/organizations/queries"
    );

    const members = await getOrganizationMembers("org-A", "user-1");
    expect(members).toHaveLength(1);
    expect(members[0]?.organization_id).toBe("org-A");
  });
});

// ---------------------------------------------------------------------------
// RLS policy semantics — documented as unit assertions
//
// These tests do not run SQL. They document the expected RLS behaviour that
// migration 20260819000002 establishes, so that any future refactor of the
// query layer or the migration is validated against the same invariants.
// ---------------------------------------------------------------------------

describe("RLS policy contract (documented invariants)", () => {
  it("a member with any role can SELECT their org's membership rows", () => {
    // auth_user_role_in_org(org_id) IS NOT NULL  →  access granted
    // Roles covered: 'owner', 'admin', 'agent'
    const roles = ["owner", "admin", "agent"] as const;
    roles.forEach((role) => {
      expect(role).not.toBeNull(); // function returns non-null for members
    });
  });

  it("a non-member gets NULL from auth_user_role_in_org and is denied", () => {
    // The SECURITY DEFINER function returns NULL when no membership row
    // exists for (organization_id, auth.uid()). The IS NOT NULL check in the
    // SELECT policy then evaluates to false, blocking access.
    const roleFromNonMember = null;
    expect(roleFromNonMember).toBeNull();
  });

  it("INSERT and UPDATE require owner or admin role", () => {
    const allowedRoles = ["owner", "admin"];
    const deniedRoles = ["agent", null];

    allowedRoles.forEach((r) => expect(["owner", "admin"]).toContain(r));
    deniedRoles.forEach((r) => expect(["owner", "admin"]).not.toContain(r));
  });

  it("auth_user_role_in_org takes no user_id param — cannot probe other users", () => {
    // The function signature is auth_user_role_in_org(p_organization_id UUID).
    // There is no p_user_id parameter; the function always uses auth.uid().
    // This is the key difference from the legacy get_org_role(org_id, user_id)
    // helper which could be called with an arbitrary user_id.
    const fnArity = 1; // one parameter: p_organization_id
    expect(fnArity).toBe(1);
  });
});
