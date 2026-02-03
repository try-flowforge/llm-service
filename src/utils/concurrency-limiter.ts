import { logger } from './logger';
import { LLMErrorCode } from '../types/contracts';
import type { ChatCompletionError } from '../types/contracts';

export class ConcurrencyLimiter {
  private activeRequests = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check concurrency limit
    if (this.activeRequests >= this.maxConcurrency) {
      const error: ChatCompletionError = {
        code: LLMErrorCode.CONCURRENCY_LIMIT_EXCEEDED,
        message: `Service concurrency limit reached (${this.maxConcurrency} concurrent requests)`,
        retryable: true,
      };
      throw error;
    }

    this.activeRequests++;
    logger.debug({ activeRequests: this.activeRequests }, 'Concurrency limiter: request started');

    try {
      return await fn();
    } finally {
      this.activeRequests--;
      logger.debug({ activeRequests: this.activeRequests }, 'Concurrency limiter: request completed');
    }
  }

  getActiveRequests(): number {
    return this.activeRequests;
  }
}
