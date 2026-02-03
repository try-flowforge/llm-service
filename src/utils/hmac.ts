import crypto from "crypto";

/**
 * HMAC-based request signing for secure inter-service communication.
 */

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface SignedRequest {
  timestamp: string;
  signature: string;
}

/**
 * Create HMAC signature for a request.
 * Signature = HMAC-SHA256(timestamp + method + path + body)
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp?: string,
): SignedRequest {
  const ts = timestamp || Date.now().toString();
  const payload = `${ts}:${method.toUpperCase()}:${path}:${body}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return {
    timestamp: ts,
    signature,
  };
}

/**
 * Verify HMAC signature for a request.
 * Returns true if signature is valid and timestamp is within tolerance.
 */
export function verifyRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
  signature: string,
): { valid: boolean; error?: string } {
  // Check timestamp freshness
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();

  if (isNaN(requestTime)) {
    return { valid: false, error: "Invalid timestamp format" };
  }

  if (Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE_MS) {
    return {
      valid: false,
      error: "Request expired or timestamp too far in future",
    };
  }

  // Verify signature
  const { signature: expectedSignature } = signRequest(
    secret,
    method,
    path,
    body,
    timestamp,
  );

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: "Invalid signature" };
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}

// Header names for signed requests
export const HMAC_HEADERS = {
  TIMESTAMP: "x-timestamp",
  SIGNATURE: "x-signature",
} as const;
