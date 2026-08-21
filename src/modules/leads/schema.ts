/**
 * Zod validation schemas for the leads domain.
 *
 * IMPORTANT: organization_id is NEVER included in these client-facing schemas.
 * It must always be resolved server-side from the authenticated user's
 * organization context and injected before any database operation.
 * Accepting organization_id from client input is a tenant-isolation violation.
 *
 * These schemas validate the shape of data submitted by authenticated users.
 * They are the application-layer complement to the database constraints defined
 * in supabase/migrations/20260819000003_leads.sql.
 */
import { z } from "zod";
import type { LeadSource, LeadStatus } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Enum schemas — values must match the PostgreSQL lead_source and lead_status
// ENUMs defined in migration 000003.
// ---------------------------------------------------------------------------

export const leadSourceSchema = z.enum([
  "website",
  "referral",
  "cold_call",
  "email_campaign",
  "social_media",
  "portal",
  "other",
] as const satisfies readonly [LeadSource, ...LeadSource[]]);

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "lost",
  "converted",
] as const satisfies readonly [LeadStatus, ...LeadStatus[]]);

// ---------------------------------------------------------------------------
// Create schema — used when capturing a new lead.
// email is optional/nullable: leads may arrive via non-email channels.
// When email IS provided it must pass format validation.
// ---------------------------------------------------------------------------

export const createLeadSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must be 100 characters or fewer"),

  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name must be 100 characters or fewer"),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required")
    .max(255, "Email must be 255 characters or fewer")
    .nullable()
    .optional(),

  phone: z
    .string()
    .trim()
    .max(30, "Phone must be 30 characters or fewer")
    .nullable()
    .optional(),

  company_name: z
    .string()
    .trim()
    .min(1)
    .max(255, "Company name must be 255 characters or fewer")
    .nullable()
    .optional(),

  source: leadSourceSchema.default("other"),

  status: leadStatusSchema.default("new"),

  score: z
    .number()
    .int("Score must be a whole number")
    .min(0, "Score must be between 0 and 100")
    .max(100, "Score must be between 0 and 100")
    .nullable()
    .optional(),

  notes: z.string().nullable().optional(),

  owner_id: z
    .string()
    .uuid("owner_id must be a valid UUID")
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Update schema — all fields optional; the same field-level constraints apply.
// organization_id is also absent here: leads cannot be moved between tenants.
// ---------------------------------------------------------------------------

export const updateLeadSchema = createLeadSchema.partial();

// ---------------------------------------------------------------------------
// Inferred TypeScript types (for use in server functions and tests)
// ---------------------------------------------------------------------------

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
