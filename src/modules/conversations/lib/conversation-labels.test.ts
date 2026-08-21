import { describe, it, expect } from "vitest";
import {
  CONVERSATION_STATUS_LABELS,
  CONVERSATION_CHANNEL_LABELS,
  leadDisplayName,
} from "@/modules/conversations/lib/conversation-labels";

describe("conversation labels", () => {
  it("labels open and closed statuses", () => {
    expect(CONVERSATION_STATUS_LABELS.open).toBe("Open");
    expect(CONVERSATION_STATUS_LABELS.closed).toBe("Closed");
  });

  it("labels the in_app channel", () => {
    expect(CONVERSATION_CHANNEL_LABELS.in_app).toBe("In App");
  });
});

describe("leadDisplayName", () => {
  it("joins first and last name", () => {
    expect(
      leadDisplayName({
        id: "1",
        first_name: "Ahmed",
        last_name: "Ali",
        company_name: null,
      })
    ).toBe("Ahmed Ali");
  });

  it("returns a fallback when lead is missing", () => {
    expect(leadDisplayName(null)).toBe("Unknown lead");
    expect(leadDisplayName(undefined)).toBe("Unknown lead");
  });
});
