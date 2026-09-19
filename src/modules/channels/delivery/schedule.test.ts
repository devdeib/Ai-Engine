/**
 * Channel delivery scheduling tests. Same after() reliability contract as AI scheduling.
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
import { scheduleChannelDeliveryProcessing } from "@/modules/channels/delivery/schedule";

describe("scheduleChannelDeliveryProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the task with after()", () => {
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleChannelDeliveryProcessing(task);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("awaits the task inside the after() callback", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleChannelDeliveryProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    await callback();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not detach the task with void", async () => {
    let resolved = false;
    const task = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      resolved = true;
    });
    scheduleChannelDeliveryProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    await callback();
    expect(resolved).toBe(true);
  });

  it("logs errors without rethrowing", async () => {
    const task = vi.fn().mockRejectedValue(new Error("send failed"));
    scheduleChannelDeliveryProcessing(task);

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "Channel delivery processing failed",
      expect.objectContaining({ code: "INTERNAL_ERROR" })
    );
  });

  it("warns when after() is unavailable", () => {
    afterMock.mockImplementation(() => {
      throw new Error("No request context");
    });

    scheduleChannelDeliveryProcessing(vi.fn().mockResolvedValue(undefined));
    expect(logger.warn).toHaveBeenCalledWith(
      "Channel delivery processing was not scheduled"
    );
  });
});
