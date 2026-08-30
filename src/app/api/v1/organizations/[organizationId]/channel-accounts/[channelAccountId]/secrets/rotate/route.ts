/**
 * POST /api/v1/organizations/:organizationId/channel-accounts/:channelAccountId/secrets/rotate
 *
 * Owner/admin only. Full credential replacement from the stored channel.
 * Test rotation returns webhookSecret once. Other channels never return secrets.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { ValidationError } from "@/lib/errors";
import { rotateChannelAccountSecrets } from "@/modules/channels/accounts";
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError("Request body must be valid JSON");
    }

    const account = await rotateChannelAccountSecrets(
      organizationId,
      user.id,
      channelAccountId,
      body
    );
    return successResponse(account);
  });
}
