import { describe, it, expect } from "vitest";
import {
  QUALIFICATION_FACT_KEYS,
  REQUIRED_QUALIFICATION_FACT_KEYS,
  buildLeadQualificationView,
  deriveQualificationStatus,
  missingRequiredFields,
  parseQualificationFacts,
} from "@/modules/leads/qualification";

describe("qualification allowlist", () => {
  it("uses the frozen Phase 4.6 missing-information vocabulary", () => {
    expect([...QUALIFICATION_FACT_KEYS]).toEqual([
      "budget",
      "timeline",
      "location",
      "property_type",
      "financing",
      "decision_maker",
    ]);
    expect([...REQUIRED_QUALIFICATION_FACT_KEYS]).toEqual([
      "budget",
      "timeline",
      "location",
    ]);
  });
});

describe("parseQualificationFacts", () => {
  it("keeps allowlisted trimmed strings and drops unknown keys", () => {
    expect(
      parseQualificationFacts({
        budget: "  200k ",
        extra: "nope",
        timeline: "",
        location: 12,
      })
    ).toEqual({ budget: "200k" });
  });

  it("returns empty facts for invalid payloads", () => {
    expect(parseQualificationFacts(null)).toEqual({});
    expect(parseQualificationFacts("budget")).toEqual({});
    expect(parseQualificationFacts([])).toEqual({});
  });
});

describe("deriveQualificationStatus", () => {
  const required = {
    budget: "200k",
    timeline: "3 months",
    location: "Limassol",
  };

  it("is NOT_STARTED when no required facts are present", () => {
    expect(
      deriveQualificationStatus({
        email: "a@example.com",
        phone: "+1",
        facts: {},
      })
    ).toBe("not_started");
    expect(
      deriveQualificationStatus({
        email: null,
        phone: null,
        facts: { property_type: "apartment" },
      })
    ).toBe("not_started");
  });

  it("is QUALIFYING when at least one required fact exists but the gate is not met", () => {
    expect(
      deriveQualificationStatus({
        email: "a@example.com",
        phone: null,
        facts: { budget: "200k" },
      })
    ).toBe("qualifying");
    expect(
      deriveQualificationStatus({
        email: "a@example.com",
        phone: null,
        facts: { budget: "200k", timeline: "soon" },
      })
    ).toBe("qualifying");
    expect(
      deriveQualificationStatus({
        email: null,
        phone: null,
        facts: required,
      })
    ).toBe("qualifying");
  });

  it("is QUALIFIED when required facts exist and the lead is contactable", () => {
    expect(
      deriveQualificationStatus({
        email: "a@example.com",
        phone: null,
        facts: required,
      })
    ).toBe("qualified");
    expect(
      deriveQualificationStatus({
        email: null,
        phone: "+974 555",
        facts: required,
      })
    ).toBe("qualified");
  });

  it("does not require optional facts to qualify", () => {
    expect(
      deriveQualificationStatus({
        email: "a@example.com",
        phone: null,
        facts: required,
      })
    ).toBe("qualified");
  });
});

describe("missingRequiredFields", () => {
  it("lists required facts then contact in stable order", () => {
    expect(
      missingRequiredFields({ email: null, phone: null, facts: {} })
    ).toEqual(["budget", "timeline", "location", "contact"]);
    expect(
      missingRequiredFields({
        email: "a@example.com",
        phone: null,
        facts: { budget: "200k" },
      })
    ).toEqual(["timeline", "location"]);
  });
});

describe("buildLeadQualificationView", () => {
  it("parses stored facts and derives status in one pass", () => {
    const view = buildLeadQualificationView({
      email: null,
      phone: "+1",
      qualificationFacts: { budget: "100k", garbage: true },
    });
    expect(view.facts).toEqual({ budget: "100k" });
    expect(view.qualificationStatus).toBe("qualifying");
    expect(view.missingRequiredFields).toEqual(["timeline", "location"]);
  });
});
