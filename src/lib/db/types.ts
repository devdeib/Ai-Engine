/**
 * Database type definitions.
 *
 * In a real project these types are generated from the live Supabase schema:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/db/types.ts
 *
 * The types here are hand-written to match the migration in
 * supabase/migrations/20260819000001_foundation.sql.
 * Re-generate this file whenever the schema changes.
 */

export type MemberRole = "owner" | "admin" | "agent";

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
    };
    Enums: {
      member_role: MemberRole;
    };
  };
}

// Convenience row types
export type Organization =
  Database["public"]["Tables"]["organizations"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type OrganizationMember =
  Database["public"]["Tables"]["organization_members"]["Row"];

// Organization with membership info (common join shape)
export interface OrganizationWithRole extends Organization {
  role: MemberRole;
}
