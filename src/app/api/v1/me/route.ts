/**
 * GET /api/v1/me
 * Returns the authenticated user's profile and organizations.
 * Requires authentication.
 */
import { type NextRequest } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getAuthContext } from "@/lib/api/auth";
import { getCurrentProfile, getUserOrganizations } from "@/modules/auth/queries";

export async function GET(req: NextRequest) {
  return handleApiError(async () => {
    await getAuthContext(req);

    const [profile, organizations] = await Promise.all([
      getCurrentProfile(),
      getUserOrganizations(),
    ]);

    return successResponse({
      profile,
      organizations,
    });
  });
}
