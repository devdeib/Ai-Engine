/**
 * Zod schemas for the organization sales profile.
 *
 * organization_id is NEVER accepted from the client. It comes from the
 * verified URL/session context. Extra keys (including customSystemPrompt)
 * are stripped — this is not a free-form prompt field.
 */
import { z } from "zod";

export const OFFERING_SUMMARY_MAX = 2000;
export const SERVICE_AREA_MAX = 1000;
export const QUALIFICATION_CRITERIA_MAX = 2000;
export const CONSTRAINTS_MAX = 2000;
export const TYPICAL_NEXT_STEP_MAX = 500;

function optionalProfileText(max: number, label: string) {
  return z
    .union([
      z
        .string()
        .trim()
        .max(max, `${label} must be ${max} characters or fewer`)
        .transform((value) => (value === "" ? null : value)),
      z.null(),
    ])
    .optional();
}

export const updateOrganizationSalesProfileSchema = z.object({
  offering_summary: optionalProfileText(OFFERING_SUMMARY_MAX, "Offering summary"),
  service_area: optionalProfileText(SERVICE_AREA_MAX, "Service area"),
  qualification_criteria: optionalProfileText(
    QUALIFICATION_CRITERIA_MAX,
    "Qualification criteria"
  ),
  constraints: optionalProfileText(CONSTRAINTS_MAX, "Constraints"),
  typical_next_step: optionalProfileText(
    TYPICAL_NEXT_STEP_MAX,
    "Typical next step"
  ),
});

export type UpdateOrganizationSalesProfileInput = z.infer<
  typeof updateOrganizationSalesProfileSchema
>;

export interface OrganizationSalesProfilePublic {
  offering_summary: string | null;
  service_area: string | null;
  qualification_criteria: string | null;
  constraints: string | null;
  typical_next_step: string | null;
}

export function emptyOrganizationSalesProfile(): OrganizationSalesProfilePublic {
  return {
    offering_summary: null,
    service_area: null,
    qualification_criteria: null,
    constraints: null,
    typical_next_step: null,
  };
}