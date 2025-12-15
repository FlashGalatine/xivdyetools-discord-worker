/**
 * Analytics Service
 *
 * Tracks command usage via Cloudflare Analytics Engine.
 * Analytics Engine provides automatic aggregation and querying without
 * the overhead of managing Redis or other databases.
 *
 * @see https://developers.cloudflare.com/analytics/analytics-engine/
 */

import type { Env } from '../types/env.js';
import type { ExtendedLogger } from '@xivdyetools/logger';

/**
 * Data point structure for Analytics Engine
 */
export interface CommandEvent {
  commandName: string;
  userId: string;
  guildId?: string;
  success: boolean;
  errorType?: string;
  latencyMs?: number;
}

/**
 * Track a command execution in Analytics Engine
 *
 * Data points have:
 * - blobs (up to 20): string dimensions for filtering/grouping
 * - doubles (up to 20): numeric values for aggregation
 * - indexes (up to 1): for efficient querying
 *
 * @param env - Environment bindings
 * @param event - Command event to track
 * @param logger - Optional logger for structured logging
 */
export function trackCommand(
  env: Env,
  event: CommandEvent,
  logger?: ExtendedLogger
): void {
  if (!env.ANALYTICS) {
    // Analytics not configured, silently skip
    return;
  }

  try {
    env.ANALYTICS.writeDataPoint({
      // Use command name as index for efficient querying
      indexes: [event.commandName],
      // String dimensions
      blobs: [
        event.commandName,           // blob1: command name
        event.userId,                // blob2: user ID (for unique user counting)
        event.guildId || 'dm',       // blob3: guild ID or 'dm' for DMs
        event.success ? '1' : '0',   // blob4: success flag
        event.errorType || '',       // blob5: error type if failed
      ],
      // Numeric values
      doubles: [
        event.success ? 1 : 0,       // double1: success count (for aggregation)
        event.latencyMs || 0,        // double2: latency in ms
        1,                           // double3: total count (always 1)
      ],
    });
  } catch (error) {
    // Don't let analytics errors affect command execution
    if (logger) {
      logger.error('Analytics tracking error', error instanceof Error ? error : undefined);
    }
  }
}

/**
 * Query command statistics from Analytics Engine
 *
 * Note: Analytics Engine queries require the Analytics API token,
 * which is separate from the Worker. For now, we use KV-based
 * counters as a simpler alternative that works within the Worker.
 *
 * For full Analytics Engine queries, you'd need to:
 * 1. Set up an API token with Analytics:Read permission
 * 2. Query via: https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql
 */

// ============================================================================
// KV-based Simple Stats (fallback for in-worker querying)
// ============================================================================

const STATS_PREFIX = 'stats:';
const STATS_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * Increment a counter in KV (for simple stats without Analytics API)
 */
export async function incrementCounter(
  kv: KVNamespace,
  key: string
): Promise<void> {
  const fullKey = `${STATS_PREFIX}${key}`;
  const current = parseInt((await kv.get(fullKey)) || '0', 10);
  await kv.put(fullKey, String(current + 1), { expirationTtl: STATS_TTL });
}

/**
 * Get a counter value from KV
 */
export async function getCounter(
  kv: KVNamespace,
  key: string
): Promise<number> {
  const fullKey = `${STATS_PREFIX}${key}`;
  return parseInt((await kv.get(fullKey)) || '0', 10);
}

/**
 * Track unique user via HyperLogLog-like approach (simplified)
 * Uses a set in KV with daily rotation
 */
export async function trackUniqueUser(
  kv: KVNamespace,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `${STATS_PREFIX}users:${today}`;

  // Get existing users set
  const existing = await kv.get(key);
  const users = new Set(existing ? existing.split(',') : []);

  // Add user and update
  users.add(userId);
  await kv.put(key, Array.from(users).join(','), { expirationTtl: STATS_TTL });
}

/**
 * Track command for both Analytics Engine and KV-based stats
 */
export async function trackCommandWithKV(
  env: Env,
  event: CommandEvent
): Promise<void> {
  // Write to Analytics Engine (for long-term storage)
  trackCommand(env, event);

  // Also update KV counters for in-worker querying
  await Promise.all([
    incrementCounter(env.KV, 'total'),
    incrementCounter(env.KV, `cmd:${event.commandName}`),
    event.success
      ? incrementCounter(env.KV, 'success')
      : incrementCounter(env.KV, 'failure'),
    trackUniqueUser(env.KV, event.userId),
  ]);
}

/**
 * Get aggregated stats from KV
 */
export async function getStats(kv: KVNamespace): Promise<{
  totalCommands: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  commandBreakdown: Record<string, number>;
  uniqueUsersToday: number;
}> {
  // Get basic counters
  const [total, success, failure] = await Promise.all([
    getCounter(kv, 'total'),
    getCounter(kv, 'success'),
    getCounter(kv, 'failure'),
  ]);

  // Get today's unique users
  const today = new Date().toISOString().split('T')[0];
  const usersStr = await kv.get(`${STATS_PREFIX}users:${today}`);
  const uniqueUsersToday = usersStr ? usersStr.split(',').length : 0;

  // Get command breakdown (list all cmd:* keys)
  const commandBreakdown: Record<string, number> = {};
  const commandNames = [
    'harmony', 'match', 'match_image', 'dye', 'mixer',
    'comparison', 'accessibility', 'manual', 'about',
    'favorites', 'collection', 'preset', 'language', 'stats',
  ];

  await Promise.all(
    commandNames.map(async (cmd) => {
      const count = await getCounter(kv, `cmd:${cmd}`);
      if (count > 0) {
        commandBreakdown[cmd] = count;
      }
    })
  );

  return {
    totalCommands: total,
    successCount: success,
    failureCount: failure,
    successRate: total > 0 ? (success / total) * 100 : 0,
    commandBreakdown,
    uniqueUsersToday,
  };
}
