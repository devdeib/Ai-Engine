"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/lib/env";
import { cn, formatDate } from "@/lib/utils";
import type { MemberRole } from "@/lib/db/types";
import { buildChannelWebhookUrl } from "@/modules/channels/webhook-url";
import { isDemoVideoDataEnabled } from "@/modules/dashboard/demo-mode";
import { DEMO_CHANNEL_ACCOUNTS } from "@/modules/dashboard/demo-catalog";

const PAGE_SIZE = 20;

const CHANNEL_LABELS = {
  test: "Test",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  telegram: "Telegram",
} as const;

type ChannelKind = keyof typeof CHANNEL_LABELS;

const CHANNEL_OPTIONS: { value: ChannelKind; label: string }[] = [
  { value: "test", label: "Test" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "telegram", label: "Telegram" },
];

type AccountStatus = "active" | "paused" | "disabled";

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  paused: "Paused",
  disabled: "Disabled",
};

const STATUS_CLASSES: Record<AccountStatus, string> = {
  active: "bg-zeus-blue/12 text-zeus-blue",
  paused: "bg-zeus-black/[0.06] text-zeus-black/75",
  disabled: "bg-zeus-black/[0.04] text-muted-foreground",
};

const STATUS_ACTIONS: { status: AccountStatus; label: string }[] = [
  { status: "active", label: "Activate" },
  { status: "paused", label: "Pause" },
  { status: "disabled", label: "Disable" },
];

const DESTINATION_HINTS: Record<ChannelKind, string> = {
  test: "A stable destination identifier for this test channel.",
  whatsapp: "WhatsApp Phone Number ID from Meta, not the visible phone number.",
  email: "The receiving mailbox for this channel, for example sales@example.com.",
  sms: "The Telnyx receiving phone number in E.164 format, for example +15551234567.",
  telegram: "The Telegram bot username or numeric bot id, for example my_sales_bot.",
};

const WEBHOOK_SETUP_HINTS: Record<ChannelKind, string> = {
  test: "Use the webhook URL above with the generated Test webhook secret.",
  whatsapp:
    "Configure the webhook URL above in the Meta app. GET challenge and POST events use the same URL.",
  email:
    "Configure the webhook URL above as the Resend webhook endpoint. Inbound email.received events are handled there.",
  sms: "Configure the webhook URL above as the Telnyx messaging webhook.",
  telegram:
    "Creating or rotating this account registers the webhook with Telegram. Use Register webhook to repeat that setup. The webhook secret is generated and is never the bot token.",
};

export interface ChannelAccountPublic {
  id: string;
  channel: ChannelKind;
  status: AccountStatus;
  providerDestinationId: string;
  createdAt: string;
}

interface PageMeta {
  page: number;
  limit: number;
  count: number;
}

interface CreateFormFields {
  channel: ChannelKind;
  provider_destination_id: string;
  access_token: string;
  webhook_verify_token: string;
  app_secret: string;
  webhook_signing_secret: string;
}

const EMPTY_CREATE_FIELDS: CreateFormFields = {
  channel: "test",
  provider_destination_id: "",
  access_token: "",
  webhook_verify_token: "",
  app_secret: "",
  webhook_signing_secret: "",
};

type RotateFields = Omit<CreateFormFields, "channel" | "provider_destination_id">;

const EMPTY_ROTATE_FIELDS: RotateFields = {
  access_token: "",
  webhook_verify_token: "",
  app_secret: "",
  webhook_signing_secret: "",
};

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
  "text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

export interface ChannelAccountsClientProps {
  organizationId: string;
  memberRole: MemberRole;
}

function isChannelKind(value: unknown): value is ChannelKind {
  return (
    value === "test" ||
    value === "whatsapp" ||
    value === "email" ||
    value === "sms" ||
    value === "telegram"
  );
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return value === "active" || value === "paused" || value === "disabled";
}

