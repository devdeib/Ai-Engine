# PROJECT_STATUS.md — Virtual Gravity AI Sales Engine

> **Live status (2026-08-27): Phase 5.3A Email contract/scaffold.**
> WhatsApp Cloud API is text-only. Email is structurally registered (Resend)
> but live send/receive HTTP is Phase 5.3B. SMS, media, templates, and receipts
> are not implemented. Channel delivery is at-least-once (not exactly-once).
> The numbered sections below are the original pre-initialization snapshot and
> are not a live inventory of the repository.

> Last updated: 2026-08-27
> Phase: 5.3A (Email contract + adapter scaffold)

---

## 1. Current Repository State

| Property            | Value                                  |
|---------------------|----------------------------------------|
| Repository type     | Not initialized (no `.git` directory)  |
| Files in workspace  | 0 (completely empty before this run)   |
| Git history         | None                                   |
| Remote              | None configured                        |
| Framework           | None installed                         |
| Package manager     | None detected                          |
| Lock file           | None                                   |
| Dependencies        | None                                   |

**Assessment:** The workspace directory exists on disk but contains no code, no configuration, no Git repository, and no scaffolding of any kind. This is a **clean slate**.

---

## 2. Existing Technology Stack

None. The stack below is **proposed**, not yet installed or configured.

---

## 3. Existing Infrastructure

| Service       | Status                        |
|---------------|-------------------------------|
| Supabase      | Not configured                |
| Vercel        | Not configured                |
| CI/CD         | Not configured                |
| Domain/DNS    | Not configured                |
| Environment   | No `.env` or `.env.local` file|

---

## 4. Existing Functionality

None. No application code exists.

---

## 5. Missing Functionality (Full Product Scope)

Everything. The following is the complete product backlog at this point:

### Foundation (Phase 1 — Must-Have Before Anything Else)
- [ ] Git repository initialization and `.gitignore`
- [ ] Next.js project scaffold with TypeScript, App Router, strict mode
- [ ] ESLint + Prettier configuration
- [ ] Supabase project creation and local dev setup
- [ ] Database schema: `organizations`, `users`, `organization_members`
- [ ] Supabase Auth integration (email/password + invite flow)
- [ ] Multi-tenancy middleware (organization resolution per request)
- [ ] Row-Level Security policies on all tenant tables
- [ ] Environment variable management (`.env.example`)
- [ ] Deployment pipeline to Vercel

### Core CRM (Phase 2)
- [ ] Lead management (create, list, view, update, delete)
- [ ] Property management (create, list, view, update, delete)
- [ ] Lead–property matching (manual initially)
- [ ] Lead status and pipeline stages
- [ ] Basic lead scoring (rule-based initially)

### Sales Automation (Phase 3)
- [ ] Conversation tracking (log messages against a lead)
- [ ] Follow-up scheduling and reminders
- [ ] Appointment scheduling

### AI Layer (Phase 4)
- [ ] LLM provider abstraction
- [ ] AI tool definitions (read lead, update lead, send message, schedule appointment)
- [ ] AI sales agent per conversation
- [ ] Human handoff mechanism
- [ ] Website chat widget

### Communication Channels (Phase 5)
- [ ] Email integration
- [x] WhatsApp integration (Business API) — Phase 5.2B text-only Cloud API. Media, templates, receipts, and SMS are out of scope.
- [ ] Email integration — Phase 5.3A locked Resend contract + scaffold; live send/receive is 5.3B.

### Analytics & Billing (Phase 6)
- [ ] Analytics dashboard (leads funnel, conversion rates, agent performance)
- [ ] Usage tracking per tenant
- [ ] Billing integration (Stripe)
- [ ] Subscription plan enforcement

### Integrations (Phase 7)
- [ ] External CRM integrations (e.g. HubSpot, Salesforce)
- [ ] Webhook system for outbound events

---

## 6. Potential Technical Risks

### Critical
| Risk | Description | Mitigation |
|------|-------------|------------|
| **Tenant data leakage** | A missing `organization_id` filter could expose one tenant's data to another. | RLS on every table + application-layer authorization checks + automated cross-tenant tests. |
| **RLS misconfiguration** | Supabase RLS is powerful but easy to misconfigure, especially with complex joins. | Dedicated test suite for RLS policies; staging environment mirrors production RLS. |
| **AI tool scope creep** | An AI agent given broad permissions could take destructive actions. | Strict tool definitions, human-in-the-loop for sensitive operations, audit logging. |

### Medium
| Risk | Description | Mitigation |
|------|-------------|------------|
| **Supabase vendor lock-in** | Heavy use of Supabase-specific features makes migration costly. | Abstract the Supabase client behind a thin interface layer; avoid using raw Supabase RPC for all business logic. |
| **Next.js API route cold starts** | Vercel serverless functions have cold start latency that may affect AI response streaming. | Use Vercel's streaming response support; consider Edge Runtime for latency-sensitive routes. |
| **LLM cost overruns** | Uncapped AI usage per tenant could result in unexpected costs. | Per-tenant token budgets, usage tracking, and hard limits enforced before LLM calls. |
| **Type safety drift** | Manually maintained TypeScript types that fall out of sync with the database schema. | Use Supabase CLI to auto-generate TypeScript types from the live schema. |

### Low
| Risk | Description | Mitigation |
|------|-------------|------------|
| **WhatsApp Business API approval** | Meta's approval process for WhatsApp Business API can take weeks. | Begin application early; plan the integration phase with adequate lead time. |
| **Email deliverability** | Transactional emails from a new domain may land in spam. | Use a reputable ESP (e.g. Resend, SendGrid) with proper SPF/DKIM/DMARC from day one. |

---

## 7. Recommended Next Implementation Phase

### Phase 1: Foundation
**Goal:** A working, deployable, multi-tenant Next.js application with authentication and an empty but structurally correct database.

**Scope:**
1. Initialize Git repository with `.gitignore` and initial commit.
2. Scaffold Next.js 14+ with TypeScript (strict), App Router, Tailwind CSS.
3. Configure ESLint, Prettier, and `tsconfig.json` with path aliases.
4. Create a Supabase project (local dev + hosted).
5. Define and migrate initial database schema:
   - `organizations` table
   - `users` (managed by Supabase Auth)
   - `organization_members` table (role-based: owner, admin, agent)
6. Implement Supabase Auth:
   - Sign-up (creates organization + owner member)
   - Sign-in
   - Session management (middleware)
   - Invite team member flow
7. Implement tenant resolution middleware (resolves `organization_id` from session on every request).
8. Write RLS policies for all three initial tables.
9. Create a minimal authenticated dashboard shell (no real functionality yet).
10. Configure Vercel deployment with environment variables.
11. Document `.env.example` with all required variables.

**Definition of Done for Phase 1:** A logged-in user can create an organization, invite a team member, and access a protected dashboard. No user can access another organization's data. The application deploys cleanly to Vercel.

**Estimated output:** ~15–25 files, ~800–1200 lines of application code.

---

*This document will be updated at the start and end of each implementation phase.*
