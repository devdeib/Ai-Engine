import { z } from "zod";

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export const canonicalInboundSchema = z
  .object({
    providerMessageId: z
      .string()
      .trim()
      .min(1, "providerMessageId is required")
      .max(128),
    from: z.string().trim().min(1, "from is required").max(128),
    to: z.string().trim().min(1, "to is required").max(128),
    body: z.string().trim().min(1, "body is required").max(4000),
    senderFirstName: z.string().trim().min(1).max(100).optional(),
    senderLastName: z.string().trim().min(1).max(100).optional(),
    occurredAt: z
      .string()
      .trim()
      .refine(isValidTimestamp, "occurredAt must be a valid timestamp")
      .optional(),
  })
  .strip();

export const testWebhookPayloadSchema = canonicalInboundSchema;

export const createChannelAccountSchema = z
  .object({
    channel: z.enum(["test", "whatsapp", "email", "sms", "telegram"]).default("test"),
    provider_destination_id: z
      .string()
      .trim()
      .min(1, "Destination is required")
      .max(128),
    access_token: z.string().min(1).max(4096).optional(),
    webhook_verify_token: z.string().trim().min(1).max(256).optional(),
    app_secret: z.string().min(32).max(128).optional(),
    webhook_signing_secret: z.string().min(32).max(128).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "whatsapp") {
      if (!data.access_token?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["access_token"],
          message: "Access token is required",
        });
      }
      if (!data.webhook_verify_token?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhook_verify_token"],
          message: "Webhook verify token is required",
        });
      }
      if (!data.app_secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["app_secret"],
          message: "App secret is required",
        });
      }
      return;
    }

    if (data.channel === "email") {
      if (!data.access_token?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["access_token"],
          message: "Access token is required",
        });
      }
      if (!data.webhook_signing_secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhook_signing_secret"],
          message: "Webhook signing secret is required",
        });
      } else if (!data.webhook_signing_secret.startsWith("whsec_")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhook_signing_secret"],
          message: "Webhook signing secret is invalid",
        });
      }
      return;
    }

    if (data.channel === "telegram") {
      if (!data.access_token?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["access_token"],
          message: "Access token is required",
        });
      }
      return;
    }

    if (data.channel !== "sms") {
      return;
    }

    if (!data.access_token?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["access_token"],
        message: "Access token is required",
      });
    }
    if (!data.webhook_signing_secret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["webhook_signing_secret"],
        message: "Webhook signing secret is required",
      });
    }
  });

export const updateChannelAccountStatusSchema = z
  .object({
    status: z.enum(["active", "paused", "disabled"]),
  })
  .strict();

const rotateTestChannelAccountSecretsSchema = z.object({}).strict();

export const channelAccountIdParamsSchema = z.object({
  channelAccountId: z.string().uuid("Channel account ID must be a valid UUID"),
});

type RotateParseFailure = {
  success: false;
  error: { fieldErrors: Record<string, string[] | undefined> };
};

type RotateParseSuccess = {
  success: true;
  data: CreateChannelAccountInput;
};

export type ChannelAccountRotateParseResult =
  | RotateParseSuccess
  | RotateParseFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Full credential replacement. Channel and destination come from the stored
 * row only — those keys in the body are always rejected.
 */
export function parseChannelAccountRotateBody(
  channel: CreateChannelAccountInput["channel"],
  providerDestinationId: string,
  body: unknown
): ChannelAccountRotateParseResult {
  if (!isPlainObject(body)) {
    return {
      success: false,
      error: { fieldErrors: { "": ["Request body must be an object"] } },
    };
  }

  const fieldErrors: Record<string, string[]> = {};
  if (Object.prototype.hasOwnProperty.call(body, "channel")) {
    fieldErrors.channel = ["Channel cannot be changed during rotation"];
  }
  if (Object.prototype.hasOwnProperty.call(body, "provider_destination_id")) {
    fieldErrors.provider_destination_id = [
      "Destination cannot be changed during rotation",
    ];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: { fieldErrors } };
  }

  if (channel === "test") {
    const parsed = rotateTestChannelAccountSecretsSchema.safeParse(body);
    if (!parsed.success) {
      return {
        success: false,
        error: { fieldErrors: parsed.error.flatten().fieldErrors },
      };
    }
    return {
      success: true,
      data: {
        channel: "test",
        provider_destination_id: providerDestinationId,
      },
    };
  }

  const parsed = createChannelAccountSchema.safeParse({
    ...body,
    channel,
    provider_destination_id: providerDestinationId,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: { fieldErrors: parsed.error.flatten().fieldErrors },
    };
  }

  return { success: true, data: parsed.data };
}

export const listChannelAccountsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at most 100")
    .max(100, "Limit must be at most 100")
    .default(20),
});

const optionalQueryBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const listChannelIdentitiesQuerySchema = listChannelAccountsQuerySchema
  .extend({
    channel_account_id: z
      .string()
      .uuid("channel_account_id must be a valid UUID")
      .optional(),
    lead_id: z.string().uuid("lead_id must be a valid UUID").optional(),
    unmatched: optionalQueryBooleanSchema,
  })
  .refine((value) => !(value.lead_id !== undefined && value.unmatched === true), {
    message: "lead_id cannot be combined with unmatched=true",
    path: ["unmatched"],
  });

export const listChannelIdentityMatchCandidatesQuerySchema =
  listChannelAccountsQuerySchema;

export const excludeChannelStubsQuerySchema = optionalQueryBooleanSchema;

export const channelIdentityIdParamsSchema = z.object({
  channelIdentityId: z.string().uuid("Channel identity ID must be a valid UUID"),
});

export const attachChannelIdentityLeadSchema = z
  .object({
    leadId: z.string().uuid("Lead ID must be a valid UUID"),
  })
  .strict();

export type CanonicalInbound = z.infer<typeof canonicalInboundSchema>;
export type TestWebhookPayload = CanonicalInbound;
export type CreateChannelAccountInput = z.infer<typeof createChannelAccountSchema>;
