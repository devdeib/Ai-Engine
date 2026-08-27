/**
 * AI execution principal. Identity is never accepted from the model.
 *
 * operator: existing membership checks.
 * channel_ingress: worker-only, after loadTrustedJobScope.
 */
export type AiExecutionPrincipal =
  | { kind: "operator"; userId: string }
  | { kind: "channel_ingress" };

export function operatorPrincipal(userId: string): AiExecutionPrincipal {
  return { kind: "operator", userId };
}

export function channelIngressPrincipal(): AiExecutionPrincipal {
  return { kind: "channel_ingress" };
}

export function principalUserId(
  principal: AiExecutionPrincipal
): string | null {
  return principal.kind === "operator" ? principal.userId : null;
}

export function principalTriggerSource(
  principal: AiExecutionPrincipal
): "operator" | "channel_ingress" {
  return principal.kind === "operator" ? "operator" : "channel_ingress";
}

export function mapAuthorTypeForAiContext(
  authorType: "human" | "customer" | "ai" | "system"
): "human" | "ai" | "system" {
  return authorType === "customer" ? "human" : authorType;
}

export interface AiAuditActor {
  requestedByUserId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
}

export function auditActorFromPrincipal(
  principal: AiExecutionPrincipal,
  conversationChannelIdentityId: string | null
): AiAuditActor {
  if (principal.kind === "operator") {
    return {
      requestedByUserId: principal.userId,
      triggerSource: "operator",
      channelIdentityId: null,
    };
  }
  return {
    requestedByUserId: null,
    triggerSource: "channel_ingress",
    channelIdentityId: conversationChannelIdentityId,
  };
}
