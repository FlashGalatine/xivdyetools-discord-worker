/**
 * Price Cache Service
 *
 * KV-backed caching for Universalis market prices.
 * Uses a 5-minute TTL to balance freshness with API rate limits.
 *
 * @module services/budget/price-cache
 */

import type { ExtendedLogger } from '@xivdyetools/logger';
import type { DyePriceData, CachedPriceEntry } from '../../types/budget.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * KV schema version for data format evolution
 * Increment when changing the cache data structure
 */
const CACHE_SCHEMA_VERSION = 'v1';

/** KV key prefix for individual price entries */
const PRICE_KEY_PREFIX = `budget:prices:${CACHE_SCHEMA_VERSION}:`;

/** Cache TTL in seconds (5 minutes) */
export const CACHE_TTL_SECONDS = 300;

/** Stale threshold - allow stale data up to 15 minutes old */
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

// ============================================================================
// Cache Key Utilities
// ============================================================================

/**
 * Build a cache key for a single price entry
 */
function buildPriceKey(world: string, itemId: number): string {
  return `${PRICE_KEY_PREFIX}${world.toLowerCase()}:${itemId}`;
}

// ============================================================================
// Single Entry Operations
// ============================================================================

/**
 * Get a cached price entry
 *
 * @param kv - KV namespace binding
 * @param world - World/datacenter name
 * @param itemId - FFXIV item ID
 * @param logger - Optional logger
 * @returns Price data if cached and fresh, null otherwise
 */
export async function getCachedPrice(
  kv: KVNamespace,
  world: string,
  itemId: number,
  logger?: ExtendedLogger
): Promise<DyePriceData | null> {
  try {
    const key = buildPriceKey(world, itemId);
    const data = await kv.get(key);

    if (!data) {
      return null;
    }

    const entry = JSON.parse(data) as CachedPriceEntry;

    // Check if cache is still fresh
    const age = Date.now() - entry.cachedAt;
    if (age > CACHE_TTL_SECONDS * 1000) {
      return null; // Expired
    }

    return entry.data;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get cached price', error instanceof Error ? error : undefined);
    }
    return null;
  }
}

/**
 * Get a cached price entry, allowing stale data
 *
 * Returns stale data (up to 15 minutes old) if available.
 * Useful for fallback when API is unavailable.
 *
 * @returns Object with data and isStale flag
 */
export async function getCachedPriceWithStale(
  kv: KVNamespace,
  world: string,
  itemId: number,
  logger?: ExtendedLogger
): Promise<{ data: DyePriceData | null; isStale: boolean }> {
  try {
    const key = buildPriceKey(world, itemId);
    const data = await kv.get(key);

    if (!data) {
      return { data: null, isStale: false };
    }

    const entry = JSON.parse(data) as CachedPriceEntry;
    const age = Date.now() - entry.cachedAt;

    // Check if too old even for stale
    if (age > STALE_THRESHOLD_MS) {
      return { data: null, isStale: false };
    }

    const isStale = age > CACHE_TTL_SECONDS * 1000;
    return { data: entry.data, isStale };
  } catch (error) {
    if (logger) {
      logger.error('Failed to get cached price with stale', error instanceof Error ? error : undefined);
    }
    return { data: null, isStale: false };
  }
}

/**
 * Store a price entry in cache
 *
 * @param kv - KV namespace binding
 * @param world - World/datacenter name
 * @param itemId - FFXIV item ID
 * @param data - Price data to cache
 * @param logger - Optional logger
 */
export async function setCachedPrice(
  kv: KVNamespace,
  world: string,
  itemId: number,
  data: DyePriceData,
  logger?: ExtendedLogger
): Promise<void> {
  try {
    const key = buildPriceKey(world, itemId);
    const entry: CachedPriceEntry = {
      data,
      cachedAt: Date.now(),
    };

    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: CACHE_TTL_SECONDS + 60, // Add buffer for stale reads
    });
  } catch (error) {
    // Cache write failures are non-fatal
    if (logger) {
      logger.error('Failed to cache price', error instanceof Error ? error : undefined);
    }
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Get multiple cached prices at once
 *
 * Note: KV doesn't support native batch get, so this issues
 * parallel requests. Still faster than sequential.
 *
 * @returns Map of item ID to price data (only cached items)
 */
export async function getCachedPrices(
  kv: KVNamespace,
  world: string,
  itemIds: number[],
  logger?: ExtendedLogger
): Promise<Map<number, DyePriceData>> {
  const results = new Map<number, DyePriceData>();

  // Fetch all in parallel
  const promises = itemIds.map(async (itemId) => {
    const data = await getCachedPrice(kv, world, itemId, logger);
    if (data) {
      results.set(itemId, data);
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Store multiple price entries at once
 *
 * @param kv - KV namespace binding
 * @param world - World/datacenter name
 * @param prices - Map of item ID to price data
 * @param logger - Optional logger
 */
export async function setCachedPrices(
  kv: KVNamespace,
  world: string,
  prices: Map<number, DyePriceData>,
  logger?: ExtendedLogger
): Promise<void> {
  // Write all in parallel
  const promises = Array.from(prices.entries()).map(([itemId, data]) =>
    setCachedPrice(kv, world, itemId, data, logger)
  );

  await Promise.all(promises);
}

// ============================================================================
// Cache-Aware Fetch
// ============================================================================

/**
 * Fetch prices with cache support
 *
 * Checks cache first, fetches missing items from API,
 * and caches the results.
 *
 * @param kv - KV namespace binding
 * @param world - World/datacenter name
 * @param itemIds - Item IDs to fetch
 * @param fetchFn - Function to fetch prices from API
 * @param logger - Optional logger
 * @returns Map of item ID to price data
 */
export async function fetchWithCache(
  kv: KVNamespace,
  world: string,
  itemIds: number[],
  fetchFn: (ids: number[]) => Promise<Map<number, DyePriceData>>,
  logger?: ExtendedLogger
): Promise<{ prices: Map<number, DyePriceData>; fromCache: number; fromApi: number }> {
  // Check cache first
  const cached = await getCachedPrices(kv, world, itemIds, logger);

  // Find which items need to be fetched
  const uncachedIds = itemIds.filter((id) => !cached.has(id));

  if (uncachedIds.length === 0) {
    // All items were cached
    return { prices: cached, fromCache: cached.size, fromApi: 0 };
  }

  // Fetch missing items from API
  const fetched = await fetchFn(uncachedIds);

  // Cache the new results
  await setCachedPrices(kv, world, fetched, logger);

  // Merge results
  const combined = new Map<number, DyePriceData>();
  for (const [id, data] of cached) {
    combined.set(id, data);
  }
  for (const [id, data] of fetched) {
    combined.set(id, data);
  }

  return {
    prices: combined,
    fromCache: cached.size,
    fromApi: fetched.size,
  };
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Invalidate a specific price cache entry
 *
 * Use sparingly - cache expiry is the primary mechanism.
 */
export async function invalidateCachedPrice(
  kv: KVNamespace,
  world: string,
  itemId: number,
  logger?: ExtendedLogger
): Promise<void> {
  try {
    const key = buildPriceKey(world, itemId);
    await kv.delete(key);
  } catch (error) {
    if (logger) {
      logger.error('Failed to invalidate cache', error instanceof Error ? error : undefined);
    }
  }
}
