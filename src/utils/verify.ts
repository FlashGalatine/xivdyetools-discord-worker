/**
 * Discord Request Signature Verification
 *
 * Discord requires all incoming interactions to be verified using Ed25519 signatures.
 * This prevents attackers from sending fake interactions to your endpoint.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */

import { verifyKey } from 'discord-interactions';

export interface VerificationResult {
  /** Whether the signature is valid */
  isValid: boolean;
  /** The raw request body (needed for parsing after verification) */
  body: string;
  /** Error message if verification failed */
  error?: string;
}

// Maximum request body size (100KB should be plenty for Discord interactions)
const MAX_BODY_SIZE = 100_000;

/**
 * Verifies that a request came from Discord using Ed25519 signature verification.
 *
 * @param request - The incoming HTTP request
 * @param publicKey - Your Discord application's public key
 * @returns Verification result with the request body
 */
export async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<VerificationResult> {
  // Check Content-Length header first (if present) to reject obviously large requests
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return {
      isValid: false,
      body: '',
      error: 'Request body too large',
    };
  }

  // Get required headers
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  if (!signature || !timestamp) {
    return {
      isValid: false,
      body: '',
      error: 'Missing signature headers',
    };
  }

  // Get the raw body
  const body = await request.text();

  // Verify actual body size (Content-Length can be spoofed)
  if (body.length > MAX_BODY_SIZE) {
    return {
      isValid: false,
      body: '',
      error: 'Request body too large',
    };
  }

  // Verify the signature
  try {
    const isValid = await verifyKey(body, signature, timestamp, publicKey);

    return {
      isValid,
      body,
      error: isValid ? undefined : 'Invalid signature',
    };
  } catch (error) {
    return {
      isValid: false,
      body,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Creates a 401 Unauthorized response for failed verification.
 */
export function unauthorizedResponse(message = 'Invalid request signature'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Creates a 400 Bad Request response.
 */
export function badRequestResponse(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 *
 * Regular string comparison (===) can leak information about the secret
 * because it short-circuits on the first non-matching character. This allows
 * attackers to measure response time differences to guess secrets.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  // Convert strings to Uint8Arrays for comparison
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // If lengths differ, we still need to do constant-time comparison
  // to avoid leaking length information. Use the longer length.
  const maxLength = Math.max(aBytes.length, bBytes.length);

  // Pad shorter array to match length (prevents length-based timing leak)
  const aPadded = new Uint8Array(maxLength);
  const bPadded = new Uint8Array(maxLength);
  aPadded.set(aBytes);
  bPadded.set(bBytes);

  // Use crypto.subtle.timingSafeEqual if available (Cloudflare Workers)
  try {
    // This is the preferred method as it's implemented in constant time
    const result = await crypto.subtle.timingSafeEqual(aPadded, bPadded);
    // Also check original lengths matched
    return result && aBytes.length === bBytes.length;
  } catch {
    // Fallback: manual constant-time comparison (for environments without timingSafeEqual)
    let diff = aBytes.length ^ bBytes.length;
    for (let i = 0; i < maxLength; i++) {
      diff |= aPadded[i] ^ bPadded[i];
    }
    return diff === 0;
  }
}
