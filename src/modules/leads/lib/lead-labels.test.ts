/**
 * Unit tests for lead display utilities.
 * Pure functions — no React, no side effects, no mocking required.
 */
import { describe, it, expect } from "vitest";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES,
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "./lead-labels";
import type { LeadSource, LeadStatus } from "@/lib/db/types";

const ALL_SOURCES: LeadSource[] = [
  "website",
  "referral",
  "cold_call",
  "email_campaign",
  "social_media",
  "portal",
  "other",
];

const ALL_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "lost",
  "converted",
];

describe("LEAD_SOURCE_LABELS", () => {
  it("has a label for every source enum value", () => {
    for (const source of ALL_SOURCES) {
      expect(LEAD_SOURCE_LABELS[source]).toBeTruthy();
    }
  });

  it("returns human-readable strings (not snake_case raw values)", () => {
    expect(LEAD_SOURCE_LABELS.cold_call).toBe("Cold Call");
    expect(LEAD_SOURCE_LABELS.email_campaign).toBe("Email Campaign");
    expect(LEAD_SOURCE_LABELS.social_media).toBe("Social Media");
  });
});

describe("LEAD_STATUS_LABELS", () => {
  it("has a label for every status enum value", () => {
    for (const status of ALL_STATUSES) {
      expect(LEAD_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("returns properly capitalised strings", () => {
    expect(LEAD_STATUS_LABELS.new).toBe("New");
    expect(LEAD_STATUS_LABELS.qualified).toBe("Qualified");
    expect(LEAD_STATUS_LABELS.unqualified).toBe("Unqualified");
    expect(LEAD_STATUS_LABELS.converted).toBe("Converted");
  });
});

describe("LEAD_STATUS_CLASSES", () => {
  it("has Tailwind class strings for every status", () => {
    for (const status of ALL_STATUSES) {
      const cls = LEAD_STATUS_CLASSES[status];
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it("each status uses a distinct colour class", () => {
    const classes = ALL_STATUSES.map((s) => LEAD_STATUS_CLASSES[s]);
    const uniqueClasses = new Set(classes);
    expect(uniqueClasses.size).toBe(ALL_STATUSES.length);
  });
});

describe("LEAD_SOURCE_OPTIONS", () => {
  it("includes all source values as options", () => {
    const values = LEAD_SOURCE_OPTIONS.map((o) => o.value);
    for (const source of ALL_SOURCES) {
      expect(values).toContain(source);
    }
  });

  it("has matching labels for each option", () => {
    for (const opt of LEAD_SOURCE_OPTIONS) {
      expect(opt.label).toBe(LEAD_SOURCE_LABELS[opt.value]);
    }
  });
});

describe("LEAD_STATUS_OPTIONS", () => {
  it("includes all status values as options", () => {
    const values = LEAD_STATUS_OPTIONS.map((o) => o.value);
    for (const status of ALL_STATUSES) {
      expect(values).toContain(status);
    }
  });

  it("has matching labels for each option", () => {
    for (const opt of LEAD_STATUS_OPTIONS) {
      expect(opt.label).toBe(LEAD_STATUS_LABELS[opt.value]);
    }
  });
});
