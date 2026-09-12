import { describe, it, expect } from "vitest";
import {
  createAppointmentToolInputSchema,
  createFollowUpToolInputSchema,
  recordCustomerFactsToolInputSchema,
} from "@/modules/ai/tools/write-schemas";

const FORGED = {
  organizationId: "org",
  userId: "user",
  conversationId: "conv",
  leadId: "lead",
  inboundMessageId: "msg",
  assigned_user_id: "assignee",
  owner_id: "owner",
  actionId: "action",
  appointmentId: "appt",
  status: "approved",
};

describe("createFollowUpToolInputSchema", () => {
  it("accepts business fields and maps dueAt", () => {
    const parsed = createFollowUpToolInputSchema.safeParse({
      title: "Call Ahmed",
      notes: "Discuss viewing",
      dueAt: "2026-08-22T10:00:00Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Call Ahmed");
      expect(parsed.data.dueAt).toBe(new Date("2026-08-22T10:00:00Z").toISOString());
    }
  });

  it("rejects identity and scope fields", () => {
    const parsed = createFollowUpToolInputSchema.safeParse({
      title: "Call Ahmed",
      dueAt: "2026-08-22T10:00:00Z",
      ...FORGED,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown keys and malformed dates", () => {
    expect(
      createFollowUpToolInputSchema.safeParse({
        title: "Call",
        dueAt: "not-a-date",
      }).success
    ).toBe(false);
    expect(
      createFollowUpToolInputSchema.safeParse({
        title: "Call",
        dueAt: "2026-08-22T10:00:00Z",
        extra: true,
      }).success
    ).toBe(false);
  });
});

describe("createAppointmentToolInputSchema", () => {
  it("accepts business fields", () => {
    const parsed = createAppointmentToolInputSchema.safeParse({
      startsAt: "2026-08-22T10:00:00Z",
      endsAt: "2026-08-22T11:00:00Z",
      location: "West Bay",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects endsAt before startsAt", () => {
    expect(
      createAppointmentToolInputSchema.safeParse({
        startsAt: "2026-08-22T11:00:00Z",
        endsAt: "2026-08-22T10:00:00Z",
      }).success
    ).toBe(false);
  });

  it("rejects identity and approval fields", () => {
    expect(
      createAppointmentToolInputSchema.safeParse({
        startsAt: "2026-08-22T10:00:00Z",
        ...FORGED,
      }).success
    ).toBe(false);
  });
});

describe("recordCustomerFactsToolInputSchema", () => {
  it("accepts a partial allowlisted patch", () => {
    const parsed = recordCustomerFactsToolInputSchema.safeParse({
      email: "  Ahmed@Example.com ",
      budget: "  200k ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("ahmed@example.com");
      expect(parsed.data.budget).toBe("200k");
    }
  });

  it("rejects empty patches, unknown keys, and invalid email", () => {
    expect(recordCustomerFactsToolInputSchema.safeParse({}).success).toBe(false);
    expect(
      recordCustomerFactsToolInputSchema.safeParse({ extra: true }).success
    ).toBe(false);
    expect(
      recordCustomerFactsToolInputSchema.safeParse({ requirement: "villa" })
        .success
    ).toBe(false);
    expect(
      recordCustomerFactsToolInputSchema.safeParse({ email: "not-an-email" })
        .success
    ).toBe(false);
    expect(
      recordCustomerFactsToolInputSchema.safeParse({ budget: "" }).success
    ).toBe(false);
    expect(
      recordCustomerFactsToolInputSchema.safeParse({
        budget: "x".repeat(201),
      }).success
    ).toBe(false);
  });

  it("rejects identity fields", () => {
    expect(
      recordCustomerFactsToolInputSchema.safeParse({
        budget: "200k",
        ...FORGED,
      }).success
    ).toBe(false);
  });
});
