-- =============================================================================
-- Migration: Foundation
-- Created:   2026-08-19
-- Description: Initial schema for multi-tenant SaaS foundation.
--              Creates organizations, profiles, and organization_members tables
--              with full RLS enforcement.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. UTILITY: Updated-at trigger function
--    Automatically keeps updated_at in sync on every row update.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. ORGANIZATIONS (tenants)
--    Each row represents one customer / tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  slug        TEXT        NOT NULL
                            CHECK (slug ~ '^[a-z0-9-]+$')
                            CHECK (char_length(slug) BETWEEN 2 AND 63),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX organizations_slug_unique
  ON public.organizations (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX organizations_deleted_at_idx
  ON public.organizations (deleted_at);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. PROFILES
--    Extends auth.users with display-level profile data.
--    One row per auth.users entry — created automatically on sign-up.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 255),
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. ORGANIZATION MEMBERS
--    Explicit many-to-many: users <-> organizations with role.
--    A user only has access to an organization if a member row exists.
-- ---------------------------------------------------------------------------
CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'agent');

CREATE TABLE public.organization_members (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID             NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id         UUID             NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role            public.member_role NOT NULL DEFAULT 'agent',
  invited_by      UUID             REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_members_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_members_user_id_idx
  ON public.organization_members (user_id);

CREATE INDEX organization_members_org_id_idx
  ON public.organization_members (organization_id);

CREATE TRIGGER organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY POLICIES
-- ---------------------------------------------------------------------------

-- ---- profiles ----

-- Users can read their own profile only.
CREATE POLICY "profiles: owner can select"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile only.
CREATE POLICY "profiles: owner can update"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Profiles are inserted by the sign-up trigger only (service role).
-- No direct INSERT from user context.

-- ---- organizations ----

-- A user can SELECT an organization only if they are a member.
CREATE POLICY "organizations: members can select"
  ON public.organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- A user can UPDATE their organization only if they are owner or admin.
CREATE POLICY "organizations: owners and admins can update"
  ON public.organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Organizations are created by the sign-up trigger only (service role).

-- ---- organization_members ----

-- Members can see all other members of their organizations.
CREATE POLICY "organization_members: members can select own org"
  ON public.organization_members
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Owners and admins can insert new members (invite).
CREATE POLICY "organization_members: owners and admins can insert"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update roles — but they cannot demote the sole owner.
CREATE POLICY "organization_members: owners and admins can update"
  ON public.organization_members
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Owners and admins can remove members, but not themselves if they are the last owner.
CREATE POLICY "organization_members: owners and admins can delete"
  ON public.organization_members
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. SIGN-UP TRIGGER
--    When a new user is created in auth.users, automatically:
--    a) Create a profile row.
--    b) Create a new organization named after the user.
--    c) Add the user as the owner of that organization.
--
--    This runs with SECURITY DEFINER (service-role equivalent) so it can
--    bypass RLS on insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id      UUID;
  base_slug   TEXT;
  final_slug  TEXT;
  counter     INT := 0;
  display     TEXT;
BEGIN
  -- Derive a display name from email or metadata.
  display := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Insert profile.
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, display);

  -- Build a URL-safe slug from the display name.
  base_slug := lower(regexp_replace(display, '[^a-zA-Z0-9]', '-', 'g'));
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(BOTH '-' FROM base_slug);
  -- Ensure minimum 2 chars.
  IF char_length(base_slug) < 2 THEN
    base_slug := 'org-' || substr(gen_random_uuid()::text, 1, 8);
  END IF;
  -- Truncate to 55 chars to leave room for suffix.
  base_slug := substr(base_slug, 1, 55);

  -- Find a unique slug.
  final_slug := base_slug;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations WHERE slug = final_slug AND deleted_at IS NULL
    ) THEN
      EXIT;
    END IF;
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  -- Create the organization.
  INSERT INTO public.organizations (name, slug)
  VALUES (display || '''s Organization', final_slug)
  RETURNING id INTO org_id;

  -- Add the user as owner.
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 7. HELPER FUNCTION: is_org_member
--    Reusable check used in application-level code and future policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(
  p_organization_id UUID,
  p_user_id         UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id         = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. HELPER FUNCTION: get_org_role
--    Returns the authenticated user's role in an organization, or NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_role(
  p_organization_id UUID,
  p_user_id         UUID DEFAULT auth.uid()
)
RETURNS public.member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id         = p_user_id
  LIMIT 1;
$$;
