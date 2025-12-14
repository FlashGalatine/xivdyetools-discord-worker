/**
 * Rate Limiting Service
 *
 * Implements sliding window rate limiting using Cloudflare KV.
 * Supports per-user and per-command limits.
 *
 * @module services/rate-limiter
 */

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

/**
 * Rate limit configuration per command
 * Commands not listed here use the default limit
 */
const COMMAND_LIMITS: Record<string, number> = {
  // Image processing commands are more expensive
  match_image: 5,
  accessibility: 10,
  // Standard commands
  harmony: 15,
  match: 15,
  mixer: 15,
  comparison: 15,
  dye: 20,
  favorites: 20,
  collection: 20,
  language: 20,
  // Utility commands (more lenient)
  about: 30,
  manual: 30,
};

/** Default rate limit for commands not in COMMAND_LIMITS */
const DEFAULT_LIMIT = 15;

/** Rate limit window in seconds */
const WINDOW_SECONDS = 60;

/** KV key prefix for rate limit data */
const KEY_PREFIX = 'ratelimit:user:';

/**
 * Rate limit entry stored in KV
 */
interface RateLimitEntry {
  /** Number of requests in the current window */
  count: number;
  /** Start of the current window (ms since epoch) */
  windowStart: number;
}

/**
 * Get the rate limit for a specific command
 */
function getCommandLimit(commandName?: string): number {
  if (!commandName) return DEFAULT_LIMIT;
  return COMMAND_LIMITS[commandName] ?? DEFAULT_LIMIT;
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
  commandName?: string
): Promise<RateLimitResult> {
  const limit = getCommandLimit(commandName);
  const key = commandName
    ? `${KEY_PREFIX}${userId}:${commandName}`
    : `${KEY_PREFIX}${userId}:global`;

  const now = Date.now();
  const windowMs = WINDOW_SECONDS * 1000;

  try {
    // Get current rate limit data
    const data = await kv.get(key);
    let entry: RateLimitEntry;

    if (data) {
      entry = JSON.parse(data);

      // Check if window has expired
      if (now - entry.windowStart >= windowMs) {
        // Start new window
        entry = { count: 1, windowStart: now };
      } else {
        // Increment counter in current window
        entry.count++;
      }
    } else {
      // First request, start new window
      entry = { count: 1, windowStart: now };
    }

    // Calculate remaining time in window
    const windowRemaining = Math.max(0, windowMs - (now - entry.windowStart));
    const resetAt = entry.windowStart + windowMs;

    // Store updated data with TTL (window duration + buffer)
    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: WINDOW_SECONDS + 10, // Add 10s buffer
    });

    // Check if rate limited
    if (entry.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(windowRemaining / 1000),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - entry.count),
      resetAt,
    };
  } catch (error) {
    // DISCORD-BUG-002: On KV errors, allow the request (fail open) and flag the error
    // This prevents KV issues from blocking all commands while enabling monitoring
    console.error('Rate limit check failed:', error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: now + windowMs,
      kvError: true, // Flag for caller to potentially log/alert
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
