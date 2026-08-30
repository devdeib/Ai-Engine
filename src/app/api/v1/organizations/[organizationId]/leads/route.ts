/**
 * GET  /api/v1/organizations/:organizationId/leads  — List leads (paginated, searchable, filterable, sortable)
 * POST /api/v1/organizations/:organizationId/leads  — Create a lead
 *
 * Organization context comes from the URL path parameter, verified server-side
 * by getOrgContext (requireOrgMembership).  The client can never supply an
 * organization_id that bypasses this check.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createLeadSchema } from "@/modules/leads/schema";
import { listLeads, type LeadsFilter } from "@/modules/leads/queries";
import { createLead } from "@/modules/leads/actions";
import { excludeChannelStubsQuerySchema } from "@/modules/channels/schema";
import type { LeadStatus, LeadSource } from "@/lib/db/types";

// Exported so route tests can reference the same defaults without duplication.
export const PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

// Valid enum values — used to silently drop unknown values sent by the client
// rather than returning a 422 error for an unrecognised status/source string.
const VALID_STATUSES: LeadStatus[] = [
  "new", "contacted", "qualified", "unqualified", "lost", "converted",
];
const VALID_SOURCES: LeadSource[] = [
  "website", "referral", "cold_call", "email_campaign", "social_media", "portal", "other",
];

const listLeadsQuerySchema = z.object({
  // --- pagination ---
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(PAGINATION_DEFAULTS.limit),

  // --- search ---
  // Free-text search across name, email, phone, company.
  search: z.string().max(200, "Search must be at most 200 characters").trim().optional(),

  // --- filter ---
  // Comma-separated enum values; unrecognised values are silently dropped.
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const parts = val
        .split(",")
        .map((s) => s.trim())
        .filter((v): v is LeadStatus => VALID_STATUSES.includes(v as LeadStatus));
      return parts.length > 0 ? parts : undefined;
    }),
  source: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const parts = val
        .split(",")
        .map((s) => s.trim())
        .filter((v): v is LeadSource => VALID_SOURCES.includes(v as LeadSource));
      return parts.length > 0 ? parts : undefined;
    }),

  // --- sort ---
  sortBy: z
    .enum(["created_at", "first_name", "last_name", "status", "score"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),

  // --- owner filter ---
  // Accepts a member user UUID or the special value "unassigned".
  owner_id: z
    .union([
      z.literal("unassigned"),
      z.string().uuid("owner_id must be a valid UUID or 'unassigned'"),
    ])
    .optional(),
  exclude_channel_stubs: excludeChannelStubsQuerySchema,
});

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = validateParams(rawParams, listLeadsQuerySchema);
    const {
      page,
      limit,
      search,
      status,
      source,
      sortBy,
      sortOrder,
      owner_id,
      exclude_channel_stubs,
    } = params;

    // Build the filter object — only include fields that were actually provided.
    const filter: LeadsFilter = {};
    if (search) filter.search = search;
    if (status?.length) filter.status = status;
    if (source?.length) filter.source = source;
    if (sortBy) filter.sortBy = sortBy;
    if (sortOrder) filter.sortOrder = sortOrder;
    if (owner_id) filter.ownerId = owner_id;
    if (exclude_channel_stubs) filter.excludeChannelStubs = true;

    const leads = await listLeads(organizationId, user.id, { page, limit }, filter);
    return successResponse(leads, {
      meta: { page, limit, count: leads.length },
    });
  });
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);

    // validateBody strips any fields not in createLeadSchema — including
    // any attacker-supplied organization_id — before the data reaches the
    // domain layer.
    const body = await validateBody(req, createLeadSchema);
    const lead = await createLead(organizationId, user.id, body);
    return successResponse(lead, { status: 201 });
  });
}
