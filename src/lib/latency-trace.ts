/**
 * Forensic latency tracer for production pipeline diagnostics.
 *
 * Records high-resolution timestamps at each stage of the inbound message
 * pipeline. When the trace is finalized, it emits a single structured log
 * entry with the complete timeline and per-stage durations.
 *
 * Rules:
 * - NEVER logs PII, message bodies, API keys, or secrets.
 * - Uses Date.now() for wall-clock ms (works across async boundaries).
 * - Each trace is keyed by inbound message ID (natural correlation key).
 * - Traces auto-expire after 120 seconds to prevent memory leaks.
 */

import { logger } from "@/lib/logger";

export interface LatencyStage {
  name: string;
  ts: number;
}

export interface LatencyTrace {
  inboundMessageId: string;
  organizationId: string;
  conversationId: string;
  channel: string;
  stages: LatencyStage[];
  openaiCalls: OpenAiCallTiming[];
  startedAt: number;
}

export interface OpenAiCallTiming {
  purpose: string;
  model: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  hasToolCalls: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

const activeTraces = new Map<string, LatencyTrace>();

const TRACE_TTL_MS = 120_000;

function cleanup(): void {
  const now = Date.now();
  for (const [key, trace] of activeTraces) {
    if (now - trace.startedAt > TRACE_TTL_MS) {
      activeTraces.delete(key);
    }
  }
}

export function startLatencyTrace(input: {
  inboundMessageId: string;
  organizationId: string;
  conversationId: string;
  channel: string;
}): void {
  cleanup();
  const now = Date.now();
  activeTraces.set(input.inboundMessageId, {
    inboundMessageId: input.inboundMessageId,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    channel: input.channel,
    stages: [{ name: "trace_started", ts: now }],
    openaiCalls: [],
    startedAt: now,
  });
}

export function recordStage(
  inboundMessageId: string,
  name: string
): void {
  const trace = activeTraces.get(inboundMessageId);
  if (!trace) return;
  trace.stages.push({ name, ts: Date.now() });
}

export function recordOpenAiCall(
  inboundMessageId: string,
  timing: OpenAiCallTiming
): void {
  const trace = activeTraces.get(inboundMessageId);
  if (!trace) return;
  trace.openaiCalls.push(timing);
}

export function finalizeLatencyTrace(inboundMessageId: string): void {
  const trace = activeTraces.get(inboundMessageId);
  if (!trace) return;
  activeTraces.delete(inboundMessageId);

  trace.stages.push({ name: "trace_finalized", ts: Date.now() });

  const totalMs = trace.stages[trace.stages.length - 1]!.ts - trace.stages[0]!.ts;
  const stageDurations: Record<string, number> = {};
  for (let i = 1; i < trace.stages.length; i++) {
    const prev = trace.stages[i - 1]!;
    const curr = trace.stages[i]!;
    stageDurations[`${prev.name} → ${curr.name}`] = curr.ts - prev.ts;
  }

  const openaiSummary = trace.openaiCalls.map((call) => ({
    purpose: call.purpose,
    model: call.model,
    durationMs: call.durationMs,
    hasToolCalls: call.hasToolCalls,
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    totalTokens: call.totalTokens,
  }));

  logger.info("LATENCY_TRACE_COMPLETE", {
    organizationId: trace.organizationId,
    traceId: trace.inboundMessageId,
    channel: trace.channel,
    totalMs,
    stageCount: trace.stages.length,
    stageDurations,
    openaiCalls: openaiSummary,
    openaiTotalMs: trace.openaiCalls.reduce((sum, c) => sum + c.durationMs, 0),
    stages: trace.stages.map((s) => ({
      name: s.name,
      offsetMs: s.ts - trace.startedAt,
    })),
  });
}

/** Look up an active trace to thread the correlation through. */
export function getActiveTrace(inboundMessageId: string): LatencyTrace | undefined {
  return activeTraces.get(inboundMessageId);
}
