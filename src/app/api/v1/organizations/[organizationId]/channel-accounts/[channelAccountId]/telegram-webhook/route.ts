/**
 * POST /api/v1/organizations/:organizationId/channel-accounts/:channelAccountId/telegram-webhook
 *
 * Owner/admin only. Explicit Telegram setWebhook using stored credentials.
 * Safe to repeat. Never returns the bot token or webhook secret.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { setupTelegramChannelWebhook } from "@/modules/channels/adapters/telegram/setup";
import { channelAccountIdParamsSchema } from "@/modules/channels/schema";

interface RouteContext {
  params: Promise<{ organizationId: string; channelAccountId: string }>;
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, channelAccountId } = await context.params;
    validateParams({ channelAccountId }, channelAccountIdParamsSchema);

    const { user } = await getOrgContext(req, organizationId, [
      "owner",
      "admin",
    ]);

    const result = await setupTelegramChannelWebhook(
      organizationId,
      user.id,
      channelAccountId
    );
    return successResponse(result);
  });
}
