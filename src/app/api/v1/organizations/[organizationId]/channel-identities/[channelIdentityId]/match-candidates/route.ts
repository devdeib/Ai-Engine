/**
 * GET /api/v1/organizations/:organizationId/channel-identities/:channelIdentityId/match-candidates
 *
 * Membership-gated. Returns public CRM lead candidates for operator attach.
 * Never writes. Never returns secrets.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listChannelIdentityMatchCandidates } from "@/modules/channels/identities";
import {
  channelIdentityIdParamsSchema,
  listChannelIdentityMatchCandidatesQuerySchema,
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
    const { page, limit } = validateParams(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
      listChannelIdentityMatchCandidatesQuerySchema
    );

    const { user } = await getOrgContext(req, organizationId);
    const candidates = await listChannelIdentityMatchCandidates(
      organizationId,
      user.id,
      channelIdentityId,
      { page, limit }
    );
    return successResponse(candidates, {
      meta: { page, limit, count: candidates.length },
    });
  });
}
