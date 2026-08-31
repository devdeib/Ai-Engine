"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/db/types";
import {
  CONSTRAINTS_MAX,
  OFFERING_SUMMARY_MAX,
  QUALIFICATION_CRITERIA_MAX,
  SERVICE_AREA_MAX,
  TYPICAL_NEXT_STEP_MAX,
  emptyOrganizationSalesProfile,
  type OrganizationSalesProfilePublic,
} from "@/modules/organizations/sales-profile-schema";

const textareaClass = cn(
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2",
  "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50 resize-y"
);

interface FormFields {
  name: string;
  offering_summary: string;
  service_area: string;
  qualification_criteria: string;
  constraints: string;
  typical_next_step: string;
}

function profileToFields(
  name: string,
  profile: OrganizationSalesProfilePublic
): FormFields {
  return {
    name,
    offering_summary: profile.offering_summary ?? "",
    service_area: profile.service_area ?? "",
    qualification_criteria: profile.qualification_criteria ?? "",
    constraints: profile.constraints ?? "",
    typical_next_step: profile.typical_next_step ?? "",
  };
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export interface OrganizationSettingsFormProps {
  organizationId: string;
  role: MemberRole;
  initialName: string;
}

export function OrganizationSettingsForm({
  organizationId,
  role,
  initialName,
}: OrganizationSettingsFormProps) {
  const canMutate = role === "owner" || role === "admin";
  const [fields, setFields] = useState<FormFields>(() =>
    profileToFields(initialName, emptyOrganizationSalesProfile())
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/sales-profile`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        throw new Error("Failed to load sales profile");
      }
      const json = (await res.json()) as { data: OrganizationSalesProfilePublic };
      setFields(profileToFields(initialName, json.data));
    } catch {
      setLoadError("Unable to load the sales profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, initialName]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canMutate || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    setSuccess(null);
    setFieldErrors({});

    try {
      const nameRes = await fetch(
        `/api/v1/organizations/${organizationId}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fields.name.trim() }),
        }
      );
      if (!nameRes.ok) {
        const body = (await nameRes.json().catch(() => null)) as {
          error?: { message?: string; details?: Record<string, string[]> };
        } | null;
        if (body?.error?.details) {
          setFieldErrors(body.error.details);
        }
        throw new Error(body?.error?.message ?? "Failed to save company name");
      }

      const profileRes = await fetch(
        `/api/v1/organizations/${organizationId}/sales-profile`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offering_summary: fields.offering_summary,
            service_area: fields.service_area,
            qualification_criteria: fields.qualification_criteria,
            constraints: fields.constraints,
            typical_next_step: fields.typical_next_step,
          }),
        }
      );
      if (!profileRes.ok) {
        const body = (await profileRes.json().catch(() => null)) as {
          error?: { message?: string; details?: Record<string, string[]> };
        } | null;
        if (body?.error?.details) {
          setFieldErrors(body.error.details);
        }
        throw new Error(body?.error?.message ?? "Failed to save sales profile");
      }

      setSuccess("Company profile saved.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company and sales profile</CardTitle>
        <CardDescription>
          Facts the AI may use when talking to customers. Leave a field empty
          if the AI must not invent that information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 animate-pulse" aria-hidden="true">
            <div className="h-9 rounded-md bg-muted" />
            <div className="h-20 rounded-md bg-muted" />
            <div className="h-20 rounded-md bg-muted" />
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadProfile()}>
              Try again
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            {!canMutate ? (
              <p className="text-sm text-muted-foreground">
                Only owners and admins can change this profile.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                name="name"
                value={fields.name}
                onChange={(event) => updateField("name", event.target.value)}
                disabled={!canMutate || isSaving}
                required
                maxLength={255}
              />
              <FieldError errors={fieldErrors.name} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="offering-summary">What we sell</Label>
              <textarea
                id="offering-summary"
                name="offering_summary"
                className={textareaClass}
                value={fields.offering_summary}
                onChange={(event) =>
                  updateField("offering_summary", event.target.value)
                }
                disabled={!canMutate || isSaving}
                maxLength={OFFERING_SUMMARY_MAX}
                rows={3}
              />
              <FieldError errors={fieldErrors.offering_summary} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="service-area">Service area / locations</Label>
              <textarea
                id="service-area"
                name="service_area"
                className={textareaClass}
                value={fields.service_area}
                onChange={(event) =>
                  updateField("service_area", event.target.value)
                }
                disabled={!canMutate || isSaving}
                maxLength={SERVICE_AREA_MAX}
                rows={2}
              />
              <FieldError errors={fieldErrors.service_area} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qualification-criteria">
                Qualification criteria / questions
              </Label>
              <textarea
                id="qualification-criteria"
                name="qualification_criteria"
                className={textareaClass}
                value={fields.qualification_criteria}
                onChange={(event) =>
                  updateField("qualification_criteria", event.target.value)
                }
                disabled={!canMutate || isSaving}
                maxLength={QUALIFICATION_CRITERIA_MAX}
                rows={3}
              />
              <FieldError errors={fieldErrors.qualification_criteria} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="constraints">
                Constraints / things the AI must never claim
              </Label>
              <textarea
                id="constraints"
                name="constraints"
                className={textareaClass}
                value={fields.constraints}
                onChange={(event) =>
                  updateField("constraints", event.target.value)
                }
                disabled={!canMutate || isSaving}
                maxLength={CONSTRAINTS_MAX}
                rows={3}
              />
              <FieldError errors={fieldErrors.constraints} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="typical-next-step">Typical next step</Label>
              <textarea
                id="typical-next-step"
                name="typical_next_step"
                className={textareaClass}
                value={fields.typical_next_step}
                onChange={(event) =>
                  updateField("typical_next_step", event.target.value)
                }
                disabled={!canMutate || isSaving}
                maxLength={TYPICAL_NEXT_STEP_MAX}
                rows={2}
              />
              <FieldError errors={fieldErrors.typical_next_step} />
            </div>

            {saveError ? (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-green-700" role="status">
                {success}
              </p>
            ) : null}

            {canMutate ? (
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
