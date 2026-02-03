import { request } from "undici";
import type {
  ChatMessage,
  ChatCompletionResponse,
  ChatCompletionError,
} from "../types/contracts";
import { LLMErrorCode } from "../types/contracts";
import { logger } from "../utils/logger";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterClient {
  private apiKey: string;
  private requestTimeout: number;

  constructor(apiKey: string, requestTimeout: number) {
    this.apiKey = apiKey;
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

    // Validate model is not a placeholder
    if (model.startsWith("openrouter:")) {
      throw this.createError(
        LLMErrorCode.LLM_MODEL_NOT_CONFIGURED,
        `OpenRouter model placeholder "${model}" must be replaced with a real OpenRouter model ID`,
        false,
        { model },
      );
    }

    try {
      logger.info(
        {
          requestId,
          provider: "openrouter",
          model,
        },
        "OpenRouter chat request started",
      );

      const requestBody: any = {
        model,
        messages,
        temperature,
      };

      if (maxTokens) {
        requestBody.max_tokens = maxTokens;
      }

      if (responseSchema) {
        requestBody.response_format = { type: "json_object" };
      }

      const {
        statusCode,
        headers: _headers,
        body,
      } = await request(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://agentic-workflows.com",
          "X-Title": "Agentic Workflows",
        },
        body: JSON.stringify(requestBody),
        bodyTimeout: this.requestTimeout,
        headersTimeout: this.requestTimeout,
      });

      const responseText = await body.text();
      const latencyMs = Date.now() - startTime;

      if (statusCode !== 200) {
        logger.error(
          {
            requestId,
            provider: "openrouter",
            model,
            statusCode,
            latencyMs,
          },
          "OpenRouter request failed",
        );

        throw this.handleHttpError(statusCode, responseText);
      }

      const response = JSON.parse(responseText);
      const message = response.choices?.[0]?.message || {};

      let content = message.content || "";

      if (!content && response.usage?.completion_tokens > 0) {
        content = message.answer || message.reasoning || message.text || "";

        if (
          !content &&
          typeof message.content === "object" &&
          message.content !== null
        ) {
          content =
            message.content.text ||
            message.content.answer ||
            JSON.stringify(message.content);
        }
      }

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
            "Failed to parse JSON response from OpenRouter",
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
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens || 0,
              completionTokens: response.usage.completion_tokens || 0,
              totalTokens: response.usage.total_tokens || 0,
            }
          : undefined,
        providerRequestId: response.id,
        model: response.model || model,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error(
        {
          requestId,
          provider: "openrouter",
          model,
          latencyMs,
          error: error instanceof Error ? error.message : String(error),
        },
        "OpenRouter chat request failed",
      );

      // Re-throw if already a ChatCompletionError
      if (this.isChatCompletionError(error)) {
        throw error;
      }

      throw this.handleError(error);
    }
  }

  private handleHttpError(
    statusCode: number,
    responseText: string,
  ): ChatCompletionError {
    let errorMessage = `OpenRouter HTTP ${statusCode}`;
    let errorCode = LLMErrorCode.PROVIDER_ERROR;
    let retryable = false;

    try {
      const errorBody = JSON.parse(responseText);
      errorMessage = errorBody.error?.message || errorMessage;
    } catch {
      // Failed to parse error body
    }

    // Rate limiting
    if (statusCode === 429) {
      errorCode = LLMErrorCode.PROVIDER_RATE_LIMITED;
      retryable = true;
    }

    // Auth errors
    if (statusCode === 401 || statusCode === 403) {
      errorCode = LLMErrorCode.PROVIDER_AUTH_FAILED;
    }

    // Server errors (retryable)
    if (statusCode >= 500) {
      retryable = true;
    }

    return this.createError(errorCode, errorMessage, retryable, {
      statusCode,
      responseText,
    });
  }

  private handleError(error: unknown): ChatCompletionError {
    // Timeout errors
    if (
      error instanceof Error &&
      (error.message.includes("timeout") || error.message.includes("ETIMEDOUT"))
    ) {
      return this.createError(
        LLMErrorCode.PROVIDER_TIMEOUT,
        `OpenRouter request timed out after ${this.requestTimeout}ms`,
        true,
      );
    }

    // Generic error
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

  private isChatCompletionError(error: unknown): error is ChatCompletionError {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error
    );
  }
}
