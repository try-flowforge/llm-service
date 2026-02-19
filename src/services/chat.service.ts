import type { ServiceConfig } from "../types/contracts";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionError,
} from "../types/contracts";
import { LLMErrorCode } from "../types/contracts";
import { OpenAIClient } from "../providers/openai-client";
import { OpenRouterClient } from "../providers/openrouter-client";
import { EigenCloudClient } from "../providers/eigencloud-client";
import { modelCatalog } from "../utils/model-catalog";
import { jsonValidator } from "../utils/json-validator";
import { RateLimiter } from "../utils/rate-limiter";
import { ConcurrencyLimiter } from "../utils/concurrency-limiter";
import { logger } from "../utils/logger";

export class ChatService {
  private openaiClient?: OpenAIClient;
  private openrouterClient?: OpenRouterClient;
  private eigencloudClient?: EigenCloudClient;
  private rateLimiter: RateLimiter;
  private concurrencyLimiter: ConcurrencyLimiter;
  private config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;

    // Initialize providers
    if (config.openaiApiKey) {
      this.openaiClient = new OpenAIClient(
        config.openaiApiKey,
        config.requestTimeout,
      );
      logger.info("OpenAI client initialized");
    }

    if (config.openrouterApiKey) {
      this.openrouterClient = new OpenRouterClient(
        config.openrouterApiKey,
        config.requestTimeout,
      );
      logger.info("OpenRouter client initialized");
    }

    if (config.eigencloudApiKey) {
      this.eigencloudClient = new EigenCloudClient(
        config.eigencloudApiKey,
        config.eigencloudBaseUrl,
        config.requestTimeout,
      );
      logger.info("EigenCloud client initialized");
    }

    // Initialize limiters
    this.rateLimiter = new RateLimiter(config.rateLimitPerUser);
    this.concurrencyLimiter = new ConcurrencyLimiter(config.globalConcurrency);

    logger.info("Chat service initialized");
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const {
      provider,
      model,
      messages,
      temperature,
      maxOutputTokens,
      responseSchema,
      requestId,
      userId,
    } = request;

    // Map frontend model IDs (like "openrouter:glm") to catalog model IDs (like "openrouter-glm-free")
    const catalogModelId = this.mapModelIdToCatalogId(model, provider);

    // Validate model exists - try to find by catalog ID first
    let modelDef = modelCatalog.getModel(catalogModelId);

    // If not found by ID, try provider+model lookup (for direct model strings)
    if (!modelDef) {
      modelDef = modelCatalog.getModelByProviderAndModel(provider, model);
    }

    if (!modelDef) {
      throw this.createError(
        LLMErrorCode.MODEL_NOT_FOUND,
        `Model not found: ${provider}/${model}`,
        false,
      );
    }

    // Use the actual model string from the catalog (not the ID)
    const actualModel = modelDef.model;

    // Check rate limit
    const rateLimitCheck = this.rateLimiter.checkLimit(userId);
    if (!rateLimitCheck.allowed) {
      throw this.createError(
        LLMErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded for user. Try again in ${rateLimitCheck.retryAfter} seconds`,
        true,
        { retryAfter: rateLimitCheck.retryAfter },
      );
    }

    // Execute with concurrency limit and retries
    return await this.concurrencyLimiter.execute(async () => {
      return await this.executeWithRetry(
        provider,
        actualModel, // Use the actual model string from catalog
        messages,
        temperature,
        maxOutputTokens,
        responseSchema,
        requestId,
      );
    });
  }

  private async executeWithRetry(
    provider: string,
    model: string,
    messages: any[],
    temperature: number = 0.7,
    maxOutputTokens?: number,
    responseSchema?: Record<string, any>,
    requestId?: string,
    attempt: number = 1,
  ): Promise<ChatCompletionResponse> {
    try {
      // Get the provider client
      const client = this.getClient(provider);

      // Execute chat
      const response = await client.chat(
        model,
        messages,
        temperature,
        maxOutputTokens,
        responseSchema,
        requestId,
      );

      // Validate JSON if schema provided
      if (responseSchema && response.json) {
        const validation = jsonValidator.validateResponse(
          response.json,
          responseSchema,
        );
        if (!validation.valid && validation.error) {
          throw validation.error;
        }
      }

      return response;
    } catch (error) {
      const chatError = error as ChatCompletionError;

      // Don't retry if not retryable or max retries reached
      if (!chatError.retryable || attempt >= this.config.maxRetries) {
        throw error;
      }

      // Calculate backoff
      const backoffMs = this.config.retryBackoffMs * Math.pow(2, attempt - 1);

      logger.warn(
        {
          requestId,
          provider,
          model,
          attempt,
          error: chatError.message,
          backoffMs,
        },
        "Retrying chat request after error",
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, backoffMs));

      // Retry
      return await this.executeWithRetry(
        provider,
        model,
        messages,
        temperature,
        maxOutputTokens,
        responseSchema,
        requestId,
        attempt + 1,
      );
    }
  }

  private getClient(provider: string): OpenAIClient | OpenRouterClient | EigenCloudClient {
    if (provider === "openai") {
      if (!this.openaiClient) {
        throw this.createError(
          LLMErrorCode.PROVIDER_NOT_CONFIGURED,
          "OpenAI provider not configured (missing API key)",
          false,
        );
      }
      return this.openaiClient;
    }

    if (provider === "openrouter") {
      if (!this.openrouterClient) {
        throw this.createError(
          LLMErrorCode.PROVIDER_NOT_CONFIGURED,
          "OpenRouter provider not configured (missing API key)",
          false,
        );
      }
      return this.openrouterClient;
    }

    if (provider === "eigencloud") {
      if (!this.eigencloudClient) {
        throw this.createError(
          LLMErrorCode.PROVIDER_NOT_CONFIGURED,
          "EigenCloud provider not configured (missing API key)",
          false,
        );
      }
      return this.eigencloudClient;
    }

    throw this.createError(
      LLMErrorCode.INVALID_REQUEST,
      `Unknown provider: ${provider}`,
      false,
    );
  }

  /**
   * Map frontend model IDs to catalog model IDs
   */
  private mapModelIdToCatalogId(model: string, provider: string): string {
    // If it's already a catalog ID format (contains hyphens), return as-is
    if (model.includes("-") && !model.includes(":")) {
      return model;
    }

    // Map frontend model IDs to catalog IDs
    if (provider === "openrouter") {
      if (model.startsWith("openrouter:")) {
        const modelName = model.replace("openrouter:", "");
        return `openrouter-${modelName}-free`;
      }
    }

    if (provider === "openai") {
      if (model === "gpt-5-nano") {
        return "openai-chatgpt";
      }
    }

    if (provider === "eigencloud") {
      if (model.startsWith("eigencloud:")) {
        const modelName = model.replace("eigencloud:", "");
        return `eigencloud-${modelName}`;
      }
    }

    // Return original if no mapping found (will try provider+model lookup)
    return model;
  }

  private createError(
    code: LLMErrorCode,
    message: string,
    retryable: boolean,
    details?: any,
  ): ChatCompletionError {
    return {
      code,
      message,
      retryable,
      details,
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    providers: { openai: boolean; openrouter: boolean; eigencloud: boolean };
  }> {
    return {
      healthy: !!(this.openaiClient || this.openrouterClient || this.eigencloudClient),
      providers: {
        openai: !!this.openaiClient,
        openrouter: !!this.openrouterClient,
        eigencloud: !!this.eigencloudClient,
      },
    };
  }

  destroy(): void {
    this.rateLimiter.destroy();
    logger.info("Chat service destroyed");
  }
}
