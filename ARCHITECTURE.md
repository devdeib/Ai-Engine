# ARCHITECTURE.md — Virtual Gravity AI Sales Engine

> Version: 0.1 (Pre-initialization)
> Last updated: 2026-08-19
> Status: Proposed — not yet implemented

---

## 1. Overview

Virtual Gravity AI Sales Engine is a multi-tenant SaaS application. The architecture is intentionally simple at launch: a single Next.js application handles both the frontend and the backend API, backed by Supabase for the database, authentication, and storage, and deployed on Vercel.

Complexity is deferred until it is earned by a concrete operational need.

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────┐
│                   Vercel (CDN + Serverless)              │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │             Next.js Application                 │   │
│   │                                                 │   │
│   │  ┌──────────────┐   ┌────────────────────────┐  │   │
│   │  │   App Router │   │   API Routes /api/v1/  │  │   │
│   │  │   (RSC/SSR)  │   │   (Server-side only)   │  │   │
│   │  └──────────────┘   └────────────┬───────────┘  │   │
│   │                                  │              │   │
│   │  ┌───────────────────────────────▼────────────┐ │   │
│   │  │           Business Logic Layer             │ │   │
│   │  │   src/modules/<feature>/                   │ │   │
│   │  └───────────────────────────────┬────────────┘ │   │
│   │                                  │              │   │
│   │  ┌───────────────────────────────▼────────────┐ │   │
│   │  │         Data Access Layer                  │ │   │
│   │  │   Supabase Client (typed, server-side)     │ │   │
│   │  └───────────────────────────────┬────────────┘ │   │
│   └──────────────────────────────────┼──────────────┘   │
└──────────────────────────────────────┼──────────────────┘
                                       │ PostgreSQL wire protocol
┌──────────────────────────────────────▼──────────────────┐
│                     Supabase                            │
│                                                         │
│  ┌────────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │   PostgreSQL   │  │   Auth    │  │    Storage    │  │
│  │   (+ RLS)      │  │ (JWT/PKCE)│  │  (files/imgs) │  │
│  └────────────────┘  └───────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Technology Choices

| Layer              | Technology                     | Rationale                                                    |
|--------------------|--------------------------------|--------------------------------------------------------------|
| Frontend           | Next.js 14+ (App Router)       | Full-stack capabilities, RSC, streaming, edge support        |
| Language           | TypeScript (strict)            | Type safety across the entire stack                          |
| Styling            | Tailwind CSS                   | Utility-first, fast iteration, consistent design system      |
| Database           | PostgreSQL via Supabase        | Managed, RLS, realtime, storage, auth in one platform        |
| Authentication     | Supabase Auth                  | JWT, PKCE, session management, invite flows                  |
| ORM / Query Layer  | Supabase JS client (typed)     | Auto-generated types from schema, RLS-aware                  |
| Validation         | Zod                            | Runtime schema validation, TypeScript inference              |
| Deployment         | Vercel                         | Zero-config Next.js deployment, edge network, previews       |
| Background Jobs    | Vercel Cron + API routes       | Sufficient for Phase 1–3; upgrade to a queue if needed       |
| Email              | Resend (planned, Phase 3)      | Developer-friendly transactional email with good deliverability |
| AI / LLM           | Provider abstraction (Phase 4) | Vendor-neutral; initial provider TBD                         |
| Payments           | Stripe (planned, Phase 6)      | Industry standard for SaaS billing                           |

---

## 3. Folder Structure

