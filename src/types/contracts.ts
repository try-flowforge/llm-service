/**
 * LLM Service API Contracts
 * Shared types between microservice, backend, and frontend
 */

export type LLMProvider = "openrouter" | "openai" | "eigencloud";

export interface ModelDefinition {
  id: string;
  provider: LLMProvider;
  displayName: string;
  model: string;
  maxTokens: number;
  supportsJsonMode: boolean;
  costTier?: "free" | "paid";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, any>;
  requestId: string;
  userId: string;
}

export interface ChatCompletionResponse {
  text: string;
  json?: Record<string, any>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  providerRequestId?: string;
  model: string;
  eigenaiMeta?: {
    signature?: string;
    chainId?: number;
  };
}

export interface ChatCompletionError {
  code: string;
  message: string;
  details?: any;
  retryable?: boolean;
}

export interface ModelsListResponse {
  models: ModelDefinition[];
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  providers?: {
    openrouter: boolean;
    openai: boolean;
    eigencloud: boolean;
  };
}

export enum LLMErrorCode {
  // Configuration errors
  INVALID_REQUEST = "INVALID_REQUEST",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  LLM_MODEL_NOT_CONFIGURED = "LLM_MODEL_NOT_CONFIGURED",
  PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED",

  // Rate limiting
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  CONCURRENCY_LIMIT_EXCEEDED = "CONCURRENCY_LIMIT_EXCEEDED",

  // Provider errors
  PROVIDER_ERROR = "PROVIDER_ERROR",
  PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT",
  PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED",
  PROVIDER_AUTH_FAILED = "PROVIDER_AUTH_FAILED",

  // Validation errors
  JSON_VALIDATION_FAILED = "JSON_VALIDATION_FAILED",
  JSON_PARSE_FAILED = "JSON_PARSE_FAILED",
  SCHEMA_VALIDATION_FAILED = "SCHEMA_VALIDATION_FAILED",

  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  TIMEOUT = "TIMEOUT",
}

export interface ServiceConfig {
  port: number;
  hmacSecret: string;
  openrouterApiKey: string;
  openaiApiKey: string;
  eigencloudApiKey: string;
  eigencloudBaseUrl: string;

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
