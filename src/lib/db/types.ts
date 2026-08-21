/**
 * Database type definitions.
 *
 * In a real project these types are generated from the live Supabase schema:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/db/types.ts
 *
 * The types here are hand-written to match the migrations in
 * supabase/migrations/:
 *   20260819000001_foundation.sql
 *   20260819000002_fix_organization_members_rls.sql
 *   20260819000003_leads.sql
 *   20260820000001_lead_activities.sql
 *   20260820000002_conversations.sql
 *   20260820000003_lead_follow_ups.sql
 *   20260820000004_appointments.sql
 *   20260820000005_lead_activity_types.sql
 *   20260820000006_ai_message_authorship.sql
 *
 * Re-generate (or update manually) whenever the schema changes.
 */

// ---------------------------------------------------------------------------
// Enum value types
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "admin" | "agent";

export type LeadSource =
  | "website"
  | "referral"
  | "cold_call"
  | "email_campaign"
  | "social_media"
  | "portal"
  | "other";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "unqualified"
  | "lost"
  | "converted";

export type LeadActivityType =
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "status_change"
  | "conversation"
  | "follow_up"
  | "appointment"
  | "ai";

export type ConversationChannel = "in_app";

export type ConversationStatus = "open" | "closed";

export type MessageDirection = "inbound" | "outbound";

export type MessageAuthorType = "human" | "ai" | "system";

export type LeadFollowUpStatus = "pending" | "completed" | "cancelled";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

// ---------------------------------------------------------------------------
// Database interface (used to type the Supabase client)
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: MemberRole;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: MemberRole;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: MemberRole;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          company_name: string | null;
          source: LeadSource;
          status: LeadStatus;
          score: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          owner_id?: string | null;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          company_name?: string | null;
          source?: LeadSource;
          status?: LeadStatus;
          score?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          owner_id?: string | null;
          first_name?: string;
          last_name?: string;
          email?: string | null;
          phone?: string | null;
          company_name?: string | null;
          source?: LeadSource;
          status?: LeadStatus;
          score?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      /**
       * lead_activities — append-only CRM timeline entries.
       * No UPDATE policy exists; activities are immutable once written.
       * The Update type is defined for type-system completeness only.
       */
      lead_activities: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          user_id: string | null;
          type: LeadActivityType;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          user_id?: string | null;
          type: LeadActivityType;
          content: string;
          created_at?: string;
        };
        /** Activities are append-only; this type exists for schema completeness. */
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string;
          user_id?: string | null;
          type?: LeadActivityType;
          content?: string;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          channel: ConversationChannel;
          status: ConversationStatus;
          requires_human: boolean;
          ai_paused_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          channel?: ConversationChannel;
          status?: ConversationStatus;
          requires_human?: boolean;
          ai_paused_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string;
          channel?: ConversationChannel;
          status?: ConversationStatus;
          requires_human?: boolean;
          ai_paused_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      /**
       * messages — append-only conversation utterances.
       * No UPDATE policy exists; messages are immutable once written.
       * The Update type is defined for type-system completeness only.
       */
      messages: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          author_user_id: string | null;
          author_type: MessageAuthorType;
          direction: MessageDirection;
          body: string;
          in_reply_to_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          author_user_id?: string | null;
          author_type?: MessageAuthorType;
          direction: MessageDirection;
          body: string;
          in_reply_to_message_id?: string | null;
          created_at?: string;
        };
        /** Messages are append-only; this type exists for schema completeness. */
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          author_user_id?: string | null;
          author_type?: MessageAuthorType;
          direction?: MessageDirection;
          body?: string;
          in_reply_to_message_id?: string | null;
          created_at?: string;
        };
      };
      lead_follow_ups: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          assigned_user_id: string | null;
          title: string;
          notes: string | null;
          due_at: string;
          status: LeadFollowUpStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          assigned_user_id?: string | null;
          title: string;
          notes?: string | null;
          due_at: string;
          status?: LeadFollowUpStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string;
          assigned_user_id?: string | null;
          title?: string;
          notes?: string | null;
          due_at?: string;
          status?: LeadFollowUpStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          assigned_user_id: string | null;
          starts_at: string;
          ends_at: string | null;
          status: AppointmentStatus;
          location: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          assigned_user_id?: string | null;
          starts_at: string;
          ends_at?: string | null;
          status?: AppointmentStatus;
          location?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string;
          assigned_user_id?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          status?: AppointmentStatus;
          location?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { p_organization_id: string; p_user_id?: string };
        Returns: boolean;
      };
      get_org_role: {
        Args: { p_organization_id: string; p_user_id?: string };
        Returns: MemberRole | null;
      };
      auth_user_role_in_org: {
        Args: { p_organization_id: string };
        Returns: MemberRole | null;
      };
    };
    Enums: {
      member_role: MemberRole;
      lead_source: LeadSource;
      lead_status: LeadStatus;
      lead_activity_type: LeadActivityType;
      conversation_channel: ConversationChannel;
      conversation_status: ConversationStatus;
      message_direction: MessageDirection;
      message_author_type: MessageAuthorType;
      lead_follow_up_status: LeadFollowUpStatus;
      appointment_status: AppointmentStatus;
    };
  };
}

// ---------------------------------------------------------------------------
// Convenience row types
// ---------------------------------------------------------------------------

export type Organization =
  Database["public"]["Tables"]["organizations"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type OrganizationMember =
  Database["public"]["Tables"]["organization_members"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadActivity =
  Database["public"]["Tables"]["lead_activities"]["Row"];
export type Conversation =
  Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type LeadFollowUp =
  Database["public"]["Tables"]["lead_follow_ups"]["Row"];
export type Appointment =
  Database["public"]["Tables"]["appointments"]["Row"];

// ---------------------------------------------------------------------------
// Composite / join shapes
// ---------------------------------------------------------------------------

/** Organization row augmented with the requesting user's membership role. */
export interface OrganizationWithRole extends Organization {
  role: MemberRole;
}

/** Minimal lead fields embedded on conversation API responses for inbox display. */
export interface ConversationLeadSummary {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
}

/** Conversation row with the parent lead's display fields. */
export interface ConversationWithLead extends Conversation {
  lead: ConversationLeadSummary | null;
}

/** Follow-up row with the parent lead's display fields (org-wide queue). */
export interface LeadFollowUpWithLead extends LeadFollowUp {
  lead: ConversationLeadSummary | null;
}

/** Appointment row with the parent lead's display fields (org-wide queue). */
export interface AppointmentWithLead extends Appointment {
  lead: ConversationLeadSummary | null;
}
