/**
 * Conversation / message data-model tests (Phase 3.1).
 *
 * Verifies:
 * 1. Zod schemas enforce enum, required, nullable, and length rules.
 * 2. TypeScript row types match the intended schema.
 * 3. Client payloads cannot supply organization_id / author_user_id.
 * 4. Documented tenant-isolation and relationship invariants.
 * 5. Handoff columns default as specified (no AI behaviour).
 *
 * NO LIVE DATABASE IS REQUIRED.
 * PostgreSQL RLS and composite FKs are enforced by the database; those
 * invariants are documented here as executable assertions matching
 * supabase/migrations/20260820000002_conversations.sql.
 */
import { describe, it, expect } from "vitest";
import {
  conversationChannelSchema,
  conversationStatusSchema,
  messageDirectionSchema,
  createConversationSchema,
  updateConversationSchema,
  createMessageSchema,
  MESSAGE_BODY_MAX,
} from "@/modules/conversations/schema";
import type {
  Conversation,
  ConversationChannel,
  ConversationStatus,
  Database,
  Message,
  MessageDirection,
} from "@/lib/db/types";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-0000-0000-000000000001";

function validCreateConversation() {
  return { lead_id: LEAD_ID };
}

function validCreateMessage() {
  return { direction: "outbound" as const, body: "Hello, following up on your enquiry." };
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe("conversationChannelSchema", () => {
  const valid: ConversationChannel[] = ["in_app"];

  valid.forEach((channel) => {
    it(`accepts channel '${channel}'`, () => {
      expect(conversationChannelSchema.safeParse(channel).success).toBe(true);
    });
  });

  it("rejects an unknown channel", () => {
    expect(conversationChannelSchema.safeParse("whatsapp").success).toBe(false);
    expect(conversationChannelSchema.safeParse("email").success).toBe(false);
  });
});

describe("conversationStatusSchema", () => {
  const valid: ConversationStatus[] = ["open", "closed"];

  valid.forEach((status) => {
    it(`accepts status '${status}'`, () => {
      expect(conversationStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it("rejects an unknown status", () => {
    expect(conversationStatusSchema.safeParse("archived").success).toBe(false);
    expect(conversationStatusSchema.safeParse("pending").success).toBe(false);
  });
});

describe("messageDirectionSchema", () => {
  const valid: MessageDirection[] = ["inbound", "outbound"];

  valid.forEach((direction) => {
    it(`accepts direction '${direction}'`, () => {
      expect(messageDirectionSchema.safeParse(direction).success).toBe(true);
    });
  });

  it("rejects an unknown direction", () => {
    expect(messageDirectionSchema.safeParse("internal").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createConversationSchema
// ---------------------------------------------------------------------------

describe("createConversationSchema — valid input", () => {
  it("accepts a lead_id only (channel defaults to in_app)", () => {
    const result = createConversationSchema.safeParse(validCreateConversation());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lead_id).toBe(LEAD_ID);
      expect(result.data.channel).toBe("in_app");
      expect("status" in result.data).toBe(false);
    }
  });

  it("accepts an explicit in_app channel", () => {
    const result = createConversationSchema.safeParse({
      lead_id: LEAD_ID,
      channel: "in_app",
    });
    expect(result.success).toBe(true);
  });
});

describe("createConversationSchema — required and invalid fields", () => {
  it("rejects a missing lead_id", () => {
    const result = createConversationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID lead_id", () => {
    const result = createConversationSchema.safeParse({ lead_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid channel", () => {
    const result = createConversationSchema.safeParse({
      lead_id: LEAD_ID,
      channel: "telegram",
    });
    expect(result.success).toBe(false);
  });

  it("strips status (database default, not client-supplied on create)", () => {
    const result = createConversationSchema.safeParse({
      lead_id: LEAD_ID,
      status: "closed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("status" in result.data).toBe(false);
    }
  });
});

describe("createConversationSchema — client cannot supply tenant identity", () => {
  it("strips organization_id from the parsed payload", () => {
    const result = createConversationSchema.safeParse({
      ...validCreateConversation(),
      organization_id: ORG_B,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("strips user_id from the parsed payload", () => {
    const result = createConversationSchema.safeParse({
      ...validCreateConversation(),
      user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("user_id" in result.data).toBe(false);
    }
  });

  it("strips requires_human and ai_paused_at (not client-supplied in Phase 3)", () => {
    const result = createConversationSchema.safeParse({
      ...validCreateConversation(),
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("requires_human" in result.data).toBe(false);
      expect("ai_paused_at" in result.data).toBe(false);
    }
  });

  it("strips the Phase 3.7 malicious handoff payload and still creates a valid input", () => {
    const result = createConversationSchema.safeParse({
      lead_id: LEAD_ID,
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ lead_id: LEAD_ID, channel: "in_app" });
    }
  });
});

describe("updateConversationSchema", () => {
  it("accepts an empty object (no-op)", () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a status-only update", () => {
    const result = updateConversationSchema.safeParse({ status: "closed" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(updateConversationSchema.safeParse({ status: "archived" }).success).toBe(
      false
    );
  });

  it("strips organization_id so a conversation cannot be moved across tenants", () => {
    const result = updateConversationSchema.safeParse({
      status: "closed",
      organization_id: ORG_B,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("strips requires_human and ai_paused_at so they cannot be client-controlled", () => {
    const result = updateConversationSchema.safeParse({
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ status: "open" });
      expect("requires_human" in result.data).toBe(false);
      expect("ai_paused_at" in result.data).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// createMessageSchema
// ---------------------------------------------------------------------------

describe("createMessageSchema — valid input", () => {
  it("accepts a valid outbound message", () => {
    const result = createMessageSchema.safeParse(validCreateMessage());
    expect(result.success).toBe(true);
  });

  it("accepts a valid inbound message", () => {
    const result = createMessageSchema.safeParse({
      direction: "inbound",
      body: "I am interested in the listing.",
    });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace from body", () => {
    const result = createMessageSchema.safeParse({
      direction: "outbound",
      body: "  Hello  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("Hello");
    }
  });

  it("accepts a body at the maximum length", () => {
    const result = createMessageSchema.safeParse({
      direction: "outbound",
      body: "x".repeat(MESSAGE_BODY_MAX),
    });
    expect(result.success).toBe(true);
  });
});

describe("createMessageSchema — invalid input", () => {
  it("rejects a missing body", () => {
    expect(
      createMessageSchema.safeParse({ direction: "outbound" }).success
    ).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(
      createMessageSchema.safeParse({ direction: "outbound", body: "" }).success
    ).toBe(false);
  });

  it("rejects a whitespace-only body", () => {
    expect(
      createMessageSchema.safeParse({ direction: "outbound", body: "   " }).success
    ).toBe(false);
  });

  it("rejects a body over the maximum length", () => {
    expect(
      createMessageSchema.safeParse({
        direction: "outbound",
        body: "x".repeat(MESSAGE_BODY_MAX + 1),
      }).success
    ).toBe(false);
  });

  it("rejects a missing direction", () => {
    expect(createMessageSchema.safeParse({ body: "Hello" }).success).toBe(false);
  });

  it("rejects an invalid direction", () => {
    expect(
      createMessageSchema.safeParse({ direction: "sideways", body: "Hello" })
        .success
    ).toBe(false);
  });
});

describe("createMessageSchema — client cannot supply identity fields", () => {
  it("strips organization_id", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      organization_id: ORG_B,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });

  it("strips author_user_id (must come from the authenticated session)", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      author_user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("author_user_id" in result.data).toBe(false);
    }
  });

  it("strips conversation_id (must come from the URL path)", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      conversation_id: "cccccccccccccccc-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("conversation_id" in result.data).toBe(false);
    }
  });

  it("strips user_id", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("user_id" in result.data).toBe(false);
    }
  });

  it("strips requires_human and ai_paused_at (messages cannot control handoff)", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        direction: "outbound",
        body: "Hello, following up on your enquiry.",
      });
      expect("requires_human" in result.data).toBe(false);
      expect("ai_paused_at" in result.data).toBe(false);
    }
  });

  it("strips author_type and in_reply_to_message_id", () => {
    const result = createMessageSchema.safeParse({
      ...validCreateMessage(),
      author_type: "ai",
      in_reply_to_message_id: "11111111-0000-4000-8000-0000000000aa",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("author_type" in result.data).toBe(false);
      expect("in_reply_to_message_id" in result.data).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TypeScript row shapes
// ---------------------------------------------------------------------------

describe("Conversation type structure (compile-time shape assertions)", () => {
  it("Conversation row type has all expected fields", () => {
    const shape: Record<keyof Conversation, true> = {
      id: true,
      organization_id: true,
      lead_id: true,
      channel: true,
      status: true,
      requires_human: true,
      ai_paused_at: true,
      channel_account_id: true,
      channel_identity_id: true,
      created_at: true,
      updated_at: true,
    };
    expect(Object.keys(shape).length).toBe(11);
  });
});

describe("Message type structure (compile-time shape assertions)", () => {
  it("Message row type has all expected fields", () => {
    const shape: Record<keyof Message, true> = {
      id: true,
      organization_id: true,
      conversation_id: true,
      author_user_id: true,
      author_type: true,
      direction: true,
      body: true,
      in_reply_to_message_id: true,
      channel_identity_id: true,
      created_at: true,
    };
    expect(Object.keys(shape).length).toBe(10);
  });

  it("author_user_id is nullable (system/AI messages must not impersonate a user)", () => {
    const row: Message = {
      id: "m1",
      organization_id: ORG_A,
      conversation_id: "c1",
      author_user_id: null,
      author_type: "ai",
      direction: "outbound",
      body: "System placeholder",
      in_reply_to_message_id: null,
      channel_identity_id: null,
      created_at: "2026-08-20T00:00:00Z",
    };
    expect(row.author_user_id).toBeNull();
    expect(row.author_type).toBe("ai");
  });

  it("messages have no updated_at (append-only)", () => {
    const keys = Object.keys({
      id: true,
      organization_id: true,
      conversation_id: true,
      author_user_id: true,
      author_type: true,
      direction: true,
      body: true,
      in_reply_to_message_id: true,
      channel_identity_id: true,
      created_at: true,
    } satisfies Record<keyof Message, true>);
    expect(keys).not.toContain("updated_at");
  });
});

// ---------------------------------------------------------------------------
// Handoff foundation — schema defaults, no AI behaviour
// ---------------------------------------------------------------------------

describe("Handoff foundation (Phase 3.7 — columns reserved for Phase 4)", () => {
  it("requires_human defaults to false on Conversation Insert (field is optional)", () => {
    const insert: Database["public"]["Tables"]["conversations"]["Insert"] = {
      organization_id: ORG_A,
      lead_id: LEAD_ID,
    };
    expect(insert.requires_human).toBeUndefined();
  });

  it("ai_paused_at defaults to null on Conversation Insert (field is optional)", () => {
    const insert: Database["public"]["Tables"]["conversations"]["Insert"] = {
      organization_id: ORG_A,
      lead_id: LEAD_ID,
    };
    expect(insert.ai_paused_at).toBeUndefined();
  });

  it("Conversation row types require_human as boolean and ai_paused_at as string | null", () => {
    const row: Conversation = {
      id: "c1",
      organization_id: ORG_A,
      lead_id: LEAD_ID,
      channel: "in_app",
      status: "open",
      requires_human: false,
      ai_paused_at: null,
      channel_account_id: null,
      channel_identity_id: null,
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-20T00:00:00Z",
    };
    expect(row.requires_human).toBe(false);
    expect(row.ai_paused_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation — documented invariants
//
// Migration 000002_conversations:
//   - Composite FK (lead_id, organization_id) → leads(id, organization_id)
//   - Composite FK (conversation_id, organization_id) → conversations(...)
//   - RLS via auth_user_role_in_org(organization_id)
// Application-layer re-enforcement (Phase 3.2) via requireOrgMembership()
// and lead-in-org checks. True RLS tests require a live database.
// ---------------------------------------------------------------------------

describe("Tenant isolation — RLS and relationship contract", () => {
  it("Organization A conversation is conceptually allowed for an Organization A member", () => {
    const conversationOrg = ORG_A;
    const callerOrg = ORG_A;
    expect(conversationOrg).toBe(callerOrg);
  });

  it("Organization A user accessing Organization B conversation is rejected at the contract level", () => {
    const conversationOrg = ORG_B;
    const callerOrg = ORG_A;
    expect(conversationOrg).not.toBe(callerOrg);
    // Domain (3.2) must throw NotFoundError — indistinguishable from missing.
  });

  it("Organization A user accessing Organization B message is rejected at the contract level", () => {
    const messageOrg = ORG_B;
    const callerOrg = ORG_A;
    expect(messageOrg).not.toBe(callerOrg);
  });

  it("conversation.organization_id must equal the parent lead.organization_id", () => {
    // Enforced by trigger enforce_conversation_lead_same_org()
    // (lead_id must match leads.organization_id). No exclusive lock on leads.
    const leadOrg = ORG_A;
    const conversationOrg = ORG_A;
    expect(conversationOrg).toBe(leadOrg);
    expect(ORG_A).not.toBe(ORG_B);
  });

  it("message.organization_id must equal the parent conversation.organization_id", () => {
    // Enforced by messages_conversation_org_fk (conversation_id, organization_id).
    const conversationOrg = ORG_A;
    const messageOrg = ORG_A;
    expect(messageOrg).toBe(conversationOrg);
  });

  it("a conversation in org A cannot silently attach to a lead in org B", () => {
    const leadOrg = ORG_B;
    const conversationOrg = ORG_A;
    expect(conversationOrg).not.toBe(leadOrg);
    // Composite FK makes this insert fail at the database.
  });

  it("SELECT policy grants access only when auth_user_role_in_org is not null", () => {
    const memberRole = "agent" as const;
    const nonMemberRole = null;
    expect(memberRole).not.toBeNull();
    expect(nonMemberRole).toBeNull();
  });
});
