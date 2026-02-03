import Fastify from "fastify";
import cors from "@fastify/cors";
import pino from "pino";
import type {
  ServiceConfig,
  ChatCompletionRequest,
  HealthResponse,
} from "./types/contracts";
import { LLMErrorCode } from "./types/contracts";
import { ChatService } from "./services/chat.service";
import { modelCatalog } from "./utils/model-catalog";
import { logger } from "./utils/logger";
import { verifyRequest, HMAC_HEADERS } from "./utils/hmac";

export async function createServer(config: ServiceConfig) {
  const fastify = Fastify({
    logger: {
      base: null,
      level: config.logLevel,
      transport:
        config.logLevel === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
              },
            }
          : undefined,
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
  });

  // CORS
  await fastify.register(cors, {
    origin: false, // Internal service, no CORS needed
  });

  // Initialize chat service
  const chatService = new ChatService(config);

  // Auth middleware | HMAC signature verification
  fastify.addHook("preHandler", async (request, reply) => {
    // Skip auth for health endpoints
    if (request.url === "/health" || request.url === "/ready") {
      return;
    }

    const timestamp = request.headers[HMAC_HEADERS.TIMESTAMP] as string;
    const signature = request.headers[HMAC_HEADERS.SIGNATURE] as string;

    if (!timestamp || !signature) {
      reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing required authentication headers",
        },
      });
      return;
    }

    // Get request body as string for signature verification
    const bodyStr = request.body ? JSON.stringify(request.body) : "";

    const result = verifyRequest(
      config.hmacSecret,
      request.method,
      request.url,
      bodyStr,
      timestamp,
      signature,
    );

    if (!result.valid) {
      logger.warn({ error: result.error }, "HMAC verification failed");
      reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: result.error || "Invalid signature",
        },
      });
      return;
    }
  });

  // Health check
  fastify.get("/health", async (_request, reply) => {
    const health = await chatService.healthCheck();

    const response: HealthResponse = {
      status: health.healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      providers: health.providers,
    };

    reply.code(health.healthy ? 200 : 503).send(response);
  });

  // Readiness check
  fastify.get("/ready", async (_request, reply) => {
    const health = await chatService.healthCheck();

    if (health.healthy) {
      reply.send({
        status: "ready",
        timestamp: new Date().toISOString(),
      });
    } else {
      reply.code(503).send({
        status: "not ready",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // List models
  fastify.get("/v1/models", async (_request, reply) => {
    const models = modelCatalog.getModelsList();
    reply.send({
      success: true,
      data: models,
    });
  });

  // Chat completion
  fastify.post<{ Body: ChatCompletionRequest }>(
    "/v1/chat",
    async (request, reply) => {
      const startTime = Date.now();

      try {
        // Validate request
        const {
          provider,
          model,
          messages,
          temperature: _temperature,
          maxOutputTokens: _maxOutputTokens,
          responseSchema: _responseSchema,
          requestId,
          userId,
        } = request.body;

        if (!provider || !model || !messages || !userId) {
          reply.code(400).send({
            success: false,
            error: {
              code: LLMErrorCode.INVALID_REQUEST,
              message:
                "Missing required fields: provider, model, messages, userId",
            },
          });
          return;
        }

        if (!Array.isArray(messages) || messages.length === 0) {
          reply.code(400).send({
            success: false,
            error: {
              code: LLMErrorCode.INVALID_REQUEST,
              message: "messages must be a non-empty array",
            },
          });
          return;
        }

        // Execute chat
        const response = await chatService.chat(request.body);

        const latencyMs = Date.now() - startTime;

        logger.info(
          {
            requestId,
            userId,
            provider,
            model,
            latencyMs,
          },
          "Chat request completed",
        );

        reply.send({
          success: true,
          data: response,
        });
      } catch (error: any) {
        const latencyMs = Date.now() - startTime;

        // Handle ChatCompletionError
        if (error.code && error.message) {
          const statusCode =
            error.code === LLMErrorCode.RATE_LIMIT_EXCEEDED
              ? 429
              : error.code === LLMErrorCode.INVALID_REQUEST
                ? 400
                : error.code === LLMErrorCode.MODEL_NOT_FOUND
                  ? 404
                  : 500;

          logger.error(
            {
              requestId: request.body.requestId,
              userId: request.body.userId,
              error: error.message,
              code: error.code,
              latencyMs,
            },
            "Chat request failed",
          );

          reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
              retryable: error.retryable,
            },
          });
          return;
        }

        // Unknown error
        logger.error(
          {
            requestId: request.body.requestId,
            error: error.message || String(error),
            latencyMs,
          },
          "Chat request failed with unknown error",
        );

        reply.code(500).send({
          success: false,
          error: {
            code: LLMErrorCode.INTERNAL_ERROR,
            message: "Internal server error",
          },
        });
      }
    },
  );

  // Graceful shutdown
  const closeGracefully = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");

    chatService.destroy();

    await fastify.close();
    logger.info("Server closed");
    process.exit(0);
  };

  process.on("SIGINT", () => closeGracefully("SIGINT"));
  process.on("SIGTERM", () => closeGracefully("SIGTERM"));

  return fastify;
}