function toPublicAccount(raw: unknown): ChannelAccountPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !isChannelKind(row.channel) || !isAccountStatus(row.status)) {
    return null;
  }
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    providerDestinationId:
      typeof row.providerDestinationId === "string" ? row.providerDestinationId : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
  };
}

function listErrorMessage(status: number): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have access to this organization.";
  if (status === 422) return "The request was invalid.";
  return "Unable to load channel accounts. Please try again.";
}

function mutationErrorMessage(status: number, fallback: string): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have access to this organization.";
  if (status === 404) return "This channel account was not found.";
  if (status === 409) return "A channel account already exists for this destination.";
  if (status === 422) return "The request was invalid.";
  return fallback;
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

function FieldHint({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function readFieldErrors(body: unknown): Record<string, string[]> {
  if (!body || typeof body !== "object") return {};
  const error = (body as { error?: { details?: unknown } }).error;
  const details = error?.details;
  if (!details || typeof details !== "object") return {};
  const next: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      next[key] = value;
    }
  }
  return next;
}

function buildCreatePayload(fields: CreateFormFields): Record<string, string> {
  const payload: Record<string, string> = {
    channel: fields.channel,
    provider_destination_id: fields.provider_destination_id.trim(),
  };
  if (fields.channel === "whatsapp") {
    payload.access_token = fields.access_token;
    payload.webhook_verify_token = fields.webhook_verify_token.trim();
    payload.app_secret = fields.app_secret;
  }
  if (fields.channel === "email" || fields.channel === "sms") {
    payload.access_token = fields.access_token;
    payload.webhook_signing_secret = fields.webhook_signing_secret;
  }
  if (fields.channel === "telegram") {
    payload.access_token = fields.access_token;
  }
  return payload;
}

function buildRotatePayload(
  channel: ChannelKind,
  fields: RotateFields
): Record<string, string> {
  if (channel === "test") return {};
  if (channel === "whatsapp") {
    return {
      access_token: fields.access_token,
      webhook_verify_token: fields.webhook_verify_token.trim(),
      app_secret: fields.app_secret,
    };
  }
  if (channel === "telegram") {
    return {
      access_token: fields.access_token,
    };
  }
  return {
    access_token: fields.access_token,
    webhook_signing_secret: fields.webhook_signing_secret,
  };
}

