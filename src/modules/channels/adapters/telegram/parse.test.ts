import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  normalizeTelegramChatId,
  normalizeTelegramDestination,
  parseTelegramInbound,
  parseTelegramInboundBody,
} from "@/modules/channels/adapters/telegram/parse";

const BOT_DEST = "vg_sales_bot";
const CHAT_ID = "1001234567";
const UPDATE_ID = "9001";

function textUpdate(overrides: {
  updateId?: number | string;
  chatId?: number | string;
  text?: string | undefined;
  omitText?: boolean;
  chatType?: string;
  date?: number;
  extraRoot?: Record<string, unknown>;
  extraMessage?: Record<string, unknown>;
} = {}) {
  const message: Record<string, unknown> = {
    message_id: 12,
    date: overrides.date ?? 1710000000,
    chat: {
      id: overrides.chatId ?? Number(CHAT_ID),
      type: overrides.chatType ?? "private",
    },
    ...overrides.extraMessage,
  };
  if (!overrides.omitText) {
    message.text = overrides.text ?? "Hello from Telegram";
  }
  return {
    update_id: overrides.updateId ?? Number(UPDATE_ID),
    message,
    ...overrides.extraRoot,
  };
}

describe("parseTelegramInbound", () => {
  it("parses a private text message into CanonicalInbound", () => {
    const result = parseTelegramInbound(textUpdate(), BOT_DEST);
    expect(result).toEqual({
      status: "inbound",
      event: {
        providerMessageId: UPDATE_ID,
        from: CHAT_ID,
        to: BOT_DEST,
        body: "Hello from Telegram",
        occurredAt: "2024-03-09T16:00:00.000Z",
      },
    });
  });

  it("normalizes destination and chat id inside the Telegram boundary", () => {
    expect(normalizeTelegramDestination("@VG_Sales_Bot")).toBe("vg_sales_bot");
    expect(normalizeTelegramDestination("1001")).toBe("1001");
    expect(normalizeTelegramChatId(" 1001234567 ")).toBe("1001234567");
    const result = parseTelegramInbound(textUpdate(), "@VG_Sales_Bot");
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.to).toBe("vg_sales_bot");
      expect(result.event.from).toBe(CHAT_ID);
    }
  });

  it("accepts string chat ids without changing them", () => {
    const result = parseTelegramInbound(textUpdate({ chatId: "1001234567" }), BOT_DEST);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe("1001234567");
    }
  });

  it("rejects malformed JSON", () => {
    expect(() => parseTelegramInboundBody("{not-json", BOT_DEST)).toThrow(
      ValidationError
    );
  });

  it("rejects a text message missing the update id", () => {
    expect(() =>
      parseTelegramInbound(textUpdate({ updateId: "" }), BOT_DEST)
    ).toThrow(ValidationError);
  });

  it("rejects a text message missing the chat id", () => {
    expect(() =>
      parseTelegramInbound(textUpdate({ chatId: "" }), BOT_DEST)
    ).toThrow(ValidationError);
  });

  it("rejects a text message with an empty body", () => {
    expect(() => parseTelegramInbound(textUpdate({ text: "   " }), BOT_DEST)).toThrow(
      ValidationError
    );
  });

  it("ignores non-private chats", () => {
    expect(
      parseTelegramInbound(textUpdate({ chatType: "group" }), BOT_DEST)
    ).toEqual({ status: "ignored" });
    expect(
      parseTelegramInbound(textUpdate({ chatType: "supergroup" }), BOT_DEST)
    ).toEqual({ status: "ignored" });
    expect(
      parseTelegramInbound(textUpdate({ chatType: "channel" }), BOT_DEST)
    ).toEqual({ status: "ignored" });
  });

  it("ignores media, stickers, voice, and other non-text updates", () => {
    expect(
      parseTelegramInbound(
        textUpdate({ omitText: true, extraMessage: { photo: [{ file_id: "x" }] } }),
        BOT_DEST
      )
    ).toEqual({ status: "ignored" });
    expect(
      parseTelegramInbound(
        textUpdate({ omitText: true, extraMessage: { sticker: { file_id: "s" } } }),
        BOT_DEST
      )
    ).toEqual({ status: "ignored" });
    expect(
      parseTelegramInbound(
        textUpdate({ omitText: true, extraMessage: { voice: { file_id: "v" } } }),
        BOT_DEST
      )
    ).toEqual({ status: "ignored" });
  });

  it("maps first_name and last_name onto the canonical sender fields", () => {
    const result = parseTelegramInbound(
      textUpdate({
        extraMessage: {
          from: {
            id: Number(CHAT_ID),
            first_name: "Ahmed",
            last_name: "Ali",
            username: "ahmed_ali",
          },
        },
      }),
      BOT_DEST
    );
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe(CHAT_ID);
      expect(result.event.senderFirstName).toBe("Ahmed");
      expect(result.event.senderLastName).toBe("Ali");
    }
  });

  it("maps first_name only onto sender fields", () => {
    const result = parseTelegramInbound(
      textUpdate({
        extraMessage: { from: { id: Number(CHAT_ID), first_name: "Sara" } },
      }),
      BOT_DEST
    );
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.senderFirstName).toBe("Sara");
      expect(result.event.senderLastName).toBe("Customer");
    }
  });

  it("falls back to username when Telegram omits a first name", () => {
    const result = parseTelegramInbound(
      textUpdate({
        extraMessage: { from: { id: Number(CHAT_ID), username: "sara_q" } },
      }),
      BOT_DEST
    );
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.senderFirstName).toBe("sara_q");
      expect(result.event.senderLastName).toBe("Customer");
    }
  });

  it("omits sender names when Telegram provided no usable identity fields", () => {
    const result = parseTelegramInbound(textUpdate(), BOT_DEST);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.senderFirstName).toBeUndefined();
      expect(result.event.senderLastName).toBeUndefined();
      expect(result.event.from).toBe(CHAT_ID);
    }
  });

  it("ignores edited messages and unrelated updates", () => {
    expect(
      parseTelegramInbound(
        { update_id: 1, edited_message: { text: "hi", chat: { id: 1, type: "private" } } },
        BOT_DEST
      )
    ).toEqual({ status: "ignored" });
    expect(parseTelegramInbound({ update_id: 1, callback_query: {} }, BOT_DEST)).toEqual({
      status: "ignored",
    });
    expect(parseTelegramInbound({ foo: "bar" }, BOT_DEST)).toEqual({ status: "ignored" });
  });
});
