import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysis } from "@/lib/db/types";
import {
  pipelineSnapshotSchema,
  validateAiSalesAnalysis,
  type AiSalesAnalysisPayload,
} from "@/modules/ai/analysis/schema";

export interface PublicAiSalesAnalysis {
  id: string;
  status: "recorded" | "failed";
  schemaVersion: string;
  promptVersion: string;
  createdAt: string;
  inboundMessageCreatedAt: string;
  isCurrent: boolean;
  pipeline: AiPipelineSnapshot;
  analysis: AiSalesAnalysisPayload | null;
}

export function toPublicAiSalesAnalysis(
  row: AiSalesAnalysis,
  latestInboundId: string | null
): PublicAiSalesAnalysis {
  const pipeline = pipelineSnapshotSchema.parse(row.pipeline_snapshot);
  const analysis =
    row.status === "recorded" ? validateAiSalesAnalysis(row.payload) : null;
  return {
    id: row.id,
    status: row.status,
    schemaVersion: row.schema_version,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    inboundMessageCreatedAt: row.inbound_message_created_at,
    isCurrent:
      latestInboundId !== null && row.inbound_message_id === latestInboundId,
    pipeline,
    analysis,
  };
}
