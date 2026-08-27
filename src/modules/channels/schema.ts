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
    channel: z.enum(["test", "whatsapp", "email"]).default("test"),
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

    if (data.channel !== "email") {
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
    } else if (!data.webhook_signing_secret.startsWith("whsec_")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["webhook_signing_secret"],
        message: "Webhook signing secret is invalid",
      });
    }
  });

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

export const listChannelIdentitiesQuerySchema = listChannelAccountsQuerySchema.extend(
  {
    channel_account_id: z
      .string()
      .uuid("channel_account_id must be a valid UUID")
      .optional(),
  }
);

export type CanonicalInbound = z.infer<typeof canonicalInboundSchema>;
export type TestWebhookPayload = CanonicalInbound;
export type CreateChannelAccountInput = z.infer<typeof createChannelAccountSchema>;
