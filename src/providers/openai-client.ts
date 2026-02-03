import OpenAI from "openai";
import type {
  ChatMessage,
  ChatCompletionResponse,
  ChatCompletionError,
} from "../types/contracts";
import { LLMErrorCode } from "../types/contracts";
import { logger } from "../utils/logger";

export class OpenAIClient {
  private client: OpenAI;
  private requestTimeout: number;

  constructor(apiKey: string, requestTimeout: number) {
    this.client = new OpenAI({
      apiKey,
      timeout: requestTimeout,
      maxRetries: 0,
    });
    this.requestTimeout = requestTimeout;
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    temperature: number = 0.7,
    maxTokens?: number,
    responseSchema?: Record<string, any>,
    requestId?: string,
  ): Promise<ChatCompletionResponse> {
    const startTime = Date.now();

    try {
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_completion_tokens: maxTokens,
      };

      // Skip temperature for reasoning models
      const isReasoningModel =
        model.includes("gpt-5") ||
        model.startsWith("o1") ||
        model.startsWith("o3");
      if (!isReasoningModel && temperature !== undefined) {
        params.temperature = temperature;
      }

      // Use structured outputs if schema provided
      if (responseSchema) {
        params.response_format = {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema: responseSchema,
          },
        };
      }

      const completion = await this.client.chat.completions.create(params);

      const latencyMs = Date.now() - startTime;
      const content = completion.choices[0]?.message?.content || "";

      logger.info(
        {
          requestId,
          provider: "openai",
          latencyMs,
        },
        "OpenAI chat request completed",
      );

      // Parse JSON if schema was provided
      let parsedJson: Record<string, any> | undefined;
      if (responseSchema && content) {
        try {
          parsedJson = JSON.parse(content);
        } catch (err) {
          logger.error(
            {
              requestId,
              error: err instanceof Error ? err.message : String(err),
            },
            "Failed to parse JSON response from OpenAI",
          );
          throw this.createError(
            LLMErrorCode.JSON_PARSE_FAILED,
            "Failed to parse JSON response",
            false,
            { content },
          );
        }
      }

      return {
        text: content,
        json: parsedJson,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
        providerRequestId: completion.id,
        model: completion.model,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error(
        {
          requestId,
          provider: "openai",
          latencyMs,
          error: error instanceof Error ? error.message : String(error),
        },
        "OpenAI chat request failed",
      );

      throw this.handleError(error, requestId);
    }
  }

  private handleError(
    error: unknown,
    _requestId?: string,
  ): ChatCompletionError {
    if (error instanceof OpenAI.APIError) {
      // Rate limit
      if (error.status === 429) {
        return this.createError(
          LLMErrorCode.PROVIDER_RATE_LIMITED,
          "OpenAI rate limit exceeded",
          true,
          { status: error.status, message: error.message },
        );
      }

      // Auth error
      if (error.status === 401 || error.status === 403) {
        return this.createError(
          LLMErrorCode.PROVIDER_AUTH_FAILED,
          "OpenAI authentication failed",
          false,
          { status: error.status },
        );
      }

      // Timeout
      if (error.code === "ETIMEDOUT" || error.message.includes("timeout")) {
        return this.createError(
          LLMErrorCode.PROVIDER_TIMEOUT,
          `OpenAI request timed out after ${this.requestTimeout}ms`,
          true,
        );
      }

      // Generic provider error
      return this.createError(
        LLMErrorCode.PROVIDER_ERROR,
        `OpenAI error: ${error.message}`,
        error.status ? error.status >= 500 : false,
        { status: error.status, code: error.code },
      );
    }

    // Unknown error
    return this.createError(
      LLMErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Unknown error",
      false,
    );
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
}
