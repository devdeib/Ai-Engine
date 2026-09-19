/**
 * AI job scheduling tests. Verifies that after() awaits the task Promise
 * so Vercel keeps the execution alive until AI + delivery processing completes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/errors", () => ({
  isAppError: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
import { scheduleAiJobProcessing } from "@/modules/ai/jobs/schedule";

describe("scheduleAiJobProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the task with after()", () => {
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleAiJobProcessing(task);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it("awaits the task inside the after() callback", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleAiJobProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    expect(callback).toBeTypeOf("function");

    await callback();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not detach the task with void", async () => {
    let resolved = false;
    const task = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      resolved = true;
    });
    scheduleAiJobProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    const callbackPromise = callback();

    // If the task were detached (void task()), the callback would resolve
    // immediately and `resolved` would still be false.
    await callbackPromise;
    expect(resolved).toBe(true);
  });

  it("logs errors from the task without rethrowing", async () => {
    const task = vi.fn().mockRejectedValue(new Error("provider down"));
    scheduleAiJobProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "AI job processing failed",
      expect.objectContaining({ code: "INTERNAL_ERROR" })
    );
  });

  it("warns when after() is unavailable (no request context)", () => {
    afterMock.mockImplementation(() => {
      throw new Error("No request context");
    });

    scheduleAiJobProcessing(vi.fn().mockResolvedValue(undefined));
    expect(logger.warn).toHaveBeenCalledWith(
      "AI job processing was not scheduled"
    );
  });
});
