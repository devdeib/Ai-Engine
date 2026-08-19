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
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

// We mock the Supabase server client so these tests run without a DB.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership, requireOrgRole } from "@/modules/organizations/queries";

// Typed mock helper
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

describe("requireOrgMembership — tenant isolation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the member record when the user IS a member", async () => {
    const memberRow = {
      id: "member-id",
      organization_id: "org-A",
      user_id: "user-1",
      role: "owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invited_by: null,
    };
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

  it("throws TenantAccessError when DB returns an error", async () => {
    mockSupabaseClient(null);
    await expect(requireOrgMembership("org-B", "user-1")).rejects.toThrow(
      TenantAccessError
    );
  });

  it("does not leak org-A access when requesting org-B", async () => {
    // user-1 is a member of org-A but requests org-B
    mockSupabaseClient(null); // no membership row for org-B

    let threw: unknown;
    try {
      await requireOrgMembership("org-B", "user-1");
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(TenantAccessError);
  });
});

describe("requireOrgRole — role enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns member when role matches required roles", async () => {
    const memberRow = {
      id: "m",
      organization_id: "org-A",
      user_id: "user-1",
      role: "admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invited_by: null,
    };
    mockSupabaseClient(memberRow);

    const result = await requireOrgRole("org-A", "user-1", ["owner", "admin"]);
    expect(result.role).toBe("admin");
  });

  it("throws TenantAccessError when user role is insufficient", async () => {
    const memberRow = {
      id: "m",
      organization_id: "org-A",
      user_id: "user-1",
      role: "agent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invited_by: null,
    };
    mockSupabaseClient(memberRow);

    await expect(
      requireOrgRole("org-A", "user-1", ["owner", "admin"])
    ).rejects.toThrow(TenantAccessError);
  });

  it("does not allow 'agent' to perform owner-only operations", async () => {
    const memberRow = {
      id: "m",
      organization_id: "org-A",
      user_id: "agent-user",
      role: "agent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invited_by: null,
    };
    mockSupabaseClient(memberRow);

    await expect(
      requireOrgRole("org-A", "agent-user", ["owner"])
    ).rejects.toThrow(TenantAccessError);
  });
});
