import Ajv from "ajv";
import addFormats from "ajv-formats";
import { LLMErrorCode } from "../types/contracts";
import type { ChatCompletionError } from "../types/contracts";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: true,
});
addFormats(ajv);

export class JsonValidator {
  validateResponse(
    json: Record<string, any>,
    schema: Record<string, any>,
  ): { valid: boolean; error?: ChatCompletionError } {
    const validate = ajv.compile(schema);
    const valid = validate(json);

    if (!valid) {
      const errors =
        validate.errors
          ?.map((err) => `${err.instancePath || "root"} ${err.message}`)
          .join("; ") || "Unknown validation error";

      return {
        valid: false,
        error: {
          code: LLMErrorCode.SCHEMA_VALIDATION_FAILED,
          message: `JSON response does not match schema: ${errors}`,
          retryable: false,
          details: {
            errors: validate.errors,
            json,
          },
        },
      };
    }

    return { valid: true };
  }
}

export const jsonValidator = new JsonValidator();
