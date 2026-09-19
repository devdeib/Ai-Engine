"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LeadTable,
  type OrgMemberOption,
} from "@/modules/leads/components/lead-table";
import { CreateLeadForm } from "@/modules/leads/components/create-lead-form";
import {
  LEAD_STATUS_OPTIONS,
  LEAD_SOURCE_OPTIONS,
} from "@/modules/leads/lib/lead-labels";
import type { Lead } from "@/lib/db/types";
import { isDemoVideoDataEnabled } from "@/modules/dashboard/demo-mode";
import {
  DEMO_MEMBERS,
  listDemoLeads,
} from "@/modules/dashboard/demo-catalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadsMeta {
  page: number;
  limit: number;
  count: number;
}

interface LeadsResponse {
  data: Lead[];
  meta: LeadsMeta;
}

export interface LeadsClientProps {
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Styling constants
// ---------------------------------------------------------------------------

const selectClass =
  "h-9 rounded-md border border-input bg-card px-3 py-1 text-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
  "cursor-pointer text-foreground";

// ---------------------------------------------------------------------------
// Sort options — combines sortBy + sortOrder into a single <select> value
// ---------------------------------------------------------------------------

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "first_name:asc", label: "Name A\u2192Z" },
  { value: "first_name:desc", label: "Name Z\u2192A" },
  { value: "score:desc", label: "Score \u2193" },
  { value: "score:asc", label: "Score \u2191" },
  { value: "status:asc", label: "By status" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeadsClient({ organizationId }: LeadsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Derive filter state from URL search params.
  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentSource = searchParams.get("source") ?? "";
  const currentOwner = searchParams.get("owner_id") ?? "";
  const hideChannelStubs = searchParams.get("exclude_channel_stubs") === "true";
  const currentSortBy = searchParams.get("sortBy") ?? "created_at";
  const currentSortOrder = searchParams.get("sortOrder") ?? "desc";
  const currentPage = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10)
  );

  // Local state for search input (debounced before updating URL).
  const [searchInput, setSearchInput] = useState<string>(() => currentSearch);
  // Increment to force a re-fetch (e.g. after lead creation on the same page).
  const [refreshKey, setRefreshKey] = useState(0);

  // Organization members for owner filter and owner selector in forms.
  const [members, setMembers] = useState<OrgMemberOption[]>([]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<LeadsMeta>({
    page: 1,
    limit: 20,
    count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ---------------------------------------------------------------------------
  // URL param helpers
  // ---------------------------------------------------------------------------

  /** Update URL params.  Pass null to remove a param.  Always resets page to 1. */
  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      }
      current.set("page", "1");
      router.replace(`${pathname}?${current.toString()}`);
    },
    [searchParams, pathname, router]
  );

  const clearFilters = useCallback(() => {
    setSearchInput("");
    router.replace(pathname);
  }, [pathname, router]);

  const handlePrevPage = useCallback(() => {
    const current = new URLSearchParams(searchParams.toString());
    current.set("page", String(currentPage - 1));
    router.replace(`${pathname}?${current.toString()}`);
  }, [searchParams, pathname, router, currentPage]);

  const handleNextPage = useCallback(() => {
    const current = new URLSearchParams(searchParams.toString());
    current.set("page", String(currentPage + 1));
    router.replace(`${pathname}?${current.toString()}`);
  }, [searchParams, pathname, router, currentPage]);

  // ---------------------------------------------------------------------------
  // Fetch organization members once on mount (non-critical; used for owner UI)
  // ---------------------------------------------------------------------------

  const fetchMembers = useCallback(async () => {
    if (isDemoVideoDataEnabled()) {
      setMembers(DEMO_MEMBERS);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/members`,
        { credentials: "same-origin" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: Array<{ user_id: string; profile: { display_name: string } }>;
      };
      setMembers(
        json.data.map((m) => ({
          user_id: m.user_id,
          display_name: m.profile.display_name,
        }))
      );
    } catch {
      // Non-fatal: owner selects will be empty, but lead list still works.
    }
  }, [organizationId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  // ---------------------------------------------------------------------------
  // Search debounce — update URL 350 ms after the user stops typing
  // ---------------------------------------------------------------------------

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const current = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const trimmed = searchInput.trim();
      if (trimmed) {
        current.set("search", trimmed);
      } else {
        current.delete("search");
      }
      current.set("page", "1");
      router.replace(`${pathname}?${current.toString()}`);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]); // intentionally omits router/pathname — they are stable for this route

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    if (isDemoVideoDataEnabled()) {
      const result = listDemoLeads({
        search: currentSearch,
        status: currentStatus,
        source: currentSource,
        ownerId: currentOwner,
        page: currentPage,
        limit: 20,
      });
      setLeads(result.data);
      setMeta(result.meta);
      setIsLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "20");
      if (currentSearch) params.set("search", currentSearch);
      if (currentStatus) params.set("status", currentStatus);
      if (currentSource) params.set("source", currentSource);
      if (currentOwner) params.set("owner_id", currentOwner);
      if (hideChannelStubs) params.set("exclude_channel_stubs", "true");
      if (currentSortBy !== "created_at") params.set("sortBy", currentSortBy);
      if (currentSortOrder !== "desc") params.set("sortOrder", currentSortOrder);

      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads?${params.toString()}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }));
        throw new Error(body?.error?.message ?? "Failed to load leads");
      }
      const json = (await res.json()) as LeadsResponse;
      setLeads(json.data);
      setMeta(json.meta);
    } catch {
      setFetchError("Unable to load leads. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [
    organizationId,
    currentPage,
    currentSearch,
    currentStatus,
    currentSource,
    currentOwner,
    hideChannelStubs,
    currentSortBy,
    currentSortOrder,
    refreshKey,
  ]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  // ---------------------------------------------------------------------------
  // Post-create refresh
  // ---------------------------------------------------------------------------

  const handleLeadCreated = useCallback(() => {
    setShowForm(false);
    // Always increment refreshKey to ensure a re-fetch even when already on page 1.
    setRefreshKey((k) => k + 1);
    // Also navigate to page 1 if currently on a later page.
    if (currentPage !== 1) {
      const current = new URLSearchParams(searchParams.toString());
      current.set("page", "1");
      router.replace(`${pathname}?${current.toString()}`);
    }
  }, [currentPage, searchParams, pathname, router]);

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const hasPrevPage = currentPage > 1;
  const hasNextPage = meta.count >= meta.limit;
  const showPagination =
    !isLoading && !fetchError && (leads.length > 0 || currentPage > 1);

  const sortValue = `${currentSortBy}:${currentSortOrder}`;
  const hasActiveFilters = Boolean(
    currentSearch ||
      currentStatus ||
      currentSource ||
      currentOwner ||
      hideChannelStubs ||
      currentSortBy !== "created_at" ||
      currentSortOrder !== "desc"
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowForm(true)} disabled={showForm} size="sm">
          <Plus className="h-4 w-4" />
          New Lead
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search leads..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-9"
            aria-label="Search leads"
          />
        </div>

        {/* Status filter */}
        <select
          value={currentStatus}
          onChange={(e) =>
            updateFilters({ status: e.target.value || null })
          }
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {LEAD_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Source filter */}
        <select
          value={currentSource}
          onChange={(e) =>
            updateFilters({ source: e.target.value || null })
          }
          className={selectClass}
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {LEAD_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Owner filter */}
        <select
          value={currentOwner}
          onChange={(e) =>
            updateFilters({ owner_id: e.target.value || null })
          }
          className={selectClass}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>

        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={hideChannelStubs}
            onChange={(e) =>
              updateFilters({
                exclude_channel_stubs: e.target.checked ? "true" : null,
              })
            }
            className="h-4 w-4 accent-primary"
            aria-label="Hide channel stubs"
          />
          Hide channel stubs
        </label>

        {/* Sort */}
        <select
          value={sortValue}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(":");
            updateFilters({
              sortBy: sortBy !== "created_at" ? (sortBy ?? null) : null,
              sortOrder: sortOrder !== "desc" ? (sortOrder ?? null) : null,
            });
          }}
          className={selectClass}
          aria-label="Sort leads"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Clear filters button — shown when any non-default filter is active */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground hover:text-zeus-blue"
            aria-label="Clear all filters"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Create lead modal overlay */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create new lead"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-xl sm:rounded-lg bg-card border border-border">
            <CreateLeadForm
              organizationId={organizationId}
              onSuccess={handleLeadCreated}
              onCancel={() => setShowForm(false)}
              members={members}
            />
          </div>
        </div>
      )}

      {/* Lead list */}
      <LeadTable
        leads={leads}
        isLoading={isLoading}
        error={fetchError}
        onRetry={() => void fetchLeads()}
        onNewLead={() => setShowForm(true)}
        members={members}
      />

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {currentPage}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={!hasPrevPage}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasNextPage}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
