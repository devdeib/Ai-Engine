import { describe, it, expect } from "vitest";
import {
  CHANNEL_STUB_LEAD_FIRST_NAME,
  CHANNEL_STUB_LEAD_LAST_NAME,
} from "@/modules/channels/constants";
import {
  CHANNEL_STUB_LEAD_EXCLUDE_OR,
  isChannelStubLead,
  leadMatchesNormalizedAddress,
  normalizeChannelAddress,
  toPublicMatchCandidate,
} from "@/modules/channels/match";
import type { Lead } from "@/lib/db/types";

const CRM_LEAD: Pick<
  Lead,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "company_name"
  | "status"
> = {
  id: "11111111-1111-4111-8111-111111111111",
  first_name: "Ahmed",
  last_name: "Ali",
  email: "Ahmed@Example.com",
  phone: "+974 5555 1234",
  company_name: "Acme",
  status: "new",
};

describe("isChannelStubLead", () => {
  it("detects ingest stub leads with empty contact fields", () => {
    expect(
      isChannelStubLead({
        first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
        last_name: CHANNEL_STUB_LEAD_LAST_NAME,
        email: null,
        phone: null,
      })
    ).toBe(true);
    expect(
      isChannelStubLead({
        first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
        last_name: CHANNEL_STUB_LEAD_LAST_NAME,
        email: "",
        phone: "  ",
      })
    ).toBe(true);
  });

  it("does not treat a real CRM lead as a stub", () => {
    expect(
      isChannelStubLead({
        first_name: "Ahmed",
        last_name: "Ali",
        email: null,
        phone: null,
      })
    ).toBe(false);
    expect(
      isChannelStubLead({
        first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
        last_name: CHANNEL_STUB_LEAD_LAST_NAME,
        email: "lead@example.com",
        phone: null,
      })
    ).toBe(false);
  });
});

describe("normalizeChannelAddress", () => {
  it("normalizes email case-insensitively", () => {
    expect(normalizeChannelAddress("email", "John.Doe@Example.com")).toBe(
      "john.doe@example.com"
    );
  });

  it("normalizes WhatsApp, SMS, and Test addresses to digits", () => {
    expect(normalizeChannelAddress("whatsapp", "+974 5555 1234")).toBe(
      "97455551234"
    );
    expect(normalizeChannelAddress("sms", "97455551234")).toBe("97455551234");
    expect(normalizeChannelAddress("test", "+974-5555-1234")).toBe("97455551234");
  });
});

describe("leadMatchesNormalizedAddress", () => {
  it("matches email case-insensitively", () => {
    const normalized = normalizeChannelAddress("email", "ahmed@example.com");
    expect(
      leadMatchesNormalizedAddress("email", normalized, {
        email: "Ahmed@Example.com",
        phone: null,
      })
    ).toBe(true);
    expect(
      leadMatchesNormalizedAddress("email", normalized, {
        email: "other@example.com",
        phone: null,
      })
    ).toBe(false);
  });

  it("matches WhatsApp, SMS, and Test phones by digits", () => {
    const normalized = normalizeChannelAddress("whatsapp", "+974 5555 1234");
    const phone = { email: null, phone: "97455551234" };
    expect(leadMatchesNormalizedAddress("whatsapp", normalized, phone)).toBe(
      true
    );
    expect(leadMatchesNormalizedAddress("sms", normalized, phone)).toBe(true);
    expect(leadMatchesNormalizedAddress("test", normalized, phone)).toBe(true);
    expect(
      leadMatchesNormalizedAddress("whatsapp", normalized, {
        email: null,
        phone: "+1 555 0000",
      })
    ).toBe(false);
  });
});

describe("toPublicMatchCandidate", () => {
  it("returns only the approved public candidate fields", () => {
    const publicCandidate = toPublicMatchCandidate(CRM_LEAD);
    expect(publicCandidate).toEqual({
      id: CRM_LEAD.id,
      firstName: "Ahmed",
      lastName: "Ali",
      email: "Ahmed@Example.com",
      phone: "+974 5555 1234",
      companyName: "Acme",
      status: "new",
    });
    expect(publicCandidate).not.toHaveProperty("notes");
    expect(publicCandidate).not.toHaveProperty("score");
    expect(publicCandidate).not.toHaveProperty("owner_id");
  });
});

describe("CHANNEL_STUB_LEAD_EXCLUDE_OR", () => {
  it("excludes the stub name heuristic without adding a stub column", () => {
    expect(CHANNEL_STUB_LEAD_EXCLUDE_OR).toContain(
      `first_name.neq.${CHANNEL_STUB_LEAD_FIRST_NAME}`
    );
    expect(CHANNEL_STUB_LEAD_EXCLUDE_OR).toContain(
      `last_name.neq.${CHANNEL_STUB_LEAD_LAST_NAME}`
    );
  });
});
