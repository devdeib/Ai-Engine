/**
 * GET  /api/v1/organizations/:organizationId/channel-accounts
 * POST /api/v1/organizations/:organizationId/channel-accounts
 *
 * List/get are membership-gated. Create is owner/admin only.
 * Test webhook secret is returned exactly once on create.
 * WhatsApp/Email/SMS credentials are never returned.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import {
  createChannelAccount,
  listChannelAccounts,
} from "@/modules/channels/accounts";
import {
  createChannelAccountSchema,
  listChannelAccountsQuerySchema,
} from "@/modules/channels/schema";

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
    const { page, limit } = validateParams(rawParams, listChannelAccountsQuerySchema);
    const accounts = await listChannelAccounts(
      organizationId,
      user.id,
      { page, limit }
    );
    return successResponse(accounts, {
      meta: { page, limit, count: accounts.length },
    });
  });
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId, [
      "owner",
      "admin",
    ]);
    const body = await validateBody(req, createChannelAccountSchema);
    const account = await createChannelAccount(
      organizationId,
      user.id,
      body
    );
    return successResponse(account, { status: 201 });
  });
}
