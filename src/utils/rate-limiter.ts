export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private lastCallTime = 0;

  constructor(
    private maxConcurrent: number = 3,
    private minIntervalMs: number = 500
  ) {}

  async acquire(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.activeCount++;

    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    const remaining = this.minIntervalMs - elapsed;

    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }

    this.lastCallTime = Date.now();
  }

  release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeRequests(): number {
    return this.activeCount;
  }
}

export class RetryHandler {
  static async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          const jitter = Math.random() * 500;
          const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
