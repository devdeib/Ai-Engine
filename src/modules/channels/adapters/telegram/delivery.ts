/**
 * Telegram Bot API delivery adapter. Text sendMessage only.
 * Does not persist CRM rows, enqueue jobs, or call AI.
 *
 * Telegram sendMessage has no provider-side idempotency key.
 * The stable key is still received on every retry. Provider acceptance
 * followed by a lost response may result in a duplicate send.
 */
import "server-only";
import { logger } from "@/lib/logger";
import { callTelegramBotMethod, telegramApiOk } from "@/modules/channels/adapters/telegram/api";
import {
  classifyTelegramHttpError,
  classifyTelegramNetworkError,
  type TelegramClassifiedError,
} from "@/modules/channels/adapters/telegram/errors";
import { loadTelegramDeliveryCredentials } from "@/modules/channels/secrets";
import type {
  ChannelDeliveryAdapter,
  ChannelDeliverySendInput,
  ChannelDeliverySendResult,
} from "@/modules/channels/adapters/types";

function logTelegramDeliveryFailure(
  input: ChannelDeliverySendInput,
  classified: Pick<
    TelegramClassifiedError,
    "errorCode" | "telegramHttpStatus" | "telegramApiErrorCode"
  >
): void {
  logger.warn("Telegram delivery failed", {
    organizationId: input.organizationId,
    code: classified.errorCode,
    ...(classified.telegramHttpStatus !== undefined
      ? { telegramHttpStatus: classified.telegramHttpStatus }
      : {}),
    ...(classified.telegramApiErrorCode !== undefined
      ? { telegramApiErrorCode: classified.telegramApiErrorCode }
      : {}),
  });
}

type FetchFn = typeof fetch;

function readProviderMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const result = (body as { result?: unknown }).result;
  if (typeof result !== "object" || result === null) return null;
  const messageId = (result as { message_id?: unknown }).message_id;
  if (typeof messageId === "number" && Number.isFinite(messageId)) {
    return String(messageId);
  }
  if (typeof messageId === "string" && messageId.trim().length > 0) {
    return messageId.trim();
  }
  return null;
}

export function createTelegramDeliveryAdapter(deps: {
  fetchImpl?: FetchFn;
  loadCredentials?: typeof loadTelegramDeliveryCredentials;
} = {}): ChannelDeliveryAdapter {
  const loadCredentials =
    deps.loadCredentials ?? loadTelegramDeliveryCredentials;

  return {
    async send(input: ChannelDeliverySendInput): Promise<ChannelDeliverySendResult> {
      void input.idempotencyKey;

      const credentials = await loadCredentials(
        input.organizationId,
        input.channelAccountId
      );
      if (!credentials.ok) {
        logTelegramDeliveryFailure(input, { errorCode: credentials.errorCode });
        return {
          ok: false,
          errorCode: credentials.errorCode,
          retryable: credentials.retryable,
        };
      }

      let response: { status: number; body: unknown };
      try {
        response = await callTelegramBotMethod({
          accessToken: credentials.accessToken,
          method: "sendMessage",
          body: {
            chat_id: input.destination,
            text: input.body,
          },
          fetchImpl: deps.fetchImpl,
        });
      } catch (error) {
        const classified = classifyTelegramNetworkError(error);
        return {
          ok: false,
          errorCode: classified.errorCode,
          retryable: classified.retryable,
        };
      }

      if (response.status < 200 || response.status >= 300 || !telegramApiOk(response.body)) {
        const classified = classifyTelegramHttpError(response.status, response.body);
        logTelegramDeliveryFailure(input, classified);
        return {
          ok: false,
          errorCode: classified.errorCode,
          retryable: classified.retryable,
        };
      }

      const providerMessageId = readProviderMessageId(response.body);
      if (!providerMessageId) {
        return {
          ok: false,
          errorCode: "MALFORMED_REQUEST",
          retryable: false,
        };
      }

      return { ok: true, providerMessageId };
    },
  };
}

export const telegramDeliveryAdapter = createTelegramDeliveryAdapter();
