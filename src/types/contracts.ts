/**
 * LLM Service API Contracts
 * Shared types between microservice, backend, and frontend
 */

export type LLMProvider = "openrouter" | "openai";

export interface ModelDefinition {
  id: string;
  provider: LLMProvider;
  displayName: string;
  model: string;
  maxTokens: number;
  supportsJsonMode: boolean;
  costTier?: "free" | "paid";
}

export interface ModelsListResponse {
  models: ModelDefinition[];
}

export interface ServiceConfig {
  port: number;
  hmacSecret: string;
  openrouterApiKey: string;
  openaiApiKey: string;

  // Timeouts (ms)
  connectTimeout: number;
  requestTimeout: number;

  // Rate limits
  rateLimitPerUser: number;
  globalConcurrency: number;

  // Retries
  maxRetries: number;
  retryBackoffMs: number;

  // Logging
  logLevel: string;
}
