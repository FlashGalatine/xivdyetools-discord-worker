/**
 * Rate Limiting Service
 *
 * Implements sliding window rate limiting using Cloudflare KV.
 * Supports per-user and per-command limits.
 *
 * REFACTOR-002: Now uses @xivdyetools/rate-limiter shared package
 *
 * @module services/rate-limiter
 */

import type { ExtendedLogger } from '@xivdyetools/logger';
import { KVRateLimiter, getDiscordCommandLimit } from '@xivdyetools/rate-limiter';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the window */
  remaining: number;
  /** Timestamp when the rate limit resets (ms since epoch) */
  resetAt: number;
  /** Seconds until the rate limit resets (only present when rate limited) */
  retryAfter?: number;
  /** DISCORD-BUG-002: Flag indicating KV error occurred (request was allowed due to fail-open policy) */
  kvError?: boolean;
}

/** KV key prefix for rate limit data */
const KEY_PREFIX = 'ratelimit:user:';

/**
 * Singleton KV rate limiter instance
 * Initialized on first use with the KV namespace from env
 */
let limiterInstance: KVRateLimiter | null = null;

/**
 * Get or create the KV rate limiter instance
 */
function getLimiter(kv: KVNamespace): KVRateLimiter {
  if (!limiterInstance) {
    limiterInstance = new KVRateLimiter({
      kv,
      keyPrefix: KEY_PREFIX,
    });
  }
  return limiterInstance;
}

/**
 * Check if a user is rate limited for a specific command
 *
 * Uses a sliding window algorithm:
 * 1. Get current window data from KV
 * 2. If window has expired, start a new one
 * 3. Increment counter and check against limit
 * 4. Store updated data with TTL
 *
 * DISCORD-BUG-001: Known limitation - due to KV's eventual consistency, two
 * concurrent requests at the exact window boundary may both receive count=1.
 * This allows at most 2x burst at window boundaries, which is acceptable
 * for rate limiting purposes. A timestamp-array approach would fix this but
 * adds complexity and storage overhead.
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param commandName - Optional command name for command-specific limits
 * @param logger - Optional logger for structured logging
 * @returns Rate limit check result (check kvError flag for KV failures)
 *
 * @example
 * ```typescript
 * const result = await checkRateLimit(env.KV, userId, 'harmony');
 * if (!result.allowed) {
 *   return ephemeralResponse(`Rate limited. Try again in ${result.retryAfter}s`);
 * }
 * if (result.kvError) {
 *   // Log for monitoring - request was allowed but KV had an issue
 *   console.warn('Rate limit KV error, request allowed via fail-open');
 * }
 * ```
 */
export async function checkRateLimit(
  kv: KVNamespace,
  userId: string,
  commandName?: string,
  logger?: ExtendedLogger
): Promise<RateLimitResult> {
  const limiter = getLimiter(kv);
  const config = getDiscordCommandLimit(commandName);

  // Build compound key for user:command rate limiting
  const key = commandName ? `${userId}:${commandName}` : `${userId}:global`;

  try {
    const result = await limiter.check(key, config);

    // Log if there was a backend error (fail-open occurred)
    if (result.backendError && logger) {
      logger.error('Rate limit check failed', new Error('KV backend error'));
    }

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: result.resetAt.getTime(),
      retryAfter: result.retryAfter,
      kvError: result.backendError,
    };
  } catch (error) {
    // This shouldn't happen since KVRateLimiter fails open by default
    // But just in case, log and allow
    if (logger) {
      logger.error('Rate limit check failed', error instanceof Error ? error : undefined);
    }
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
      kvError: true,
    };
  }
}

/**
 * Format a rate limit error message for the user
 */
export function formatRateLimitMessage(result: RateLimitResult): string {
  const seconds = result.retryAfter ?? Math.ceil((result.resetAt - Date.now()) / 1000);
  return `You're using this command too quickly! Please wait **${seconds} second${seconds !== 1 ? 's' : ''}** before trying again.`;
}

/**
 * Reset the rate limiter for testing
 */
export function resetRateLimiterInstance(): void {
  limiterInstance = null;
}
