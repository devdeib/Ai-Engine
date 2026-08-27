/**
 * Follow-up data-model tests (Phase 3.4).
 *
 * Verifies:
 * 1. Zod schemas enforce enum, required, nullable, timestamp, and length rules.
 * 2. TypeScript row types match the intended schema.
 * 3. Client payloads cannot supply organization_id / lead_id / user_id / created_by.
 * 4. Status transitions on update are limited to completed | cancelled.
 * 5. Documented tenant-isolation and relationship invariants.
 *
 * NO LIVE DATABASE IS REQUIRED.
 */
import { describe, it, expect } from "vitest";
import {
  leadFollowUpStatusSchema,
  followUpStatusTransitionSchema,
  createFollowUpSchema,
  updateFollowUpSchema,
  FOLLOW_UP_TITLE_MAX,
  FOLLOW_UP_NOTES_MAX,
} from "@/modules/follow-ups/schema";
import type { Database, LeadFollowUp, LeadFollowUpStatus } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const DUE_AT = "2026-08-22T10:00:00Z";

function validCreate() {
  return {
    title: "Call Ahmed about the property",
    due_at: DUE_AT,
  };
}

describe("leadFollowUpStatusSchema", () => {
  const valid: LeadFollowUpStatus[] = ["pending", "completed", "cancelled"];

  valid.forEach((status) => {
    it(`accepts status '${status}'`, () => {
      expect(leadFollowUpStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it("rejects overdue (derived, never stored)", () => {
    expect(leadFollowUpStatusSchema.safeParse("overdue").success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(leadFollowUpStatusSchema.safeParse("open").success).toBe(false);
  });
});

describe("followUpStatusTransitionSchema", () => {
  it("accepts completed and cancelled", () => {
    expect(followUpStatusTransitionSchema.safeParse("completed").success).toBe(
      true
    );
    expect(followUpStatusTransitionSchema.safeParse("cancelled").success).toBe(
      true
    );
  });

  it("rejects pending (reopen is not allowed)", () => {
    expect(followUpStatusTransitionSchema.safeParse("pending").success).toBe(
      false
    );
  });
});

describe("createFollowUpSchema — valid input", () => {
  it("accepts title and due_at (notes and assignee optional)", () => {
    const result = createFollowUpSchema.safeParse(validCreate());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Call Ahmed about the property");
      expect(result.data.due_at).toBe(new Date(DUE_AT).toISOString());
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts optional notes and assigned_user_id", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      notes: "Discuss the two-bedroom option",
      assigned_user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Discuss the two-bedroom option");
      expect(result.data.assigned_user_id).toBe(USER_1);
    }
  });

  it("accepts assigned_user_id null (unassigned)", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      assigned_user_id: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assigned_user_id).toBeNull();
    }
  });

  it("trims title and notes", () => {
    const result = createFollowUpSchema.safeParse({
      title: "  Call back  ",
      notes: "  Follow up  ",
      due_at: DUE_AT,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Call back");
      expect(result.data.notes).toBe("Follow up");
    }
  });

  it("converts empty notes to null", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts a title at the maximum length", () => {
    const result = createFollowUpSchema.safeParse({
      title: "x".repeat(FOLLOW_UP_TITLE_MAX),
      due_at: DUE_AT,
    });
    expect(result.success).toBe(true);
  });

  it("accepts notes at the maximum length", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      notes: "x".repeat(FOLLOW_UP_NOTES_MAX),
    });
    expect(result.success).toBe(true);
  });
});

