"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { LEAD_STATUS_LABELS } from "@/modules/leads/lib/lead-labels";
import type { LeadStatus } from "@/lib/db/types";

const PAGE_SIZE = 20;

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  test: "Test",
};

interface ChannelIdentityPublic {
  id: string;
  organizationId: string;
  channelAccountId: string;
  externalAddress: string;
  leadId: string | null;
  createdAt: string;
}

interface ChannelAccountPublic {
  id: string;
  channel: string;
}

interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  status: LeadStatus;
}

interface PageMeta {
  page: number;
  limit: number;
  count: number;
}

export interface IdentityMatchingClientProps {
  organizationId: string;
}

function listErrorMessage(status: number): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have access to this organization.";
  return "Unable to load unmatched identities. Please try again.";
}

function candidateErrorMessage(status: number): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have access to this organization.";
  if (status === 404) return "This channel identity was not found.";
  return "Unable to load matching leads. Please try again.";
}

function attachErrorMessage(status: number): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have access to this organization.";
  if (status === 404) return "Identity or lead was not found.";
  if (status === 422) return "The attach request was invalid.";
  return "Unable to attach this identity. Please try again.";
}

function channelLabel(channel: string | undefined): string {
  if (!channel) return "Channel";
  return CHANNEL_LABELS[channel] ?? channel;
}

function candidateName(candidate: MatchCandidate): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim();
}

