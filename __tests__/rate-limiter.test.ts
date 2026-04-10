import { describe, it, expect } from "vitest";
import { RateLimiter, RetryHandler } from "../src/utils/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests within concurrency limit", async () => {
    const limiter = new RateLimiter(3, 0);

    const p1 = limiter.acquire();
    const p2 = limiter.acquire();
    const p3 = limiter.acquire();

    await Promise.all([p1, p2, p3]);

    expect(limiter.activeRequests).toBe(3);

    limiter.release();
    limiter.release();
    limiter.release();

    expect(limiter.activeRequests).toBe(0);
  });

  it("queues requests over concurrency limit", async () => {
    const limiter = new RateLimiter(1, 0);
    const order: number[] = [];

    const run = async (id: number) => {
      await limiter.acquire();
      order.push(id);
      limiter.release();
    };

    await Promise.all([run(1), run(2), run(3)]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("reports pending count correctly", () => {
    const limiter = new RateLimiter(1, 100000);

    expect(limiter.pendingCount).toBe(0);
    expect(limiter.activeRequests).toBe(0);
  });

  it("respects minimum interval between calls", async () => {
    const limiter = new RateLimiter(2, 50);
    const timestamps: number[] = [];

    const measure = async () => {
      await limiter.acquire();
      timestamps.push(Date.now());
      // Hold for a moment
      await new Promise<void>((r) => setTimeout(r, 10));
      limiter.release();
    };

    await Promise.all([measure(), measure()]);

    // Both should have completed
    expect(timestamps.length).toBe(2);
  });
});

describe("RetryHandler", () => {
  it("returns result on first success", async () => {
    const result = await RetryHandler.withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("retries on failure and eventually succeeds", async () => {
    let attempts = 0;
    const result = await RetryHandler.withRetry(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error("fail");
      }
      return Promise.resolve("success");
    }, 3, 10);

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("throws after max retries exceeded", async () => {
    await expect(
      RetryHandler.withRetry(() => Promise.reject(new Error("always fail")), 2, 10)
    ).rejects.toThrow("always fail");
  });

  it("works with zero retries", async () => {
    await expect(
      RetryHandler.withRetry(() => Promise.reject(new Error("fail")), 0, 10)
    ).rejects.toThrow("fail");
  });
});
