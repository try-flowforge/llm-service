import "dotenv/config";
import { loadConfig, validateConfig } from "./config";
import { createServer } from "./server";
import { logger } from "./utils/logger";

async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.error({ errors: validation.errors }, "Invalid configuration");
      process.exit(1);
    }

    // Create and start server
    const server = await createServer(config);

    await server.listen({
      port: config.port,
      host: "0.0.0.0",
    });

    logger.info({ port: config.port }, "LLM service started");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to start server",
    );
    process.exit(1);
  }
}

main();