export function IdentityMatchingClient({
  organizationId,
}: IdentityMatchingClientProps) {
  const [identities, setIdentities] = useState<ChannelIdentityPublic[]>([]);
  const [identityMeta, setIdentityMeta] = useState<PageMeta>({
    page: 1,
    limit: PAGE_SIZE,
    count: 0,
  });
  const [identityPage, setIdentityPage] = useState(1);
  const [accountsById, setAccountsById] = useState<
    Record<string, ChannelAccountPublic>
  >({});
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [candidateMeta, setCandidateMeta] = useState<PageMeta>({
    page: 1,
    limit: PAGE_SIZE,
    count: 0,
  });
  const [candidatePage, setCandidatePage] = useState(1);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [linkedLead, setLinkedLead] = useState<MatchCandidate | null>(null);

  const selectedIdentity = useMemo(
    () => identities.find((identity) => identity.id === selectedId) ?? null,
    [identities, selectedId]
  );
  const selectedCandidate = useMemo(
    () =>
      candidates.find((candidate) => candidate.id === selectedCandidateId) ??
      null,
    [candidates, selectedCandidateId]
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/channel-accounts?page=1&limit=100`,
        { credentials: "same-origin" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data: ChannelAccountPublic[] };
      const next: Record<string, ChannelAccountPublic> = {};
      for (const account of json.data ?? []) {
        next[account.id] = { id: account.id, channel: account.channel };
      }
      setAccountsById(next);
    } catch {
      // Non-fatal: identities still render without channel labels.
    }
  }, [organizationId]);

  const fetchIdentities = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        unmatched: "true",
        page: String(identityPage),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/channel-identities?${params}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        setListError(listErrorMessage(res.status));
        setIdentities([]);
        return;
      }
      const json = (await res.json()) as {
        data: ChannelIdentityPublic[];
        meta: PageMeta;
      };
      setIdentities(json.data ?? []);
      setIdentityMeta(json.meta ?? { page: identityPage, limit: PAGE_SIZE, count: 0 });
    } catch {
      setListError("Unable to load unmatched identities. Please try again.");
      setIdentities([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [organizationId, identityPage]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    void fetchIdentities();
  }, [fetchIdentities]);

  const fetchCandidates = useCallback(
    async (channelIdentityId: string, page: number) => {
      setIsLoadingCandidates(true);
      setCandidateError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(
          `/api/v1/organizations/${organizationId}/channel-identities/${channelIdentityId}/match-candidates?${params}`,
          { credentials: "same-origin" }
        );
        if (!res.ok) {
          setCandidateError(candidateErrorMessage(res.status));
          setCandidates([]);
          return;
        }
        const json = (await res.json()) as {
          data: MatchCandidate[];
          meta: PageMeta;
        };
        setCandidates(json.data ?? []);
        setCandidateMeta(
          json.meta ?? { page, limit: PAGE_SIZE, count: 0 }
        );
      } catch {
        setCandidateError("Unable to load matching leads. Please try again.");
        setCandidates([]);
      } finally {
        setIsLoadingCandidates(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    if (!selectedId) return;
    void fetchCandidates(selectedId, candidatePage);
  }, [selectedId, candidatePage, fetchCandidates]);

  function selectIdentity(identityId: string) {
    setSelectedId(identityId);
    setCandidatePage(1);
    setSelectedCandidateId(null);
    setAttachError(null);
    setLinkedLead(null);
    setCandidates([]);
    setCandidateError(null);
  }

  async function attachSelectedCandidate() {
    if (!selectedIdentity || !selectedCandidate || isAttaching) return;
    setIsAttaching(true);
    setAttachError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/channel-identities/${selectedIdentity.id}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: selectedCandidate.id }),
        }
      );
      if (!res.ok) {
        setAttachError(attachErrorMessage(res.status));
        return;
      }
      await res.json();
      setLinkedLead(selectedCandidate);
      setIdentities((current) =>
        current.filter((identity) => identity.id !== selectedIdentity.id)
      );
      setSelectedId(null);
      setSelectedCandidateId(null);
      setCandidates([]);
      void fetchIdentities();
    } catch {
      setAttachError("Unable to attach this identity. Please try again.");
    } finally {
      setIsAttaching(false);
    }
  }

  const identityHasPrev = identityPage > 1;
  const identityHasNext = identityMeta.count >= identityMeta.limit;
  const candidateHasPrev = candidatePage > 1;
  const candidateHasNext = candidateMeta.count >= candidateMeta.limit;

  return (
    <div className="space-y-4">

      {linkedLead && (
        <div
          className="rounded-md border bg-card px-4 py-3 text-sm"
          role="status"
        >
          Linked to{" "}
          <span className="font-medium">{candidateName(linkedLead)}</span>.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-3" aria-label="Unmatched identities">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Unmatched identities</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchIdentities()}
              disabled={isLoadingList}
              aria-label="Refresh unmatched identities"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {isLoadingList && (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 rounded-md border bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoadingList && listError && (
            <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center px-4">
              <AlertCircle className="h-6 w-6 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">{listError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void fetchIdentities()}
              >
                Try again
              </Button>
            </div>
          )}

          {!isLoadingList && !listError && identities.length === 0 && (
            <div className="rounded-md border py-12 text-center">
              <p className="text-sm font-medium">No unmatched identities</p>
              <p className="text-sm text-muted-foreground mt-1">
                Inbound identities attached to ingest stubs will appear here.
              </p>
            </div>
          )}

          {!isLoadingList && !listError && identities.length > 0 && (
            <ul className="space-y-2">
              {identities.map((identity) => {
                const channel = accountsById[identity.channelAccountId]?.channel;
                const selected = identity.id === selectedId;
                return (
                  <li key={identity.id}>
                    <button
                      type="button"
                      onClick={() => selectIdentity(identity.id)}
                      className={cn(
                        "w-full rounded-md border bg-card px-3 py-3 text-left transition-colors",
                        selected
                          ? "border-primary ring-1 ring-primary"
                          : "hover:bg-zeus-blue/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {channelLabel(channel)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(identity.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium break-all">
                        {identity.externalAddress}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Currently attached to an ingest stub lead
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!isLoadingList &&
            !listError &&
            (identities.length > 0 || identityPage > 1) && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {identityPage}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIdentityPage((page) => page - 1)}
                    disabled={!identityHasPrev}
                    aria-label="Previous identity page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIdentityPage((page) => page + 1)}
                    disabled={!identityHasNext}
                    aria-label="Next identity page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
        </section>

        <section className="space-y-3" aria-label="Match candidates">
          {!selectedIdentity && (
            <div className="rounded-md border py-12 text-center px-4">
              <p className="text-sm text-muted-foreground">
                Select an unmatched identity to see CRM lead candidates.
              </p>
            </div>
          )}

          {selectedIdentity && (
            <>
              <div>
                <h2 className="text-sm font-medium">Match candidates</h2>
                <p className="text-xs text-muted-foreground mt-1 break-all">
                  {channelLabel(
                    accountsById[selectedIdentity.channelAccountId]?.channel
                  )}{" "}
                  · {selectedIdentity.externalAddress}
                </p>
              </div>

              {isLoadingCandidates && (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 rounded-md border bg-muted/40 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {!isLoadingCandidates && candidateError && (
                <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center px-4">
                  <AlertCircle className="h-6 w-6 text-destructive mb-2" />
                  <p className="text-sm text-muted-foreground">{candidateError}</p>
                </div>
              )}

              {!isLoadingCandidates &&
                !candidateError &&
                candidates.length === 0 && (
                  <div className="rounded-md border py-12 text-center px-4">
                    <p className="text-sm font-medium">
                      No matching CRM leads found.
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Nothing is attached automatically.
                    </p>
                  </div>
                )}

              {!isLoadingCandidates &&
                !candidateError &&
                candidates.length > 0 && (
                  <ul className="space-y-2">
                    {candidates.map((candidate) => {
                      const selected = candidate.id === selectedCandidateId;
                      return (
                        <li key={candidate.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCandidateId(candidate.id);
                              setAttachError(null);
                              setLinkedLead(null);
                            }}
                            className={cn(
                              "w-full rounded-md border bg-card px-3 py-3 text-left transition-colors",
                              selected
                                ? "border-primary ring-1 ring-primary"
                                : "hover:bg-zeus-blue/10"
                            )}
                          >
                            <p className="text-sm font-medium">
                              {candidateName(candidate)}
                            </p>
                            <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                              <div>Email: {candidate.email ?? "—"}</div>
                              <div>Phone: {candidate.phone ?? "—"}</div>
                              <div>
                                Company: {candidate.companyName ?? "—"}
                              </div>
                              <div>
                                Status:{" "}
                                {LEAD_STATUS_LABELS[candidate.status] ??
                                  candidate.status}
                              </div>
                            </dl>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

              {!isLoadingCandidates &&
                !candidateError &&
                (candidates.length > 0 || candidatePage > 1) && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Page {candidatePage}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCandidatePage((page) => page - 1)}
                        disabled={!candidateHasPrev}
                        aria-label="Previous candidate page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCandidatePage((page) => page + 1)}
                        disabled={!candidateHasNext}
                        aria-label="Next candidate page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

              {selectedCandidate && (
                <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
                  <p className="text-sm">
                    Link this channel identity to{" "}
                    <span className="font-medium">
                      {candidateName(selectedCandidate)}
                    </span>
                    ? The identity will be attached to this CRM lead. The ingest
                    stub lead is not deleted. The conversation is retargeted by
                    the server. This action is operator-controlled.
                  </p>
                  {attachError && (
                    <p className="text-sm text-destructive">{attachError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => void attachSelectedCandidate()}
                      disabled={isAttaching}
                    >
                      {isAttaching ? "Attaching…" : "Attach identity"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelectedCandidateId(null);
                        setAttachError(null);
                      }}
                      disabled={isAttaching}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