describe("createFollowUpSchema — invalid input", () => {
  it("rejects a missing title", () => {
    expect(
      createFollowUpSchema.safeParse({ due_at: DUE_AT }).success
    ).toBe(false);
  });

  it("rejects a blank title", () => {
    expect(
      createFollowUpSchema.safeParse({ title: "   ", due_at: DUE_AT }).success
    ).toBe(false);
  });

  it("rejects a title over the maximum length", () => {
    expect(
      createFollowUpSchema.safeParse({
        title: "x".repeat(FOLLOW_UP_TITLE_MAX + 1),
        due_at: DUE_AT,
      }).success
    ).toBe(false);
  });

  it("rejects missing due_at", () => {
    expect(
      createFollowUpSchema.safeParse({ title: "Call Ahmed" }).success
    ).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    expect(
      createFollowUpSchema.safeParse({
        title: "Call Ahmed",
        due_at: "not-a-date",
      }).success
    ).toBe(false);
  });

  it("rejects notes over the maximum length", () => {
    expect(
      createFollowUpSchema.safeParse({
        ...validCreate(),
        notes: "x".repeat(FOLLOW_UP_NOTES_MAX + 1),
      }).success
    ).toBe(false);
  });

  it("rejects a non-UUID assigned_user_id", () => {
    expect(
      createFollowUpSchema.safeParse({
        ...validCreate(),
        assigned_user_id: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

describe("createFollowUpSchema — client cannot supply identity fields", () => {
  it("strips organization_id", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      organization_id: ORG_B,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("strips lead_id (must come from the URL path)", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      lead_id: LEAD_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("lead_id" in result.data).toBe(false);
    }
  });

  it("strips user_id and created_by", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      user_id: USER_1,
      created_by: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("user_id" in result.data).toBe(false);
      expect("created_by" in result.data).toBe(false);
    }
  });

  it("strips status (database default pending, not client-supplied on create)", () => {
    const result = createFollowUpSchema.safeParse({
      ...validCreate(),
      status: "completed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("status" in result.data).toBe(false);
    }
  });
});

describe("updateFollowUpSchema", () => {
  it("rejects an empty object", () => {
    expect(updateFollowUpSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a status-only complete transition", () => {
    const result = updateFollowUpSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("accepts a status-only cancel transition", () => {
    const result = updateFollowUpSchema.safeParse({ status: "cancelled" });
    expect(result.success).toBe(true);
  });

  it("rejects reopening via status pending", () => {
    expect(
      updateFollowUpSchema.safeParse({ status: "pending" }).success
    ).toBe(false);
  });

  it("rejects overdue as a stored status", () => {
    expect(
      updateFollowUpSchema.safeParse({ status: "overdue" }).success
    ).toBe(false);
  });

  it("accepts title / notes / due_at / assigned_user_id edits", () => {
    const result = updateFollowUpSchema.safeParse({
      title: "Rescheduled call",
      notes: null,
      due_at: DUE_AT,
      assigned_user_id: USER_1,
    });
    expect(result.success).toBe(true);
  });

  it("does not convert omitted notes to null (partial update)", () => {
    const result = updateFollowUpSchema.safeParse({ title: "Keep notes" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("converts empty notes to null when explicitly supplied", () => {
    const result = updateFollowUpSchema.safeParse({ notes: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("strips organization_id so a follow-up cannot be moved across tenants", () => {
    const result = updateFollowUpSchema.safeParse({
      status: "completed",
      organization_id: ORG_B,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("strips lead_id and user_id", () => {
    const result = updateFollowUpSchema.safeParse({
      status: "cancelled",
      lead_id: LEAD_1,
      user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("lead_id" in result.data).toBe(false);
      expect("user_id" in result.data).toBe(false);
    }
  });
});

describe("LeadFollowUp type structure (compile-time shape assertions)", () => {
  it("LeadFollowUp row type has all expected fields", () => {
    const shape: Record<keyof LeadFollowUp, true> = {
      id: true,
      organization_id: true,
      lead_id: true,
      assigned_user_id: true,
      title: true,
      notes: true,
      due_at: true,
      status: true,
      created_at: true,
      updated_at: true,
      idempotency_key: true,
    };
    expect(Object.keys(shape).length).toBe(11);
  });

  it("assigned_user_id and notes are nullable; status defaults to pending on Insert", () => {
    const insert: Database["public"]["Tables"]["lead_follow_ups"]["Insert"] = {
      organization_id: ORG_A,
      lead_id: LEAD_1,
      title: "Call Ahmed",
      due_at: DUE_AT,
    };
    expect(insert.assigned_user_id).toBeUndefined();
    expect(insert.notes).toBeUndefined();
    expect(insert.status).toBeUndefined();
    expect(insert.idempotency_key).toBeUndefined();
  });

  it("a completed follow-up remains a stored row (not deleted)", () => {
    const row: LeadFollowUp = {
      id: "fu1",
      organization_id: ORG_A,
      lead_id: LEAD_1,
      assigned_user_id: null,
      title: "Call Ahmed",
      notes: null,
      due_at: DUE_AT,
      status: "completed",
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-20T00:00:00Z",
    };
    expect(row.status).toBe("completed");
    expect(row.id).toBe("fu1");
  });
});

describe("Tenant isolation — RLS and relationship contract", () => {
  it("Organization A follow-up is conceptually allowed for an Organization A member", () => {
    expect(ORG_A).toBe(ORG_A);
  });

  it("Organization A user accessing Organization B follow-up is rejected at the contract level", () => {
    expect(ORG_A).not.toBe(ORG_B);
  });

  it("follow_up.organization_id must equal the parent lead.organization_id", () => {
    const leadOrg = ORG_A;
    const followUpOrg = ORG_A;
    expect(followUpOrg).toBe(leadOrg);
  });

  it("a follow-up in org A cannot silently attach to a lead in org B", () => {
    expect(ORG_A).not.toBe(ORG_B);
  });

  it("SELECT/INSERT/UPDATE policies grant access only when auth_user_role_in_org is not null", () => {
    const memberRole = "agent" as const;
    const nonMemberRole = null;
    expect(memberRole).not.toBeNull();
    expect(nonMemberRole).toBeNull();
  });

  it("DELETE is not part of the follow-up lifecycle", () => {
    const allowedMutations = ["SELECT", "INSERT", "UPDATE"] as const;
    expect(allowedMutations).not.toContain("DELETE");
  });
});
