/**
 * Atomically claim due channel delivery jobs (FOR UPDATE SKIP LOCKED in SQL).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { CHANNEL_DELIVERY_LEASE_SECONDS } from "@/modules/channels/constants";
import type { ChannelDeliveryJob } from "@/lib/db/types";

export async function claimChannelDeliveryJobs(input: {
  limit: number;
  organizationId?: string | null;
  leaseSeconds?: number;
}): Promise<ChannelDeliveryJob[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
    "claim_channel_delivery_jobs",
    {
      p_limit: input.limit,
      p_organization_id: input.organizationId ?? null,
      p_lease_seconds: input.leaseSeconds ?? CHANNEL_DELIVERY_LEASE_SECONDS,
    }
  );

  if (error) {
    logger.error("Failed to claim channel delivery jobs", {
      organizationId: input.organizationId ?? undefined,
      code: error.code ?? "INTERNAL_ERROR",
    });
    return [];
  }

  return (data ?? []) as ChannelDeliveryJob[];
}
