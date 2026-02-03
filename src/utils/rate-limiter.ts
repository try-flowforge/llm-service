import { logger } from "./logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private maxRequestsPerMinute: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxRequestsPerMinute: number) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  checkLimit(userId: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.limits.get(userId);

    // No entry or expired - allow and create new
    if (!entry || now >= entry.resetAt) {
      this.limits.set(userId, {
        count: 1,
        resetAt: now + 60000, // 1 minute from now
      });
      return { allowed: true };
    }

    // Entry exists and not expired
    if (entry.count >= this.maxRequestsPerMinute) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      logger.warn(
        { userId, count: entry.count, retryAfter },
        "Rate limit exceeded",
      );
      return { allowed: false, retryAfter };
    }

    // Increment count
    entry.count++;
    this.limits.set(userId, entry);
    return { allowed: true };
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, entry] of this.limits.entries()) {
      if (now >= entry.resetAt) {
        this.limits.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, "Rate limiter cleanup completed");
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}
