/**
 * Appointment domain queries — read-only.
 *
 * Security contract:
 * 1. organizationId + userId as explicit parameters.
 * 2. requireOrgMembership() first.
 * 3. Scope every query to organizationId.
 * 4. Cross-tenant IDs return NotFoundError.
 * 5. RLS is a second independent gate.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentWithLead,
  ConversationLeadSummary,
} from "@/lib/db/types";

export interface AppointmentsPagination {
  page: number;
  limit: number;
}

export interface AppointmentsFilter {
  status?: AppointmentStatus;
  assignedUserId?: string | "unassigned";
  leadId?: string;
  from?: string;
  to?: string;
}

export type AppointmentClient = Awaited<ReturnType<typeof createClient>>;

const APPOINTMENT_WITH_LEAD_SELECT = `
  *,
  lead:leads (
    id,
    first_name,
    last_name,
    company_name
  )
`;

export function toAppointmentWithLead(row: unknown): AppointmentWithLead {
  const raw = row as Appointment & { lead?: unknown };
  const embedded = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  let lead: ConversationLeadSummary | null = null;

  if (
    embedded &&
    typeof embedded === "object" &&
    "id" in embedded &&
    "first_name" in embedded &&
    "last_name" in embedded
  ) {
    const candidate = embedded as ConversationLeadSummary;
    lead = {
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      company_name: candidate.company_name ?? null,
    };
  }

  return { ...(raw as Appointment), lead };
}

export async function assertLeadInOrg(
  supabase: AppointmentClient,
  leadId: string,
  organizationId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }
}

export async function assertAppointmentInOrg(
  supabase: AppointmentClient,
  appointmentId: string,
  organizationId: string
): Promise<Appointment> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .select("*")
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Appointment");
  }

  return data as Appointment;
}

/**
 * Appointments for a single lead.
 * Ordered: starts_at ASC, then id ASC.
 */
export async function listLeadAppointments(
  organizationId: string,
  userId: string | null,
  leadId: string,
  pagination: AppointmentsPagination = { page: 1, limit: 20 }
): Promise<Appointment[]> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch appointments: ${error.message}`);
  }

  return (data ?? []) as Appointment[];
}

export async function getAppointment(
  organizationId: string,
  userId: string,
  appointmentId: string
): Promise<AppointmentWithLead> {
  await requireOrgMembership(organizationId, userId);
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .select(APPOINTMENT_WITH_LEAD_SELECT)
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Appointment");
  }

  return toAppointmentWithLead(data);
}

/**
 * Organization-wide appointment queue with optional filters.
 * Embeds minimal lead display fields to avoid N+1 fetches.
 * Ordered: status ASC (scheduled first via enum order), starts_at ASC, id ASC.
 */
export async function listAppointments(
  organizationId: string,
  userId: string,
  pagination: AppointmentsPagination = { page: 1, limit: 20 },
  filter: AppointmentsFilter = {}
): Promise<AppointmentWithLead[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("appointments")
    .select(APPOINTMENT_WITH_LEAD_SELECT)
    .eq("organization_id", organizationId);

  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  if (filter.leadId) {
    query = query.eq("lead_id", filter.leadId);
  }

  if (filter.assignedUserId === "unassigned") {
    query = query.is("assigned_user_id", null);
  } else if (filter.assignedUserId) {
    query = query.eq("assigned_user_id", filter.assignedUserId);
  }

  if (filter.from) {
    query = query.gte("starts_at", filter.from);
  }

  if (filter.to) {
    query = query.lte("starts_at", filter.to);
  }

  const { data, error } = (await query
    .order("status", { ascending: true })
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)) as {
    data: unknown[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to fetch appointments: ${error.message}`);
  }

  return (data ?? []).map(toAppointmentWithLead);
}
