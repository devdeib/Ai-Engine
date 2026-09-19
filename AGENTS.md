# AGENTS.md — Engineering Rules for Virtual Gravity AI Sales Engine

> This file is the authoritative engineering rulebook for this project.
> All contributors — human and AI — must read and follow these rules before writing any code.
> Rules here are permanent unless explicitly revised through a documented architecture decision.

---

## 1. Project Purpose

**Virtual Gravity AI Sales Engine** is a multi-tenant SaaS platform that helps real-estate companies capture, qualify, follow up with, and convert leads using an AI-powered sales system.

The initial vertical is **Real Estate**. The architecture must support additional verticals in the future without requiring structural rewrites.

---

## 2. Architecture Principles

- **Monorepo-first**: Keep frontend, backend API routes, and shared types in a single Next.js project until complexity justifiably demands separation.
- **No premature microservices**: Do not split into separate services until a concrete operational or scaling need is proven.
- **Server-side by default**: Prefer Next.js API routes and server actions over a separate backend until necessary.
- **Background workers only when required**: Introduce background job infrastructure (e.g. queues) only when a feature explicitly requires async processing that cannot happen in an API route.
- **Supabase as the primary data platform**: PostgreSQL (via Supabase), Supabase Auth, and Supabase Storage are the default choices for data, authentication, and file storage.
- **Vercel for deployment**: The web application deploys to Vercel. Do not introduce alternative hosting unless there is a justified, documented reason.
- **Provider abstraction for AI**: All LLM calls must go through a single provider abstraction layer. Never call an LLM SDK directly from feature code.
- **Explicit tool architecture for AI**: The AI agent must only interact with the database and external services through explicitly defined, validated tools. No unrestricted data access.

---

## 3. Coding Conventions

### Language and Framework
- **TypeScript only** — strict mode enabled (`"strict": true` in `tsconfig.json`). No `any` types without an explicit, commented justification.
- **Next.js App Router** — use the App Router (`app/` directory). Do not use the Pages Router for new code.
- **React Server Components by default** — only add `"use client"` when interactivity is genuinely required.

### File and Folder Structure
- Feature modules live under `src/modules/<feature>/` (e.g., `src/modules/leads/`, `src/modules/properties/`).
- Shared utilities live under `src/lib/`.
- Database access code lives under `src/lib/db/` or feature-scoped `<module>/db.ts` files.
- API route handlers live under `app/api/<resource>/`.
- All UI components live under `src/components/`.
- All types and interfaces must be explicitly exported and co-located with their module.

### Naming
- Files: `kebab-case`.
- React components: `PascalCase`.
- Functions and variables: `camelCase`.
- Database table and column names: `snake_case` (PostgreSQL convention).
- Environment variables: `SCREAMING_SNAKE_CASE`.

### Code Quality
- No dead code committed to the main branch.
- No `console.log` left in production code; use a structured logger.
- All async functions must handle errors explicitly — no unhandled promise rejections.
- No hard-coded secrets, connection strings, or API keys in source code.
- Imports must be organized: external packages first, then internal aliases, then relative paths.

---

## 4. Security Rules

- **No secrets in source code, ever.** All credentials must live in environment variables.
- **Never log sensitive data**: Do not log user PII, API keys, tokens, or database connection strings.
- **Validate all input server-side** using a schema validation library (Zod). Client-side validation is supplemental only.
- **Row-level security (RLS) is mandatory** on all Supabase tables that contain tenant data. No RLS bypass in application code except in explicitly guarded service-role operations.
- **Principle of least privilege**: Each service account, API key, and database role must have only the permissions it actually needs.
- **Never expose Supabase service-role keys to the client**. The `SUPABASE_SERVICE_ROLE_KEY` must only exist on the server.
- **CSRF protection** must be enabled on all mutating API endpoints.
- **Rate limiting** must be applied to public-facing endpoints before production launch.
- **Authentication required** on all non-public API routes. Unauthenticated requests return 401, not 403.
- **Authorization checked at the data layer**, not only at the route layer. A valid session does not imply access to all tenants' data.

---

## 5. Database Rules

- **PostgreSQL via Supabase** is the only allowed primary database.
- **All schema changes must be made through migrations** (`supabase/migrations/`). Never modify the database schema manually in production.
- **Every table that stores tenant data must have an `organization_id` column** of type `UUID NOT NULL` with a foreign key to the `organizations` table.
- **Row-Level Security (RLS) policies must be written for every tenant-scoped table** before that table is used in production.
- **No direct SQL from feature code.** All database access must go through a typed query layer (Supabase client with generated types, or a thin typed wrapper).
- **Soft deletes preferred** for user-created records (add `deleted_at TIMESTAMPTZ` rather than hard-deleting rows).
- **All tables must have**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- **Foreign keys must be explicit** — no orphaned references.
- **Indexes on all foreign key columns** and any column used in frequent WHERE clauses.
- **Never run raw migrations against the production database without a reviewed PR.**

