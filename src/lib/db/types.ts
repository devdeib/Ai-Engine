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
 *   20260822000001_ai_execution_jobs.sql
 *   20260822000002_ai_tool_actions.sql
 *   20260822000003_ai_sales_analyses.sql
 *   20260822000004_ai_sales_recommendations.sql
 *   20260827000001_channel_enums.sql
 *   20260827000002_channel_substrate.sql
 *   20260827000003_channel_reliability.sql
 *   20260827000004_external_channel_generalization.sql
 *   20260827000005_whatsapp_channel.sql
 *   20260827000006_email_channel.sql
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

export type ConversationChannel = "in_app" | "test" | "whatsapp" | "email";

export type ConversationStatus = "open" | "closed";

export type MessageDirection = "inbound" | "outbound";

export type MessageAuthorType = "human" | "ai" | "system" | "customer";

export type LeadFollowUpStatus = "pending" | "completed" | "cancelled";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export type AiExecutionJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type AiToolActionTrust = "autonomous" | "human_approval";

export type AiToolActionStatus =
  | "pending"
  | "executing"
  | "executed"
  | "rejected"
  | "expired"
  | "failed";

export type AiToolActionToolName = "create_follow_up" | "create_appointment";

export type AiToolActionResourceType = "lead_follow_up" | "appointment";

export type AiSalesAnalysisStatus = "recorded" | "failed";

export type AiSalesRecommendationStatus = "recorded" | "failed";

export type AiSalesRecommendationAction =
  | "ask_qualification_question"
  | "provide_information"
  | "suggest_follow_up"
  | "suggest_appointment_approval"
  | "suggest_human_handoff"
  | "wait_for_customer"
  | "defer_existing_control";

export type AiSalesRecommendationMappedTool =
  | "create_follow_up"
  | "create_appointment";

export type ChannelKind = "test" | "whatsapp" | "email";

export type ChannelAccountStatus = "active" | "paused" | "disabled";

export type AiExecutionTriggerSource = "operator" | "channel_ingress";

export type ChannelMessageDirection = "inbound" | "outbound";

export type ChannelDeliveryStatus =
  | "not_applicable"
  | "queued"
  | "sent"
  | "delivered"
  | "failed";

