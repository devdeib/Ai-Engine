/**
 * Tests for MessageComposer — validation, POST body, submitting state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageComposer } from "./message-composer";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("MessageComposer", () => {
  it("renders a labelled textarea and send button", () => {
    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/write a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });

  it("disables send when the body is empty", () => {
    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("disables send for whitespace-only content", async () => {
    const user = userEvent.setup();
    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText(/write a message/i), "   ");
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("rejects bodies over 4000 characters", async () => {
    const user = userEvent.setup();
    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );
    const textarea = screen.getByLabelText(/write a message/i);
    await user.click(textarea);
    await user.paste("x".repeat(MESSAGE_BODY_MAX + 1));
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(`${MESSAGE_BODY_MAX + 1}/${MESSAGE_BODY_MAX}`)).toBeInTheDocument();
  });

  it("POSTs only direction and body — never identity fields", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: "11111111-0000-4000-8000-0000000000aa",
          body: "Hello",
          direction: "outbound",
        },
      }),
    });

    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={onSent}
      />
    );

    await user.type(screen.getByLabelText(/write a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalled());

    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const parsed = JSON.parse(String(init.body));
    expect(parsed).toEqual({ direction: "outbound", body: "Hello" });
    expect(parsed).not.toHaveProperty("organization_id");
    expect(parsed).not.toHaveProperty("author_user_id");
    expect(parsed).not.toHaveProperty("conversation_id");
    expect(parsed).not.toHaveProperty("user_id");
  });

  it("shows a submitting state and prevents duplicate posts", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => undefined;
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;

    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText(/write a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      status: 201,
      json: async () => ({ data: { body: "Hello" } }),
    });
  });

  it("clears the composer after a successful send", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { body: "Hello" } }),
    });

    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        onSent={vi.fn()}
      />
    );
    const textarea = screen.getByLabelText(/write a message/i);
    await user.type(textarea, "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("is disabled when the conversation is closed", () => {
    render(
      <MessageComposer
        organizationId={ORG_A}
        conversationId={CONV_1}
        disabled
        disabledReason="Reopen the conversation to send a message"
        onSent={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/write a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });
});
