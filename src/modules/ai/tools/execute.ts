import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { AiToolError } from "@/modules/ai/errors";
import { getAiTool } from "@/modules/ai/tools/registry";
import type { AiToolContext, AiToolResultEnvelope } from "@/modules/ai/tools/types";

function normalizeToolArguments(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") {
    return {};
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function logToolOutcome(
  ctx: AiToolContext,
  name: string,
  outcome: "ok" | string
): void {
  logger.info("AI tool executed", {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    tool: name,
    outcome,
  });
}

export async function runAiToolCall(
  input: { id: string; name: string; arguments: unknown },
  ctx: AiToolContext
): Promise<AiToolResultEnvelope> {
  const tool = getAiTool(input.name);
  if (!tool) {
    logToolOutcome(ctx, input.name, "AI_UNKNOWN_TOOL");
    return { ok: false, name: input.name, code: "AI_UNKNOWN_TOOL" };
  }

  const parsed = tool.inputSchema.safeParse(normalizeToolArguments(input.arguments));
  if (!parsed.success) {
    logToolOutcome(ctx, tool.name, "AI_TOOL_INVALID_ARGUMENTS");
    return { ok: false, name: tool.name, code: "AI_TOOL_INVALID_ARGUMENTS" };
  }

  try {
    const output = await tool.execute(ctx, parsed.data);
    const validated = tool.outputSchema.safeParse(output);
    if (!validated.success) {
      logToolOutcome(ctx, tool.name, "AI_TOOL_FAILED");
      throw new AiToolError("AI_TOOL_FAILED");
    }
    logToolOutcome(ctx, tool.name, "ok");
    return { ok: true, name: tool.name, data: validated.data };
  } catch (error) {
    if (error instanceof TenantAccessError || error instanceof AuthorizationError) {
      throw error;
    }
    if (error instanceof AiToolError) {
      throw error;
    }
    if (error instanceof ValidationError) {
      logToolOutcome(ctx, tool.name, "AI_TOOL_REJECTED");
      return { ok: false, name: tool.name, code: "AI_TOOL_REJECTED" };
    }
    if (error instanceof ConflictError) {
      logToolOutcome(ctx, tool.name, "AI_TOOL_REJECTED");
      return { ok: false, name: tool.name, code: "AI_TOOL_REJECTED" };
    }
    if (error instanceof NotFoundError) {
      logToolOutcome(ctx, tool.name, "AI_TOOL_NOT_FOUND");
      return { ok: false, name: tool.name, code: "AI_TOOL_NOT_FOUND" };
    }
    logToolOutcome(ctx, tool.name, "AI_TOOL_FAILED");
    throw new AiToolError("AI_TOOL_FAILED");
  }
}
