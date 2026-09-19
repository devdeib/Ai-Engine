/**
 * POST /api/v1/channels/accounts/:channelAccountId/webhook
 * GET  /api/v1/channels/accounts/:channelAccountId/webhook
 *
 * Provider webhook. No session cookie.
 * POST dispatches verification/parsing through the inbound adapter, then
 * persists and enqueues. GET is WhatsApp hub challenge only.
 * Never runs AI execution. Never constructs channel_ingress here.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { validateParams } from "@/lib/api/validate";
import { handleWhatsAppWebhookChallenge } from "@/modules/channels/adapters/whatsapp/challenge";
import { ingestChannelWebhook } from "@/modules/channels/ingest";

export const runtime = "nodejs";
/**
 * Webhook ACK is fast (persist + enqueue). The after() callback continues
 * to run AI + delivery in the background within this budget.
 * 60s is the Vercel Hobby maximum; Pro allows up to 300s.
 */
export const maxDuration = 60;

const paramsSchema = z.object({
  channelAccountId: z.string().uuid("Channel account ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ channelAccountId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { channelAccountId } = await context.params;
    validateParams({ channelAccountId }, paramsSchema);

    const challenge = await handleWhatsAppWebhookChallenge({
      channelAccountId,
      searchParams: req.nextUrl.searchParams,
    });

    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  });
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { channelAccountId } = await context.params;
    validateParams({ channelAccountId }, paramsSchema);

    const rawBody = await req.text();
    const result = await ingestChannelWebhook({
      channelAccountId,
      rawBody,
      headers: req.headers,
    });

    return successResponse(result);
  });
}
