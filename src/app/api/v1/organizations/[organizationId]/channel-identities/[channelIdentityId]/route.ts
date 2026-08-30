/**
 * GET   /api/v1/organizations/:organizationId/channel-identities/:channelIdentityId
 * PATCH /api/v1/organizations/:organizationId/channel-identities/:channelIdentityId
 *
 * Membership-gated. PATCH attaches the identity to an existing in-org lead.
 * Secrets are never returned. Extra PATCH keys are rejected.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import {
  attachChannelIdentityLead,
  getChannelIdentity,
} from "@/modules/channels/identities";
import {
  attachChannelIdentityLeadSchema,
  channelIdentityIdParamsSchema,
} from "@/modules/channels/schema";

interface RouteContext {
  params: Promise<{ organizationId: string; channelIdentityId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, channelIdentityId } = await context.params;
    validateParams({ channelIdentityId }, channelIdentityIdParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const identity = await getChannelIdentity(
      organizationId,
      user.id,
      channelIdentityId
    );
    return successResponse(identity);
  });
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, channelIdentityId } = await context.params;
    validateParams({ channelIdentityId }, channelIdentityIdParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, attachChannelIdentityLeadSchema);
    const identity = await attachChannelIdentityLead(
      organizationId,
      user.id,
      channelIdentityId,
      body.leadId
    );
    return successResponse(identity);
  });
}