```
/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Auth routes (sign-in, sign-up, invite)
│   ├── (dashboard)/            # Protected dashboard routes
│   │   ├── layout.tsx          # Dashboard shell (sidebar, nav)
│   │   ├── leads/              # Lead management pages
│   │   ├── properties/         # Property management pages
│   │   ├── conversations/      # Conversation pages
│   │   └── settings/           # Org and user settings
│   ├── api/
│   │   └── v1/                 # REST API routes
│   │       ├── leads/
│   │       ├── properties/
│   │       ├── conversations/
│   │       └── ...
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Landing / redirect
│
├── src/
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Auth helpers, session, middleware
│   │   ├── organizations/      # Org creation, membership, RLS helpers
│   │   ├── leads/              # Lead business logic, types, DB queries
│   │   ├── properties/         # Property business logic, types, DB queries
│   │   ├── conversations/      # Conversation and message logic
│   │   └── ai/                 # AI agent, tools, provider abstraction (Phase 4)
│   │       ├── provider.ts     # LLM provider abstraction
│   │       ├── agent.ts        # Agent orchestration
│   │       └── tools/          # Individual tool definitions
│   │           ├── get-lead.ts
│   │           ├── update-lead.ts
│   │           └── ...
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # Browser Supabase client
│   │   │   ├── server.ts       # Server Supabase client (cookies)
│   │   │   └── admin.ts        # Service-role client (server-only, gated)
│   │   ├── db/
│   │   │   └── types.ts        # Auto-generated Supabase types (do not edit manually)
│   │   ├── validation/         # Shared Zod schemas
│   │   ├── errors.ts           # Application error types
│   │   ├── logger.ts           # Structured logger
│   │   └── utils.ts            # Shared utilities
│   └── components/
│       ├── ui/                 # Primitive UI components (buttons, inputs, etc.)
│       └── shared/             # Composed shared components
│
├── supabase/
│   ├── migrations/             # SQL migration files (never edit manually after apply)
│   ├── seed.sql                # Development seed data
│   └── config.toml             # Supabase local dev config
│
├── .env.example                # All required env vars (no values)
├── AGENTS.md                   # This project's engineering rules
├── ARCHITECTURE.md             # This file
├── PROJECT_STATUS.md           # Current implementation status
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.mjs
└── package.json
```

---

## 4. Multi-Tenancy Model

### Organization-per-tenant
Each customer is an **organization**. Every resource in the system (leads, properties, conversations, agents) belongs to exactly one organization.

```
organizations
    │
    ├── organization_members (users with roles)
    │
    ├── leads
    │     └── lead_activities
    │
    ├── properties
    │
    └── conversations
          └── messages
```

### Tenant Resolution
On every authenticated request:
1. Supabase Auth validates the JWT.
2. Middleware resolves the user's `organization_id` from the session or from the URL context.
3. The resolved `organization_id` is attached to the request context.
4. All database queries receive this `organization_id` as a filter parameter.
5. Supabase RLS enforces this at the database level as a second layer.

### Role Model (initial)
| Role    | Description                                         |
|---------|-----------------------------------------------------|
| `owner` | Full access; created the organization               |
| `admin` | Can manage team members and all resources           |
| `agent` | Can manage leads and conversations; no org settings |

---

## 5. Authentication Flow

```
Sign-up:
  User → POST /api/v1/auth/sign-up
       → Supabase Auth creates user
       → Trigger/server action creates organization + owner membership
       → Return session

Sign-in:
  User → POST /api/v1/auth/sign-in
       → Supabase Auth validates credentials
       → JWT issued with user ID
       → Middleware resolves organization membership on each request

Invite:
  Admin → POST /api/v1/organizations/[id]/invitations
        → Supabase Auth sends magic-link invite email
        → On accept: user created + member record created with role

Session Management:
  - JWT stored in httpOnly cookie (server-side session via Supabase SSR helpers)
  - Refresh handled automatically by Supabase client
  - Logout invalidates server-side session
```

---

## 6. API Design

All API routes live under `/api/v1/`.

### Conventions
- **Input**: JSON body, validated with Zod before any business logic.
- **Output**: `{ data: T }` on success, `{ error: { code, message } }` on failure.
- **Authentication**: All routes require a valid Supabase session (middleware).
- **Authorization**: All routes verify the user has the required role for the organization.

### Core Resource Routes (Phase 1–2)

```
POST   /api/v1/auth/sign-up
POST   /api/v1/auth/sign-in
POST   /api/v1/auth/sign-out

GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id
GET    /api/v1/organizations/:id/members
POST   /api/v1/organizations/:id/invitations
DELETE /api/v1/organizations/:id/members/:userId

GET    /api/v1/leads                  (paginated, filtered)
POST   /api/v1/leads
GET    /api/v1/leads/:id
PATCH  /api/v1/leads/:id
DELETE /api/v1/leads/:id

GET    /api/v1/properties             (paginated, filtered)
POST   /api/v1/properties
GET    /api/v1/properties/:id
PATCH  /api/v1/properties/:id
DELETE /api/v1/properties/:id
```

