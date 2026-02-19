import { request } from "undici";
import type {
    ChatMessage,
    ChatCompletionResponse,
    ChatCompletionError,
} from "../types/contracts";
import { LLMErrorCode } from "../types/contracts";
import { logger } from "../utils/logger";

const DEFAULT_SEED = 42;

export class EigenCloudClient {
    private apiKey: string;
    private baseUrl: string;
    private requestTimeout: number;

    constructor(apiKey: string, baseUrl: string, requestTimeout: number) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/+$/, ""); // strip trailing slash
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
            logger.info(
                {
                    requestId,
                    provider: "eigencloud",
                    model,
                },
                "EigenCloud chat request started",
            );

            const requestBody: any = {
                model,
                messages,
                seed: DEFAULT_SEED,
            };

            if (temperature !== undefined) {
                requestBody.temperature = temperature;
            }

            if (maxTokens) {
                requestBody.max_tokens = maxTokens;
            }

            if (responseSchema) {
                requestBody.response_format = { type: "json_object" };
            }

            const apiUrl = `${this.baseUrl}/chat/completions`;

            const {
                statusCode,
                headers: _headers,
                body,
            } = await request(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": this.apiKey,
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
                        provider: "eigencloud",
                        model,
                        statusCode,
                        latencyMs,
                    },
                    "EigenCloud request failed",
                );

                throw this.handleHttpError(statusCode, responseText);
            }

            const response = JSON.parse(responseText);
            const message = response.choices?.[0]?.message || {};

            let content = message.content || "";

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
                        "Failed to parse JSON response from EigenCloud",
                    );
                    throw this.createError(
                        LLMErrorCode.JSON_PARSE_FAILED,
                        "Failed to parse JSON response",
                        false,
                        { content },
                    );
                }
            }

            logger.info(
                {
                    requestId,
                    provider: "eigencloud",
                    model,
                    latencyMs,
                    hasSignature: !!response.signature,
                },
                "EigenCloud chat request completed",
            );

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
                eigenaiMeta: {
                    signature: response.signature || undefined,
                    chainId: response.chain_id || undefined,
                },
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;
            logger.error(
                {
                    requestId,
                    provider: "eigencloud",
                    model,
                    latencyMs,
                    error: error instanceof Error ? error.message : String(error),
                },
                "EigenCloud chat request failed",
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
        let errorMessage = `EigenCloud HTTP ${statusCode}`;
        let errorCode = LLMErrorCode.PROVIDER_ERROR;
        let retryable = false;

        try {
            const errorBody = JSON.parse(responseText);
            errorMessage = errorBody.error?.message || errorMessage;
        } catch {
            // Failed to parse error body
        }

        if (statusCode === 429) {
            errorCode = LLMErrorCode.PROVIDER_RATE_LIMITED;
            retryable = true;
        }

        if (statusCode === 401 || statusCode === 403) {
            errorCode = LLMErrorCode.PROVIDER_AUTH_FAILED;
        }

        if (statusCode >= 500) {
            retryable = true;
        }

        return this.createError(errorCode, errorMessage, retryable, {
            statusCode,
            responseText,
        });
    }

    private handleError(error: unknown): ChatCompletionError {
        if (
            error instanceof Error &&
            (error.message.includes("timeout") || error.message.includes("ETIMEDOUT"))
        ) {
            return this.createError(
                LLMErrorCode.PROVIDER_TIMEOUT,
                `EigenCloud request timed out after ${this.requestTimeout}ms`,
                true,
            );
        }

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
