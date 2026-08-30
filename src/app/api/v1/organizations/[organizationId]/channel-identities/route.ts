/**
 * GET /api/v1/organizations/:organizationId/channel-identities
 *
 * Membership-gated paginated list. Never returns webhook secrets.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listChannelIdentities } from "@/modules/channels/identities";
import { listChannelIdentitiesQuerySchema } from "@/modules/channels/schema";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);
    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { page, limit, channel_account_id, lead_id, unmatched } =
      validateParams(rawParams, listChannelIdentitiesQuerySchema);
    const identities = await listChannelIdentities(
      organizationId,
      user.id,
      { page, limit },
      {
        channelAccountId: channel_account_id,
        leadId: lead_id,
        unmatched,
      }
    );
    return successResponse(identities, {
      meta: { page, limit, count: identities.length },
    });
  });
}
