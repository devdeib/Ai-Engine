import { describe, it, expect } from "vitest";
import {
  auditActorFromPrincipal,
  channelIngressPrincipal,
  mapAuthorTypeForAiContext,
  operatorPrincipal,
} from "@/modules/ai/principal";

describe("AI execution principal", () => {
  it("keeps operator membership identity and nulls channel identity on audit rows", () => {
    expect(auditActorFromPrincipal(operatorPrincipal("user-1"), "identity-1")).toEqual({
      requestedByUserId: "user-1",
      triggerSource: "operator",
      channelIdentityId: null,
    });
  });

  it("persists channel_ingress with a null requester", () => {
    expect(
      auditActorFromPrincipal(channelIngressPrincipal(), "identity-1")
    ).toEqual({
      requestedByUserId: null,
      triggerSource: "channel_ingress",
      channelIdentityId: "identity-1",
    });
  });

  it("maps customer authorship to the existing human prompt contract", () => {
    expect(mapAuthorTypeForAiContext("customer")).toBe("human");
    expect(mapAuthorTypeForAiContext("human")).toBe("human");
    expect(mapAuthorTypeForAiContext("ai")).toBe("ai");
  });
});
