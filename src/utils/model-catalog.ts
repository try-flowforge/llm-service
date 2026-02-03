import { readFileSync } from "fs";
import { join } from "path";
import type { ModelDefinition, ModelsListResponse } from "../types/contracts";
import { logger } from "./logger";

export class ModelCatalog {
  private models: Map<string, ModelDefinition> = new Map();

  constructor() {
    this.loadModels();
  }

  private loadModels(): void {
    try {
      const catalogPath = join(__dirname, "../../config/models.json");
      const catalogData = readFileSync(catalogPath, "utf-8");
      const catalog = JSON.parse(catalogData) as { models: ModelDefinition[] };

      for (const model of catalog.models) {
        this.models.set(model.id, model);
      }

      logger.info({ modelCount: this.models.size }, "Model catalog loaded");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to load model catalog",
      );
      throw new Error("Failed to load model catalog");
    }
  }

  getModel(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  getAllModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  getModelsList(): ModelsListResponse {
    return {
      models: this.getAllModels(),
    };
  }

  getModelByProviderAndModel(
    provider: string,
    model: string,
  ): ModelDefinition | undefined {
    return Array.from(this.models.values()).find(
      (m) => m.provider === provider && m.model === model,
    );
  }
}

export const modelCatalog = new ModelCatalog();
