/**
 * GET   /api/v1/organizations/:organizationId/channel-accounts/:channelAccountId
 * PATCH /api/v1/organizations/:organizationId/channel-accounts/:channelAccountId
 *
 * GET is membership-gated. PATCH status is owner/admin only.
 * Secrets are never returned. Extra PATCH keys are rejected.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import {
  getChannelAccount,
  updateChannelAccountStatus,
} from "@/modules/channels/accounts";
import {
  channelAccountIdParamsSchema,
  updateChannelAccountStatusSchema,
} from "@/modules/channels/schema";

interface RouteContext {
  params: Promise<{ organizationId: string; channelAccountId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, channelAccountId } = await context.params;
    validateParams({ channelAccountId }, channelAccountIdParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const account = await getChannelAccount(
      organizationId,
      user.id,
      channelAccountId
    );
    return successResponse(account);
  });
}

export async function PATCH(
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
    const body = await validateBody(req, updateChannelAccountStatusSchema);
    const account = await updateChannelAccountStatus(
      organizationId,
      user.id,
      channelAccountId,
      body
    );
    return successResponse(account);
  });
}