---

## 7. Database Schema (Initial — Phase 1)

```sql
-- Organizations (tenants)
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- Organization members (joins auth.users to organizations)
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- Row-Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- RLS: A user can only see organizations they are a member of
CREATE POLICY "members can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS: A user can only see their own memberships
CREATE POLICY "users can view their own memberships"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());
```

---

## 8. AI Architecture (Phase 4 — Not Yet Implemented)

> This section describes the intended design. No AI code exists yet.

### Principle: Tools, Not Queries
The AI agent cannot query the database directly. It can only call explicitly defined, schema-validated tools.

```
Conversation Message
       │
       ▼
  AI Agent (LLM)
       │
       ├── Tool: get_lead(leadId, organizationId)
       ├── Tool: update_lead_status(leadId, status, organizationId)
       ├── Tool: schedule_appointment(leadId, datetime, organizationId)
       ├── Tool: send_message(leadId, channel, message, organizationId)  ← human-in-the-loop
       └── Tool: escalate_to_human(leadId, reason, organizationId)
```

### Provider Abstraction
```typescript
// src/modules/ai/provider.ts
interface LLMProvider {
  chat(messages: Message[], tools: Tool[], options: LLMOptions): Promise<LLMResponse>;
}
```

All LLM calls go through this interface. The concrete implementation (OpenAI, Anthropic, etc.) is injected via environment variable and never referenced directly in feature code.

### Human Handoff
When the AI determines it cannot or should not proceed:
1. It calls the `escalate_to_human` tool.
2. The conversation is flagged in the database as `requires_human: true`.
3. The assigned agent is notified.
4. The AI stops responding until a human marks the conversation as resolved.

---

## 9. Deployment Architecture

```
GitHub (main branch)
       │
       │  push / PR merge
       ▼
   Vercel CI
       │
       ├── Build: next build
       ├── Type check: tsc --noEmit
       ├── Lint: eslint
       └── Tests: vitest
       │
       ▼
  Vercel Production
  (auto-scaled serverless functions + CDN)
       │
       │  connects to
       ▼
  Supabase (hosted)
  us-east-1 (region TBD based on customer geography)
```

### Environments

| Environment | Next.js         | Supabase             | Purpose                      |
|-------------|-----------------|----------------------|------------------------------|
| Local       | `localhost:3000` | Local Supabase CLI   | Development                  |
| Preview     | Vercel preview  | Staging Supabase     | PR review, QA                |
| Production  | Vercel prod     | Production Supabase  | Live customer traffic        |

---

## 10. Key Constraints and Decisions

| Decision | Rationale |
|----------|-----------|
| Single Next.js app (no separate backend) | Avoids operational overhead; sufficient for Phase 1–3 traffic |
| No message queue in Phase 1 | Vercel Cron + background functions are sufficient initially |
| Supabase Auth over custom JWT | Saves weeks of implementation; PKCE flow is secure and proven |
| Supabase-generated TypeScript types | Eliminates manual type maintenance; regenerated on each migration |
| Tailwind CSS over a component library | More control over design; avoids heavy bundle from full UI kits |
| No GraphQL | REST is simpler to reason about, audit, and secure for this use case |
| Zod for validation (not Yup or others) | Best TypeScript inference; isomorphic (client + server) |

---

## 11. Open Decisions (To Resolve Before Phase 1)

1. **Supabase region**: Choose based on where the majority of initial customers are located.
2. **LLM provider**: OpenAI GPT-4o vs Anthropic Claude vs other. Decision can be deferred to Phase 4 since the provider abstraction decouples it.
3. **Email service provider**: Resend is the current preference; confirm pricing at expected volume.
4. **UI component library**: Decide between raw Tailwind + Radix UI primitives vs shadcn/ui (which uses both). shadcn/ui is a reasonable default.
5. **Node.js version**: Pin to the LTS version supported by Vercel at project start (currently Node 20).
6. **Monorepo tooling**: Not needed yet; revisit if a separate mobile app or worker package is introduced.

---

*This document will be updated when architectural decisions are made or revised.*
