import { describe, it, expect } from "vitest";
import { ACTIVITY_CONTENT_MAX } from "@/modules/leads/activities/schema";
import {
  aiEscalatedContent,
  aiPausedContent,
  aiResumedContent,
  aiResponseGeneratedContent,
  appointmentActivityContent,
  conversationStartedContent,
  followUpActivityContent,
  messageActivityContent,
} from "@/modules/leads/activities/activity-content";

describe("activity content helpers", () => {
  it("returns concise conversation copy", () => {
    expect(conversationStartedContent()).toBe("Conversation started");
    expect(messageActivityContent("outbound")).toBe("Outbound message sent");
    expect(messageActivityContent("inbound")).toBe("Inbound message received");
  });

  it("does not include a message body", () => {
    expect(messageActivityContent("outbound")).not.toContain("Hello");
  });

  it("includes the follow-up title at the lifecycle event", () => {
    expect(followUpActivityContent("created", "Call prospect")).toBe(
      "Follow-up created: Call prospect"
    );
    expect(followUpActivityContent("completed", "Call prospect")).toBe(
      "Follow-up completed: Call prospect"
    );
    expect(followUpActivityContent("cancelled", "Call prospect")).toBe(
      "Follow-up cancelled: Call prospect"
    );
  });

  it("does not include follow-up notes", () => {
    expect(followUpActivityContent("created", "Call prospect")).not.toContain(
      "notes"
    );
  });

  it("bounds an oversized follow-up title in derived content", () => {
    const content = followUpActivityContent("created", "x".repeat(2500));
    expect(content.length).toBe(ACTIVITY_CONTENT_MAX);
    expect(content.startsWith("Follow-up created: ")).toBe(true);
  });

  it("returns concise appointment copy without notes or ids", () => {
    expect(appointmentActivityContent("scheduled")).toBe("Appointment scheduled");
    expect(appointmentActivityContent("completed")).toBe("Appointment completed");
    expect(appointmentActivityContent("cancelled")).toBe("Appointment cancelled");
  });

  it("returns concise AI copy without prompts or message bodies", () => {
    expect(aiResponseGeneratedContent()).toBe("AI response generated");
    expect(aiPausedContent()).toBe("AI paused");
    expect(aiResumedContent()).toBe("AI resumed");
    expect(aiEscalatedContent()).toBe("Escalated to human");
  });
});
