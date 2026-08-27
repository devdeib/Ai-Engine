/**
 * GET/POST /api/v1/internal/ai-jobs/drain
 *
 * Claims due AI jobs and runs processConversationMessage.
 * Authenticated with CRON_SECRET (Vercel Cron sends GET + Bearer).
 * Not a public API. Does not accept tenant or job identity from the client.
 */
import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/errors";
import { handleApiError, successResponse } from "@/lib/api/response";
import { processDueAiJobs } from "@/modules/ai/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const claimed = await processDueAiJobs({ useAdminClient: true });
    return successResponse({ claimed });
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return drain(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return drain(req);
}
