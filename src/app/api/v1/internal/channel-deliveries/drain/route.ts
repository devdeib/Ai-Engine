/**
 * GET/POST /api/v1/internal/channel-deliveries/drain
 *
 * Claims due delivery jobs and runs the registered delivery adapter.
 * Authenticated with CRON_SECRET. Never runs AI execution.
 */
import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/errors";
import { handleApiError, successResponse } from "@/lib/api/response";
import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Delivery-only drain. Budget matches the AI drain route. */
export const maxDuration = 60;

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  if (headerBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(headerBuffer, expectedBuffer);
}

async function drain(req: NextRequest): Promise<NextResponse> {
  return handleApiError(async () => {
    if (!isAuthorizedCron(req)) {
      throw new AuthenticationError();
    }

    const claimed = await processDueChannelDeliveryJobs({ useAdminClient: true });
    return successResponse({ claimed });
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return drain(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return drain(req);
}
