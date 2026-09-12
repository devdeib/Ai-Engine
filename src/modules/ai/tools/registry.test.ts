import { describe, it, expect } from "vitest";
import { AI_TOOL_NAMES } from "@/modules/ai/types";
import {
  getAiTool,
  getRegisteredAiToolNames,
  listAiToolDescriptors,
} from "@/modules/ai/tools/registry";

describe("AI tool registry", () => {
  it("contains the approved read-only tools and Phase 4.5 write tools", () => {
    expect(getRegisteredAiToolNames()).toEqual([...AI_TOOL_NAMES]);
    const names = listAiToolDescriptors().map((tool) => tool.name).sort();
    expect(names).toEqual([...AI_TOOL_NAMES].sort());
    expect(names).toContain("create_follow_up");
    expect(names).toContain("create_appointment");
    expect(names).toContain("record_customer_facts");
    expect(names).not.toContain("update_follow_up");
    expect(names).not.toContain("update_appointment");
    expect(names).not.toContain("update_lead");
    expect(names).not.toContain("send_message");
    expect(names).not.toContain("eval");
    expect(names).not.toContain("fetch");
  });

  it("classifies write-tool trust correctly", () => {
    expect(getAiTool("create_follow_up")?.trust).toBe("autonomous");
    expect(getAiTool("create_appointment")?.trust).toBe("human_approval");
    expect(getAiTool("record_customer_facts")?.trust).toBe("autonomous");
    expect(getAiTool("get_lead_context")?.trust).toBe("autonomous");
  });

  it("rejects unknown tool names", () => {
    expect(getAiTool("sql")).toBeUndefined();
    expect(getAiTool("https://example.com")).toBeUndefined();
    expect(getAiTool("send_message")).toBeUndefined();
    expect(getAiTool("get_lead_context")).toBeDefined();
  });

  it("does not expose identity fields in tool JSON schemas", () => {
    for (const tool of listAiToolDescriptors()) {
      const encoded = JSON.stringify(tool.inputJsonSchema);
      expect(encoded).not.toContain("organizationId");
      expect(encoded).not.toContain("userId");
      expect(encoded).not.toContain("conversationId");
      expect(encoded).not.toContain("leadId");
      expect(encoded).not.toContain("assigned_user_id");
      expect(encoded).not.toContain("owner_id");
      expect(tool.inputJsonSchema.additionalProperties).toBe(false);
    }
  });
});
