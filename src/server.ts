import Fastify from "fastify";
import cors from "@fastify/cors";
import pino from "pino";
import type {
  ServiceConfig,
} from "./types/contracts";
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

  // List models
  fastify.get("/v1/models", async (_request, reply) => {
    const models = modelCatalog.getModelsList();
    reply.send({
      success: true,
      data: models,
    });
  });

  // Graceful shutdown
  const closeGracefully = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");

    await fastify.close();
    logger.info("Server closed");
    process.exit(0);
  };

  process.on("SIGINT", () => closeGracefully("SIGINT"));
  process.on("SIGTERM", () => closeGracefully("SIGTERM"));

  return fastify;
}