---

## 6. Multi-Tenancy Rules

- **Tenant isolation is the most critical non-functional requirement.** A bug in tenant isolation is a critical security incident.
- **Every request that touches tenant data must verify the authenticated user belongs to the target organization** before any database operation.
- **Organization membership must be checked at the application layer**, not only enforced by RLS — defense in depth.
- **No shared mutable state between tenants** in memory, cache, or queue.
- **Tenant IDs must never be guessable** — use UUID v4 everywhere.
- **Impersonation** (admin accessing tenant data) must be explicitly logged and require a separate elevated permission, if ever implemented.
- **Data export or bulk operations** scoped to a tenant must always include the `organization_id` filter.

---

## 7. API Rules

- **REST conventions**: Use standard HTTP methods (GET, POST, PATCH, DELETE). No `POST /getUser` patterns.
- **All API responses must use consistent envelope shapes**:
  - Success: `{ data: T, meta?: object }`
  - Error: `{ error: { code: string, message: string, details?: unknown } }`
- **API routes must validate their input** with Zod before any business logic.
- **HTTP status codes must be accurate**: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Server Error.
- **Pagination is required** on all list endpoints. Default page size: 20, maximum: 100.
- **Never return passwords, tokens, or internal IDs** in API responses unless explicitly required by the operation.
- **API versioning**: Prefix routes with `/api/v1/`. Increment the version when a breaking change is required.

---

## 8. AI Safety Rules

- **The AI agent must never have direct, unrestricted access to the database.** All AI database interactions must go through explicitly defined tool functions.
- **Every AI tool must validate its input with a schema** before executing any operation.
- **Every AI tool must enforce tenant scope** — tools that read or write data must accept and verify the `organizationId` of the calling context.
- **Destructive operations** (delete, bulk update, send message) are **high-trust tools** and must require an additional human-in-the-loop confirmation step before execution.
- **The AI agent must not be able to escalate its own permissions.** Tool definitions are static and reviewed by engineers, not generated dynamically by the AI.
- **Human handoff is mandatory** for: contract generation, payment processing, complaint handling, or any action flagged as sensitive by the tool definition.
- **All AI tool calls must be logged** with: timestamp, organizationId, userId, tool name, input schema (not raw values), and outcome.
- **Prompt injection mitigation**: User-supplied text must never be directly interpolated into system prompts without sanitization.
- **Token budgets and timeouts** must be enforced on all AI calls to prevent runaway costs.
- **Never store raw LLM responses** without stripping or redacting any PII that the model may have echoed back.

---

## 9. Testing Requirements

- **Unit tests** for all pure utility functions and data transformation logic.
- **Integration tests** for all API routes, including authentication and authorization checks.
- **Multi-tenancy boundary tests**: Every feature that accesses tenant data must have at least one test that asserts cross-tenant data cannot be accessed.
- **Test files co-located** with their source: `<module>/foo.test.ts` alongside `<module>/foo.ts`.
- **No test should depend on external services** — use mocks/stubs for Supabase, LLM providers, and third-party APIs.
- **CI must run all tests** before any merge to `main`.
- **Minimum coverage targets** (to be defined at Phase 1 kickoff, not yet enforced).

---

## 10. Git Rules

- **Branch naming**: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`, `docs/<short-description>`.
- **Commits must be atomic** — one logical change per commit.
- **Commit messages follow Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.
- **No direct commits to `main`**. All changes must come through a pull request.
- **PRs require at least one review** before merge (once team size allows).
- **Never commit `.env` files or any file containing secrets.**
- **`.gitignore` must be configured before the first commit.**
- **No merge commits on `main`** — use squash-merge or rebase.

---

## 11. Dependency Rules

- **Minimize dependencies.** Every new dependency must have a justified, documented reason.
- **Prefer well-maintained, widely-used packages** over niche alternatives.
- **Pin dependency versions** in production; use `package-lock.json` or `pnpm-lock.yaml`.
- **Audit dependencies regularly** (`npm audit` / `pnpm audit`) — critical vulnerabilities block deployment.
- **No packages with restrictive licenses** (e.g. GPL) unless legal approval is given.
- **Do not install packages during AI-assisted sessions** unless explicitly instructed by the human engineer.

---

## 12. Definition of Done

A feature is considered **Done** when:

1. The code is implemented according to the architecture and conventions in this file.
2. Input validation is in place (Zod schemas).
3. Authentication and authorization are enforced.
4. Tenant isolation is verified by at least one test.
5. All relevant API routes return correct HTTP status codes.
6. The feature has unit and/or integration tests.
7. The PR has been reviewed and approved.
8. The migration (if any) has been reviewed and tested against a staging database.
9. Environment variables required by the feature are documented in `.env.example`.
10. No linter errors or TypeScript errors on merge.

---

*Last updated: 2026-08-19 | Phase: Pre-initialization*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
