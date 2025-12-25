/**
 * Budget Calculator
 *
 * Core logic for finding affordable dye alternatives.
 * Calculates color distance, savings, and value scores.
 *
 * @module services/budget/budget-calculator
 */

import { DyeService, ColorService, dyeDatabase } from '@xivdyetools/core';
import type { Dye } from '@xivdyetools/types';
import type { ExtendedLogger } from '@xivdyetools/logger';
import type { Env } from '../../types/env.js';
import type {
  DyePriceData,
  BudgetSuggestion,
  BudgetSearchOptions,
  BudgetFindResult,
} from '../../types/budget.js';
import { fetchPrices } from './universalis-client.js';
import { fetchWithCache } from './price-cache.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum color distance for alternatives */
const DEFAULT_MAX_DISTANCE = 50;

/** Default number of results to return */
const DEFAULT_LIMIT = 5;

/** Default sort option */
const DEFAULT_SORT: BudgetSearchOptions['sortBy'] = 'value_score';

// ============================================================================
// Initialize Dye Service
// ============================================================================

// Singleton dye service - initialized once with the database
const dyeService = new DyeService(dyeDatabase);

// ============================================================================
// Core Algorithm
// ============================================================================

/**
 * Calculate the value score for a dye alternative
 *
 * Lower score = better value
 * Formula: (colorDistance * 2) + (price / 1000)
 *
 * This balances color similarity (weighted 2x) with price.
 * A dye with distance 10 and price 5000 would have score: 20 + 5 = 25
 */
function calculateValueScore(colorDistance: number, price: number): number {
  return colorDistance * 2 + price / 1000;
}

/**
 * Find cheaper alternatives to an expensive dye
 *
 * Algorithm:
 * 1. Get target dye from database
 * 2. Fetch prices for all dyes (with caching)
 * 3. Filter by max price and max distance
 * 4. Calculate savings and value scores
 * 5. Sort by chosen method
 * 6. Return top N results
 *
 * @param env - Environment bindings
 * @param targetDyeId - Item ID of the target dye
 * @param world - World/datacenter for price lookups
 * @param options - Search options (max price, max distance, sort, limit)
 * @param logger - Optional logger
 * @returns Budget find result with alternatives
 */
export async function findCheaperAlternatives(
  env: Env,
  targetDyeId: number,
  world: string,
  options: BudgetSearchOptions = {},
  logger?: ExtendedLogger
): Promise<BudgetFindResult> {
  const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
  const maxPrice = options.maxPrice;
  const sortBy = options.sortBy ?? DEFAULT_SORT;
  const limit = options.limit ?? DEFAULT_LIMIT;

  // 1. Get target dye from database
  const targetDye = dyeService.getDyeById(targetDyeId);
  if (!targetDye) {
    throw new Error(`Dye not found: ${targetDyeId}`);
  }

  // 2. Get all dyes and their item IDs for price fetch
  const allDyes = dyeService.getAllDyes();
  const itemIds = allDyes.map((dye) => dye.itemID);

  // 3. Fetch prices with caching
  const { prices, fromCache, fromApi } = await fetchWithCache(
    env.KV,
    world,
    itemIds,
    (ids) => fetchPrices(env, world, ids, logger),
    logger
  );

  if (logger) {
    logger.info('Price fetch complete', { fromCache, fromApi, total: itemIds.length });
  }

  // Get target price
  const targetPrice = prices.get(targetDyeId) ?? null;

  // 4. Calculate alternatives
  const alternatives: BudgetSuggestion[] = [];

  for (const dye of allDyes) {
    // Skip the target dye itself
    if (dye.itemID === targetDyeId) {
      continue;
    }

    // Get price for this dye
    const dyePrice = prices.get(dye.itemID);

    // Skip if no price data
    if (!dyePrice) {
      continue;
    }

    // Skip if more expensive than target (or same price)
    if (targetPrice && dyePrice.currentMinPrice >= targetPrice.currentMinPrice) {
      continue;
    }

    // Check max price filter
    if (maxPrice !== undefined && dyePrice.currentMinPrice > maxPrice) {
      continue;
    }

    // Calculate color distance
    const colorDistance = ColorService.getColorDistance(targetDye.hex, dye.hex);

    // Check max distance filter
    if (colorDistance > maxDistance) {
      continue;
    }

    // Calculate savings
    const savings = targetPrice
      ? targetPrice.currentMinPrice - dyePrice.currentMinPrice
      : 0;
    const savingsPercent = targetPrice && targetPrice.currentMinPrice > 0
      ? (savings / targetPrice.currentMinPrice) * 100
      : 0;

    // Calculate value score
    const valueScore = calculateValueScore(colorDistance, dyePrice.currentMinPrice);

    alternatives.push({
      dye,
      price: dyePrice,
      colorDistance,
      savings,
      savingsPercent,
      valueScore,
    });
  }

  // 5. Sort alternatives
  switch (sortBy) {
    case 'price':
      alternatives.sort((a, b) => {
        const priceA = a.price?.currentMinPrice ?? Infinity;
        const priceB = b.price?.currentMinPrice ?? Infinity;
        return priceA - priceB;
      });
      break;
    case 'color_match':
      alternatives.sort((a, b) => a.colorDistance - b.colorDistance);
      break;
    case 'value_score':
    default:
      alternatives.sort((a, b) => a.valueScore - b.valueScore);
      break;
  }

  // 6. Limit results
  const limitedAlternatives = alternatives.slice(0, limit);

  // Determine when prices were last updated
  const priceTimestamps = Array.from(prices.values())
    .map((p) => p.fetchedAt)
    .filter(Boolean);
  const pricesAsOf = priceTimestamps.length > 0
    ? priceTimestamps[0]
    : new Date().toISOString();

  return {
    targetDye,
    targetPrice,
    alternatives: limitedAlternatives,
    world,
    searchOptions: { maxPrice, maxDistance, sortBy, limit },
    pricesAsOf,
  };
}

// ============================================================================
// Dye Lookup Utilities
// ============================================================================

/**
 * Search for a dye by name
 *
 * @param query - Search query (partial match, case-insensitive)
 * @returns Matching dyes
 */
export function searchDyes(query: string): Dye[] {
  return dyeService.searchByName(query);
}

/**
 * Get a dye by ID
 */
export function getDyeById(id: number): Dye | null {
  return dyeService.getDyeById(id);
}

/**
 * Get a dye by name (exact match, case-insensitive)
 */
export function getDyeByName(name: string): Dye | null {
  const normalizedName = name.toLowerCase().trim();
  const allDyes = dyeService.getAllDyes();
  return allDyes.find((dye) => dye.name.toLowerCase() === normalizedName) ?? null;
}

/**
 * Get autocomplete suggestions for dye names
 */
export function getDyeAutocomplete(
  query: string,
  limit: number = 25
): Array<{ name: string; value: string }> {
  const matches = dyeService.searchByName(query);

  return matches.slice(0, limit).map((dye) => ({
    name: `${dye.name} (${dye.category})`,
    value: String(dye.itemID),
  }));
}

/**
 * Get all dyes
 */
export function getAllDyes(): Dye[] {
  return dyeService.getAllDyes();
}

/**
 * Get all dye categories
 */
export function getCategories(): string[] {
  return dyeService.getCategories();
}