export type ChannelDeliveryJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

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
          channel_account_id: string | null;
          channel_identity_id: string | null;
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
          channel_account_id?: string | null;
          channel_identity_id?: string | null;
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
          channel_account_id?: string | null;
          channel_identity_id?: string | null;
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
          channel_identity_id: string | null;
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
          channel_identity_id?: string | null;
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
          channel_identity_id?: string | null;
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
          idempotency_key?: string | null;
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
          idempotency_key?: string | null;
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
          idempotency_key?: string | null;
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
          idempotency_key?: string | null;
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
          idempotency_key?: string | null;
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
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_execution_jobs: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          inbound_message_id: string;
          requested_by_user_id: string | null;
          trigger_source: AiExecutionTriggerSource;
          channel_identity_id: string | null;
          status: AiExecutionJobStatus;
          attempt_count: number;
          max_attempts: number;
          available_at: string;
          locked_at: string | null;
          last_error_code: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          inbound_message_id: string;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          status?: AiExecutionJobStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          inbound_message_id?: string;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          status?: AiExecutionJobStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
      };
      ai_tool_actions: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          tool_name: AiToolActionToolName;
          trust: AiToolActionTrust;
          status: AiToolActionStatus;
          input_hash: string;
          payload: Record<string, unknown>;
          result_summary: Record<string, unknown> | null;
          result_resource_type: AiToolActionResourceType | null;
          result_resource_id: string | null;
          requested_by_user_id: string | null;
          approved_by_user_id: string | null;
          trigger_source: AiExecutionTriggerSource;
          channel_identity_id: string | null;
          decided_at: string | null;
          executed_at: string | null;
          expires_at: string | null;
          error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          tool_name: AiToolActionToolName;
          trust: AiToolActionTrust;
          status: AiToolActionStatus;
          input_hash: string;
          payload: Record<string, unknown>;
          result_summary?: Record<string, unknown> | null;
          result_resource_type?: AiToolActionResourceType | null;
          result_resource_id?: string | null;
          requested_by_user_id?: string | null;
          approved_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          decided_at?: string | null;
          executed_at?: string | null;
          expires_at?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          lead_id?: string;
          inbound_message_id?: string;
          tool_name?: AiToolActionToolName;
          trust?: AiToolActionTrust;
          status?: AiToolActionStatus;
          input_hash?: string;
          payload?: Record<string, unknown>;
          result_summary?: Record<string, unknown> | null;
          result_resource_type?: AiToolActionResourceType | null;
          result_resource_id?: string | null;
          requested_by_user_id?: string | null;
          approved_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          decided_at?: string | null;
          executed_at?: string | null;
          expires_at?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_sales_analyses: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          inbound_message_created_at: string;
          schema_version: string;
          prompt_version: string;
          provider_name: string;
          status: AiSalesAnalysisStatus;
          payload: Record<string, unknown>;
          pipeline_snapshot: Record<string, unknown>;
          error_code: string | null;
          requested_by_user_id: string | null;
          trigger_source: AiExecutionTriggerSource;
          channel_identity_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          inbound_message_created_at: string;
          schema_version: string;
          prompt_version: string;
          provider_name: string;
          status: AiSalesAnalysisStatus;
          payload: Record<string, unknown>;
          pipeline_snapshot: Record<string, unknown>;
          error_code?: string | null;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          lead_id?: string;
          inbound_message_id?: string;
          inbound_message_created_at?: string;
          schema_version?: string;
          prompt_version?: string;
          provider_name?: string;
          status?: AiSalesAnalysisStatus;
          payload?: Record<string, unknown>;
          pipeline_snapshot?: Record<string, unknown>;
          error_code?: string | null;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_sales_recommendations: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          inbound_message_created_at: string;
          analysis_id: string | null;
          policy_version: string;
          status: AiSalesRecommendationStatus;
          recommended_action: AiSalesRecommendationAction;
          cited_analysis_action: string | null;
          requires_human_approval: boolean;
          mapped_tool_name: AiSalesRecommendationMappedTool | null;
          reason_codes: string[];
          pipeline_snapshot: Record<string, unknown>;
          error_code: string | null;
          requested_by_user_id: string | null;
          trigger_source: AiExecutionTriggerSource;
          channel_identity_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          lead_id: string;
          inbound_message_id: string;
          inbound_message_created_at: string;
          analysis_id?: string | null;
          policy_version: string;
          status: AiSalesRecommendationStatus;
          recommended_action: AiSalesRecommendationAction;
          cited_analysis_action?: string | null;
          requires_human_approval: boolean;
          mapped_tool_name?: AiSalesRecommendationMappedTool | null;
          reason_codes: string[];
          pipeline_snapshot: Record<string, unknown>;
          error_code?: string | null;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          lead_id?: string;
          inbound_message_id?: string;
          inbound_message_created_at?: string;
          analysis_id?: string | null;
          policy_version?: string;
          status?: AiSalesRecommendationStatus;
          recommended_action?: AiSalesRecommendationAction;
          cited_analysis_action?: string | null;
          requires_human_approval?: boolean;
          mapped_tool_name?: AiSalesRecommendationMappedTool | null;
          reason_codes?: string[];
          pipeline_snapshot?: Record<string, unknown>;
          error_code?: string | null;
          requested_by_user_id?: string | null;
          trigger_source?: AiExecutionTriggerSource;
          channel_identity_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      channel_accounts: {
        Row: {
          id: string;
          organization_id: string;
          channel: ChannelKind;
          status: ChannelAccountStatus;
          provider_destination_id: string;
          created_by_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          channel: ChannelKind;
          status?: ChannelAccountStatus;
          provider_destination_id: string;
          created_by_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          channel?: ChannelKind;
          status?: ChannelAccountStatus;
          provider_destination_id?: string;
          created_by_user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      channel_account_secrets: {
        Row: {
          channel_account_id: string;
          organization_id: string;
          webhook_secret: string;
          provider_access_token: string | null;
          webhook_verify_token: string | null;
          created_at: string;
        };
        Insert: {
          channel_account_id: string;
          organization_id: string;
          webhook_secret: string;
          provider_access_token?: string | null;
          webhook_verify_token?: string | null;
          created_at?: string;
        };
        Update: {
          channel_account_id?: string;
          organization_id?: string;
          webhook_secret?: string;
          provider_access_token?: string | null;
          webhook_verify_token?: string | null;
          created_at?: string;
        };
      };
      channel_identities: {
        Row: {
          id: string;
          organization_id: string;
          channel_account_id: string;
          external_address: string;
          lead_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          channel_account_id: string;
          external_address: string;
          lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          channel_account_id?: string;
          external_address?: string;
          lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      channel_message_refs: {
        Row: {
          id: string;
          organization_id: string;
          message_id: string;
          channel_account_id: string;
          channel_identity_id: string;
          direction: ChannelMessageDirection;
          provider_message_id: string | null;
          provider_thread_id: string | null;
          delivery_status: ChannelDeliveryStatus;
          delivered_at: string | null;
          failed_at: string | null;
          provider_error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          message_id: string;
          channel_account_id: string;
          channel_identity_id: string;
          direction: ChannelMessageDirection;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          delivery_status: ChannelDeliveryStatus;
          delivered_at?: string | null;
          failed_at?: string | null;
          provider_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          message_id?: string;
          channel_account_id?: string;
          channel_identity_id?: string;
          direction?: ChannelMessageDirection;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          delivery_status?: ChannelDeliveryStatus;
          delivered_at?: string | null;
          failed_at?: string | null;
          provider_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      channel_delivery_jobs: {
        Row: {
          id: string;
          organization_id: string;
          channel_account_id: string;
          message_id: string;
          status: ChannelDeliveryJobStatus;
          attempt_count: number;
          max_attempts: number;
          available_at: string;
          locked_at: string | null;
          last_error_code: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          channel_account_id: string;
          message_id: string;
          status?: ChannelDeliveryJobStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          channel_account_id?: string;
          message_id?: string;
          status?: ChannelDeliveryJobStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
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
      claim_ai_execution_jobs: {
        Args: {
          p_limit?: number;
          p_organization_id?: string | null;
          p_lease_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["ai_execution_jobs"]["Row"][];
      };
      claim_channel_delivery_jobs: {
        Args: {
          p_limit?: number;
          p_organization_id?: string | null;
          p_lease_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["channel_delivery_jobs"]["Row"][];
      };
      persist_channel_inbound: {
        Args: {
          p_organization_id: string;
          p_conversation_id: string;
          p_channel_account_id: string;
          p_channel_identity_id: string;
          p_provider_message_id: string;
          p_body: string;
        };
        Returns: {
          message_id: string;
          conversation_id: string;
          channel_identity_id: string;
          created: boolean;
        }[];
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
      ai_execution_job_status: AiExecutionJobStatus;
      ai_tool_action_trust: AiToolActionTrust;
      ai_tool_action_status: AiToolActionStatus;
      ai_sales_analysis_status: AiSalesAnalysisStatus;
      ai_sales_recommendation_status: AiSalesRecommendationStatus;
      ai_sales_recommendation_action: AiSalesRecommendationAction;
      channel_account_status: ChannelAccountStatus;
      channel_kind: ChannelKind;
      ai_execution_trigger_source: AiExecutionTriggerSource;
      channel_message_direction: ChannelMessageDirection;
      channel_delivery_status: ChannelDeliveryStatus;
      channel_delivery_job_status: ChannelDeliveryJobStatus;
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
export type AiExecutionJob =
  Database["public"]["Tables"]["ai_execution_jobs"]["Row"];
export type AiToolAction =
  Database["public"]["Tables"]["ai_tool_actions"]["Row"];
export type AiSalesAnalysis =
  Database["public"]["Tables"]["ai_sales_analyses"]["Row"];
export type AiSalesRecommendation =
  Database["public"]["Tables"]["ai_sales_recommendations"]["Row"];
export type ChannelAccount =
  Database["public"]["Tables"]["channel_accounts"]["Row"];
export type ChannelAccountSecret =
  Database["public"]["Tables"]["channel_account_secrets"]["Row"];
export type ChannelIdentity =
  Database["public"]["Tables"]["channel_identities"]["Row"];
export type ChannelMessageRef =
  Database["public"]["Tables"]["channel_message_refs"]["Row"];
export type ChannelDeliveryJob =
  Database["public"]["Tables"]["channel_delivery_jobs"]["Row"];

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

/** AI tool action with parent lead display fields for approval queues. */
export interface AiToolActionWithLead extends AiToolAction {
  lead: ConversationLeadSummary | null;
}