function extractOneTimeSecret(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const secret = (data as { webhookSecret?: unknown }).webhookSecret;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

export function ChannelAccountsClient({
  organizationId,
  memberRole,
}: ChannelAccountsClientProps) {
  const canMutate = memberRole === "owner" || memberRole === "admin";

  const [accounts, setAccounts] = useState<ChannelAccountPublic[]>([]);
  const [meta, setMeta] = useState<PageMeta>({
    page: 1,
    limit: PAGE_SIZE,
    count: 0,
  });
  const [page, setPage] = useState(1);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createFields, setCreateFields] = useState<CreateFormFields>(EMPTY_CREATE_FIELDS);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string[]>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [statusPending, setStatusPending] = useState<{
    id: string;
    status: AccountStatus;
  } | null>(null);
  const [rotatePendingId, setRotatePendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [rotateAccountId, setRotateAccountId] = useState<string | null>(null);
  const [rotateFields, setRotateFields] = useState<RotateFields>(EMPTY_ROTATE_FIELDS);
  const [rotateFieldErrors, setRotateFieldErrors] = useState<Record<string, string[]>>({});
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [webhookSetupPendingId, setWebhookSetupPendingId] = useState<string | null>(null);

  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [webhookCopy, setWebhookCopy] = useState<{
    accountId: string;
    outcome: "copied" | "failed";
  } | null>(null);

  const createInFlightRef = useRef(false);
  const statusInFlightRef = useRef(false);
  const rotateInFlightRef = useRef(false);
  const webhookSetupInFlightRef = useRef(false);

  const accountsUrl = `/api/v1/organizations/${organizationId}/channel-accounts`;

  const fetchAccounts = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    if (isDemoVideoDataEnabled()) {
      setAccounts(DEMO_CHANNEL_ACCOUNTS);
      setMeta({
        page,
        limit: PAGE_SIZE,
        count: DEMO_CHANNEL_ACCOUNTS.length,
      });
      setIsLoadingList(false);
      return;
    }
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`${accountsUrl}?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setListError(listErrorMessage(res.status));
        setAccounts([]);
        return;
      }
      const json = (await res.json()) as { data?: unknown; meta?: PageMeta };
      const next = Array.isArray(json.data)
        ? json.data.map(toPublicAccount).filter((row): row is ChannelAccountPublic => row !== null)
        : [];
      setAccounts(next);
      setMeta(json.meta ?? { page, limit: PAGE_SIZE, count: next.length });
    } catch {
      setListError("Unable to load channel accounts. Please try again.");
      setAccounts([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [accountsUrl, page]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  function updateCreateField<K extends keyof CreateFormFields>(
    key: K,
    value: CreateFormFields[K]
  ) {
    setCreateFields((current) => ({ ...current, [key]: value }));
    setCreateFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submitCreate() {
    if (!canMutate || createInFlightRef.current) return;
    createInFlightRef.current = true;
    setIsCreating(true);
    setCreateError(null);
    setCreateFieldErrors({});
    try {
      const res = await fetch(accountsUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreatePayload(createFields)),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(mutationErrorMessage(res.status, "Unable to create this channel account."));
        setCreateFieldErrors(readFieldErrors(body));
        return;
      }
      const secret = extractOneTimeSecret(body?.data);
      setOneTimeSecret(secret);
      setSecretCopied(false);
      setShowCreate(false);
      setCreateFields(EMPTY_CREATE_FIELDS);
      await fetchAccounts();
    } catch {
      setCreateError("Unable to create this channel account.");
    } finally {
      createInFlightRef.current = false;
      setIsCreating(false);
    }
  }

  async function patchStatus(accountId: string, status: AccountStatus) {
    if (!canMutate || statusInFlightRef.current || rotateInFlightRef.current) {
      return;
    }
    statusInFlightRef.current = true;
    setStatusPending({ id: accountId, status });
    setActionError(null);
    try {
      const res = await fetch(`${accountsUrl}/${accountId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setActionError(
          mutationErrorMessage(res.status, "Unable to update this channel account.")
        );
        return;
      }
      await fetchAccounts();
    } catch {
      setActionError("Unable to update this channel account.");
    } finally {
      statusInFlightRef.current = false;
      setStatusPending(null);
    }
  }

  function openRotate(accountId: string) {
    if (!canMutate) return;
    setRotateAccountId(accountId);
    setRotateFields(EMPTY_ROTATE_FIELDS);
    setRotateFieldErrors({});
    setRotateError(null);
    setActionError(null);
  }

  function closeRotate() {
    if (rotatePendingId) return;
    setRotateAccountId(null);
    setRotateFields(EMPTY_ROTATE_FIELDS);
    setRotateFieldErrors({});
    setRotateError(null);
  }

  async function submitRotate() {
    if (
      !canMutate ||
      !rotateAccountId ||
      rotateInFlightRef.current ||
      statusInFlightRef.current
    ) {
      return;
    }
    const account = accounts.find((row) => row.id === rotateAccountId);
    if (!account) return;
    rotateInFlightRef.current = true;
    setRotatePendingId(rotateAccountId);
    setRotateError(null);
    setRotateFieldErrors({});
    try {
      const res = await fetch(`${accountsUrl}/${rotateAccountId}/secrets/rotate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRotatePayload(account.channel, rotateFields)),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setRotateError(
          mutationErrorMessage(res.status, "Unable to rotate credentials.")
        );
        setRotateFieldErrors(readFieldErrors(body));
        return;
      }
      const secret = extractOneTimeSecret(body?.data);
      setOneTimeSecret(secret);
      setSecretCopied(false);
      setRotateAccountId(null);
      setRotateFields(EMPTY_ROTATE_FIELDS);
      await fetchAccounts();
    } catch {
      setRotateError("Unable to rotate credentials.");
    } finally {
      rotateInFlightRef.current = false;
      setRotatePendingId(null);
    }
  }

  async function copySecret() {
    if (!oneTimeSecret) return;
    try {
      await navigator.clipboard.writeText(oneTimeSecret);
      setSecretCopied(true);
    } catch {
      setSecretCopied(false);
    }
  }

  async function copyWebhookUrl(accountId: string) {
    const url = buildChannelWebhookUrl(env.NEXT_PUBLIC_APP_URL, accountId);
    try {
      await navigator.clipboard.writeText(url);
      setWebhookCopy({ accountId, outcome: "copied" });
    } catch {
      setWebhookCopy({ accountId, outcome: "failed" });
    }
  }

  async function registerTelegramWebhook(accountId: string) {
    if (!canMutate || webhookSetupInFlightRef.current) return;
    webhookSetupInFlightRef.current = true;
    setWebhookSetupPendingId(accountId);
    setActionError(null);
    try {
      const res = await fetch(`${accountsUrl}/${accountId}/telegram-webhook`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setActionError(
          mutationErrorMessage(res.status, "Unable to register the Telegram webhook.")
        );
        return;
      }
    } catch {
      setActionError("Unable to register the Telegram webhook.");
    } finally {
      webhookSetupInFlightRef.current = false;
      setWebhookSetupPendingId(null);
    }
  }

  function dismissSecret() {
    setOneTimeSecret(null);
    setSecretCopied(false);
  }

  const hasPrev = page > 1;
  const hasNext = meta.count >= meta.limit;
  const rotateAccount = accounts.find((row) => row.id === rotateAccountId) ?? null;
  const mutationBusy = Boolean(
    statusPending || rotatePendingId || isCreating || webhookSetupPendingId
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-end gap-3">
        {canMutate && (
          <Button
            onClick={() => {
              setShowCreate((open) => !open);
              setCreateError(null);
            }}
            disabled={isCreating}
          >
            <Plus className="h-4 w-4" />
            Create account
          </Button>
        )}
      </div>

      {oneTimeSecret && (
        <section
          className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-4 space-y-3"
          data-testid="one-time-secret-panel"
        >
          <div>
            <h2 className="text-sm font-semibold text-amber-950">
              Webhook secret — shown once
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              Copy this secret now. It will not be shown again. If it is lost,
              rotate credentials to generate a new one.
            </p>
          </div>
          <code
            className="block break-all rounded-md border bg-background px-3 py-2 text-xs"
            data-testid="one-time-secret-value"
          >
            {oneTimeSecret}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void copySecret()}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={dismissSecret}>
              Dismiss
            </Button>
            {secretCopied && (
              <span className="text-xs text-muted-foreground">Copied</span>
            )}
          </div>
        </section>
      )}

      {canMutate && showCreate && (
        <form
          aria-label="Create channel account"
          className="rounded-lg border bg-card px-4 py-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreate();
          }}
        >
          <h2 className="text-sm font-semibold">Create channel account</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="channel-type">Channel</Label>
              <select
                id="channel-type"
                className={selectClass}
                value={createFields.channel}
                disabled={isCreating}
                onChange={(event) =>
                  updateCreateField("channel", event.target.value as ChannelKind)
                }
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-destination">Destination</Label>
              <Input
                id="provider-destination"
                value={createFields.provider_destination_id}
                disabled={isCreating}
                onChange={(event) =>
                  updateCreateField("provider_destination_id", event.target.value)
                }
                aria-invalid={!!createFieldErrors.provider_destination_id?.length}
              />
              <FieldHint>{DESTINATION_HINTS[createFields.channel]}</FieldHint>
              <FieldError errors={createFieldErrors.provider_destination_id} />
            </div>
            {createFields.channel === "whatsapp" && (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="access-token">Access token</Label>
                  <Input
                    id="access-token"
                    type="password"
                    autoComplete="off"
                    value={createFields.access_token}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField("access_token", event.target.value)
                    }
                    aria-invalid={!!createFieldErrors.access_token?.length}
                  />
                  <FieldHint>Meta WhatsApp Cloud API access token.</FieldHint>
                  <FieldError errors={createFieldErrors.access_token} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-verify-token">Webhook verify token</Label>
                  <Input
                    id="webhook-verify-token"
                    autoComplete="off"
                    value={createFields.webhook_verify_token}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField("webhook_verify_token", event.target.value)
                    }
                    aria-invalid={!!createFieldErrors.webhook_verify_token?.length}
                  />
                  <FieldHint>
                    The token you choose in Meta when configuring the webhook challenge.
                  </FieldHint>
                  <FieldError errors={createFieldErrors.webhook_verify_token} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="app-secret">App secret</Label>
                  <Input
                    id="app-secret"
                    type="password"
                    autoComplete="off"
                    value={createFields.app_secret}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField("app_secret", event.target.value)
                    }
                    aria-invalid={!!createFieldErrors.app_secret?.length}
                  />
                  <FieldHint>
                    Meta App Secret used to verify X-Hub-Signature-256.
                  </FieldHint>
                  <FieldError errors={createFieldErrors.app_secret} />
                </div>
              </>
            )}
            {createFields.channel === "email" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="access-token">Access token</Label>
                  <Input
                    id="access-token"
                    type="password"
                    autoComplete="off"
                    value={createFields.access_token}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField("access_token", event.target.value)
                    }
                    aria-invalid={!!createFieldErrors.access_token?.length}
                  />
                  <FieldHint>Resend API key.</FieldHint>
                  <FieldError errors={createFieldErrors.access_token} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-signing-secret">Webhook signing secret</Label>
                  <Input
                    id="webhook-signing-secret"
                    type="password"
                    autoComplete="off"
                    value={createFields.webhook_signing_secret}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField(
                        "webhook_signing_secret",
                        event.target.value
                      )
                    }
                    aria-invalid={!!createFieldErrors.webhook_signing_secret?.length}
                  />
                  <FieldHint>
                    Resend / Svix signing secret starting with whsec_.
                  </FieldHint>
                  <FieldError errors={createFieldErrors.webhook_signing_secret} />
                </div>
              </>
            )}
            {createFields.channel === "sms" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="access-token">Access token</Label>
                  <Input
                    id="access-token"
                    type="password"
                    autoComplete="off"
                    value={createFields.access_token}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField("access_token", event.target.value)
                    }
                    aria-invalid={!!createFieldErrors.access_token?.length}
                  />
                  <FieldHint>Telnyx API key.</FieldHint>
                  <FieldError errors={createFieldErrors.access_token} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-signing-secret">Webhook signing secret</Label>
                  <Input
                    id="webhook-signing-secret"
                    type="password"
                    autoComplete="off"
                    value={createFields.webhook_signing_secret}
                    disabled={isCreating}
                    onChange={(event) =>
                      updateCreateField(
                        "webhook_signing_secret",
                        event.target.value
                      )
                    }
                    aria-invalid={!!createFieldErrors.webhook_signing_secret?.length}
                  />
                  <FieldHint>
                    Telnyx Ed25519 public key used for webhook verification.
                  </FieldHint>
                  <FieldError errors={createFieldErrors.webhook_signing_secret} />
                </div>
              </>
            )}
            {createFields.channel === "telegram" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="access-token">Access token</Label>
                <Input
                  id="access-token"
                  type="password"
                  autoComplete="off"
                  value={createFields.access_token}
                  disabled={isCreating}
                  onChange={(event) =>
                    updateCreateField("access_token", event.target.value)
                  }
                  aria-invalid={!!createFieldErrors.access_token?.length}
                />
                <FieldHint>Telegram Bot Token from BotFather. Never the webhook secret.</FieldHint>
                <FieldError errors={createFieldErrors.access_token} />
              </div>
            )}
          </div>
          {createError && (
            <p className="text-sm text-destructive" role="alert">
              {createError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating…" : "Create account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isCreating}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {isLoadingList && (
        <p className="text-sm text-muted-foreground">Loading channel accounts…</p>
      )}

      {!isLoadingList && listError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{listError}</p>
        </div>
      )}

      {!isLoadingList && !listError && accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No channel accounts yet.
        </p>
      )}

      {!isLoadingList && !listError && accounts.length > 0 && (
        <ul className="space-y-3">
          {accounts.map((account) => {
            return (
              <li
                key={account.id}
                className="rounded-lg border bg-card px-4 py-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {CHANNEL_LABELS[account.channel]}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          STATUS_CLASSES[account.status]
                        )}
                      >
                        {STATUS_LABELS[account.status]}
                      </span>
                    </div>
                    <dl className="grid gap-1 text-xs text-muted-foreground">
                      <div>
                        Destination: {account.providerDestinationId || "—"}
                      </div>
                      <div>Created: {formatDate(account.createdAt)}</div>
                    </dl>
                    <div className="mt-2 space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        Webhook URL
                      </p>
                      <code
                        className="block break-all rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground"
                        data-testid="channel-webhook-url"
                      >
                        {buildChannelWebhookUrl(
                          env.NEXT_PUBLIC_APP_URL,
                          account.id
                        )}
                      </code>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void copyWebhookUrl(account.id)}
                        >
                          <Copy className="h-4 w-4" />
                          Copy webhook URL
                        </Button>
                        {webhookCopy?.accountId === account.id &&
                          webhookCopy.outcome === "copied" && (
                            <span className="text-xs text-muted-foreground">
                              Copied
                            </span>
                          )}
                        {webhookCopy?.accountId === account.id &&
                          webhookCopy.outcome === "failed" && (
                            <span
                              className="text-xs text-destructive"
                              role="alert"
                            >
                              Unable to copy webhook URL.
                            </span>
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {WEBHOOK_SETUP_HINTS[account.channel]}
                      </p>
                    </div>
                  </div>
                  {canMutate && (
                    <div className="flex flex-wrap items-center gap-2">
                      {STATUS_ACTIONS.map((action) => (
                        <Button
                          key={action.status}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            mutationBusy || account.status === action.status
                          }
                          onClick={() => void patchStatus(account.id, action.status)}
                        >
                          {statusPending?.id === account.id &&
                          statusPending.status === action.status
                            ? "Saving…"
                            : action.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={mutationBusy}
                        onClick={() => openRotate(account.id)}
                      >
                        Rotate credentials
                      </Button>
                      {account.channel === "telegram" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutationBusy}
                          onClick={() => void registerTelegramWebhook(account.id)}
                        >
                          {webhookSetupPendingId === account.id
                            ? "Registering…"
                            : "Register webhook"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoadingList && !listError && (accounts.length > 0 || page > 1) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => current - 1)}
              disabled={!hasPrev}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={!hasNext}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {canMutate && rotateAccount && (
        <section
          className="rounded-lg border bg-muted/30 px-4 py-4 space-y-4"
          data-testid="rotate-panel"
        >
          <div>
            <h2 className="text-sm font-semibold">Rotate credentials</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rotateAccount.channel === "test"
                ? "This replaces the stored Test webhook secret. The new secret is shown once."
                : "This replaces stored provider credentials. Channel and destination cannot be changed."}
            </p>
          </div>
          {rotateAccount.channel === "whatsapp" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rotate-access-token">Access token</Label>
                <Input
                  id="rotate-access-token"
                  type="password"
                  autoComplete="off"
                  value={rotateFields.access_token}
                  disabled={Boolean(rotatePendingId)}
                  onChange={(event) =>
                    setRotateFields((current) => ({
                      ...current,
                      access_token: event.target.value,
                    }))
                  }
                />
                <FieldHint>Meta WhatsApp Cloud API access token.</FieldHint>
                <FieldError errors={rotateFieldErrors.access_token} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rotate-verify-token">Webhook verify token</Label>
                <Input
                  id="rotate-verify-token"
                  autoComplete="off"
                  value={rotateFields.webhook_verify_token}
                  disabled={Boolean(rotatePendingId)}
                  onChange={(event) =>
                    setRotateFields((current) => ({
                      ...current,
                      webhook_verify_token: event.target.value,
                    }))
                  }
                />
                <FieldHint>
                  The token you choose in Meta when configuring the webhook challenge.
                </FieldHint>
                <FieldError errors={rotateFieldErrors.webhook_verify_token} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rotate-app-secret">App secret</Label>
                <Input
                  id="rotate-app-secret"
                  type="password"
                  autoComplete="off"
                  value={rotateFields.app_secret}
                  disabled={Boolean(rotatePendingId)}
                  onChange={(event) =>
                    setRotateFields((current) => ({
                      ...current,
                      app_secret: event.target.value,
                    }))
                  }
                />
                <FieldHint>
                  Meta App Secret used to verify X-Hub-Signature-256.
                </FieldHint>
                <FieldError errors={rotateFieldErrors.app_secret} />
              </div>
            </div>
          )}
          {(rotateAccount.channel === "email" || rotateAccount.channel === "sms") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rotate-access-token">Access token</Label>
                <Input
                  id="rotate-access-token"
                  type="password"
                  autoComplete="off"
                  value={rotateFields.access_token}
                  disabled={Boolean(rotatePendingId)}
                  onChange={(event) =>
                    setRotateFields((current) => ({
                      ...current,
                      access_token: event.target.value,
                    }))
                  }
                />
                <FieldHint>
                  {rotateAccount.channel === "email"
                    ? "Resend API key."
                    : "Telnyx API key."}
                </FieldHint>
                <FieldError errors={rotateFieldErrors.access_token} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rotate-signing-secret">Webhook signing secret</Label>
                <Input
                  id="rotate-signing-secret"
                  type="password"
                  autoComplete="off"
                  value={rotateFields.webhook_signing_secret}
                  disabled={Boolean(rotatePendingId)}
                  onChange={(event) =>
                    setRotateFields((current) => ({
                      ...current,
                      webhook_signing_secret: event.target.value,
                    }))
                  }
                />
                <FieldHint>
                  {rotateAccount.channel === "email"
                    ? "Resend / Svix signing secret starting with whsec_."
                    : "Telnyx Ed25519 public key used for webhook verification."}
                </FieldHint>
                <FieldError errors={rotateFieldErrors.webhook_signing_secret} />
              </div>
            </div>
          )}
          {rotateAccount.channel === "telegram" && (
            <div className="space-y-1.5">
              <Label htmlFor="rotate-access-token">Access token</Label>
              <Input
                id="rotate-access-token"
                type="password"
                autoComplete="off"
                value={rotateFields.access_token}
                disabled={Boolean(rotatePendingId)}
                onChange={(event) =>
                  setRotateFields((current) => ({
                    ...current,
                    access_token: event.target.value,
                  }))
                }
              />
              <FieldHint>Telegram Bot Token from BotFather. A new webhook secret is generated and registered.</FieldHint>
              <FieldError errors={rotateFieldErrors.access_token} />
            </div>
          )}
          {rotateError && (
            <p className="text-sm text-destructive" role="alert">
              {rotateError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void submitRotate()}
              disabled={Boolean(rotatePendingId) || Boolean(statusPending)}
            >
              {rotatePendingId ? "Rotating…" : "Confirm rotate"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeRotate}
              disabled={Boolean(rotatePendingId)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
