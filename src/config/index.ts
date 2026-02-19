import { ServiceConfig } from "../types/contracts";

/**
 * Helper function to throw an error for missing required environment variables.
 */
function requireEnv(name: string): never {
  throw new Error(`Missing required environment variable: ${name}`);
}

/**
 * Load configuration from environment variables.
 * All environment variables are required.
 */
export function loadConfig(): ServiceConfig {
  const port = process.env.PORT;
  const hmacSecret = process.env.HMAC_SECRET;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const eigencloudApiKey = process.env.EIGENCLOUD_API_KEY;
  const eigencloudBaseUrl = process.env.EIGENCLOUD_BASE_URL;
  const connectTimeout = process.env.CONNECT_TIMEOUT;
  const requestTimeout = process.env.REQUEST_TIMEOUT;
  const rateLimitPerUser = process.env.RATE_LIMIT_PER_USER;
  const globalConcurrency = process.env.GLOBAL_CONCURRENCY;
  const maxRetries = process.env.MAX_RETRIES;
  const retryBackoffMs = process.env.RETRY_BACKOFF_MS;
  const logLevel = process.env.LOG_LEVEL;

  return {
    port: port ? parseInt(port, 10) : requireEnv("PORT"),
    hmacSecret: hmacSecret || requireEnv("HMAC_SECRET"),
    openrouterApiKey: openrouterApiKey || requireEnv("OPENROUTER_API_KEY"),
    openaiApiKey: openaiApiKey || requireEnv("OPENAI_API_KEY"),
    eigencloudApiKey: eigencloudApiKey || "",
    eigencloudBaseUrl: eigencloudBaseUrl || "https://eigenai-sepolia.eigencloud.xyz/v1",
    connectTimeout: connectTimeout
      ? parseInt(connectTimeout, 10)
      : requireEnv("CONNECT_TIMEOUT"),
    requestTimeout: requestTimeout
      ? parseInt(requestTimeout, 10)
      : requireEnv("REQUEST_TIMEOUT"),
    rateLimitPerUser: rateLimitPerUser
      ? parseInt(rateLimitPerUser, 10)
      : requireEnv("RATE_LIMIT_PER_USER"),
    globalConcurrency: globalConcurrency
      ? parseInt(globalConcurrency, 10)
      : requireEnv("GLOBAL_CONCURRENCY"),
    maxRetries: maxRetries
      ? parseInt(maxRetries, 10)
      : requireEnv("MAX_RETRIES"),
    retryBackoffMs: retryBackoffMs
      ? parseInt(retryBackoffMs, 10)
      : requireEnv("RETRY_BACKOFF_MS"),
    logLevel: logLevel || requireEnv("LOG_LEVEL"),
  };
}

/**
 * Validate the loaded configuration.
 * Since all values are required at load time, this focuses on value constraints.
 */
export function validateConfig(config: ServiceConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535) {
    errors.push("PORT must be between 1 and 65535");
  }

  if (config.globalConcurrency < 1) {
    errors.push("GLOBAL_CONCURRENCY must be at least 1");
  }

  if (config.rateLimitPerUser < 1) {
    errors.push("RATE_LIMIT_PER_USER must be at least 1");
  }

  if (config.connectTimeout < 1) {
    errors.push("CONNECT_TIMEOUT must be at least 1");
  }

  if (config.requestTimeout < 1) {
    errors.push("REQUEST_TIMEOUT must be at least 1");
  }

  if (config.maxRetries < 0) {
    errors.push("MAX_RETRIES must be at least 0");
  }

  if (config.retryBackoffMs < 0) {
    errors.push("RETRY_BACKOFF_MS must be at least 0");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
