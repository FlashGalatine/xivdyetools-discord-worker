/**
 * Tests for Price Cache Service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedPrice,
  setCachedPrice,
  getCachedPrices,
  setCachedPrices,
  getCachedPriceWithStale,
  invalidateCachedPrice,
  CACHE_TTL_SECONDS,
} from './price-cache.js';
import type { DyePriceData } from '../../types/budget.js';

// Create mock KV namespace
function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store, // For test inspection
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// Sample price data
const samplePrice: DyePriceData = {
  itemId: 5729,
  minPrice: 50000,
  averagePrice: 75000,
  lastUpdated: '2024-01-01T12:00:00Z',
  world: 'Crystal',
  listingCount: 10,
  fetchedAt: '2024-01-01T12:00:00Z',
};

describe('price-cache.ts', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCachedPrice', () => {
    it('should return null for cache miss', async () => {
      const result = await getCachedPrice(mockKV, 'Crystal', 5729);
      expect(result).toBeNull();
    });

    it('should return cached price within TTL', async () => {
      // Set up cache entry
      const cacheEntry = {
        data: samplePrice,
        cachedAt: Date.now(),
      };
      // Note: keys use lowercase world names
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify(cacheEntry));

      const result = await getCachedPrice(mockKV, 'Crystal', 5729);
      expect(result).toEqual(samplePrice);
    });

    it('should return null for expired cache entry', async () => {
      // Set up expired cache entry
      const cacheEntry = {
        data: samplePrice,
        cachedAt: Date.now() - (CACHE_TTL_SECONDS + 1) * 1000, // Expired
      };
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify(cacheEntry));

      const result = await getCachedPrice(mockKV, 'Crystal', 5729);
      expect(result).toBeNull();
    });

    it('should return null on KV error', async () => {
      mockKV.get = vi.fn().mockRejectedValue(new Error('KV unavailable'));

      const result = await getCachedPrice(mockKV, 'Crystal', 5729);
      expect(result).toBeNull();
    });
  });

  describe('getCachedPriceWithStale', () => {
    it('should return fresh data when within TTL', async () => {
      const cacheEntry = {
        data: samplePrice,
        cachedAt: Date.now(),
      };
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify(cacheEntry));

      const result = await getCachedPriceWithStale(mockKV, 'Crystal', 5729);
      expect(result).toEqual({ data: samplePrice, isStale: false });
    });

    it('should return stale data when expired', async () => {
      const cacheEntry = {
        data: samplePrice,
        cachedAt: Date.now() - (CACHE_TTL_SECONDS + 1) * 1000,
      };
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify(cacheEntry));

      const result = await getCachedPriceWithStale(mockKV, 'Crystal', 5729);
      expect(result).toEqual({ data: samplePrice, isStale: true });
    });

    it('should return data:null for cache miss', async () => {
      const result = await getCachedPriceWithStale(mockKV, 'Crystal', 5729);
      expect(result).toEqual({ data: null, isStale: false });
    });
  });

  describe('setCachedPrice', () => {
    it('should store price data in cache', async () => {
      await setCachedPrice(mockKV, 'Crystal', 5729, samplePrice);

      expect(mockKV.put).toHaveBeenCalled();
      const stored = mockKV._store.get('budget:prices:v1:crystal:5729');
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.data).toEqual(samplePrice);
      expect(parsed.cachedAt).toBeDefined();
    });

    it('should handle KV errors gracefully', async () => {
      mockKV.put = vi.fn().mockRejectedValue(new Error('KV unavailable'));

      // Should not throw
      await expect(setCachedPrice(mockKV, 'Crystal', 5729, samplePrice)).resolves.not.toThrow();
    });
  });

  describe('getCachedPrices (batch)', () => {
    it('should return map of cached prices', async () => {
      const price1 = { ...samplePrice, itemId: 5729 };
      const price2 = { ...samplePrice, itemId: 5730 };

      mockKV._store.set(
        'budget:prices:v1:crystal:5729',
        JSON.stringify({ data: price1, cachedAt: Date.now() })
      );
      mockKV._store.set(
        'budget:prices:v1:crystal:5730',
        JSON.stringify({ data: price2, cachedAt: Date.now() })
      );

      const result = await getCachedPrices(mockKV, 'Crystal', [5729, 5730, 5731]);

      expect(result.get(5729)).toEqual(price1);
      expect(result.get(5730)).toEqual(price2);
      expect(result.has(5731)).toBe(false); // Not in cache
    });

    it('should skip expired entries', async () => {
      const expiredEntry = {
        data: samplePrice,
        cachedAt: Date.now() - (CACHE_TTL_SECONDS + 1) * 1000,
      };
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify(expiredEntry));

      const result = await getCachedPrices(mockKV, 'Crystal', [5729]);
      expect(result.size).toBe(0);
    });
  });

  describe('setCachedPrices (batch)', () => {
    it('should store multiple prices', async () => {
      const prices = new Map<number, DyePriceData>([
        [5729, { ...samplePrice, itemId: 5729 }],
        [5730, { ...samplePrice, itemId: 5730 }],
      ]);

      await setCachedPrices(mockKV, 'Crystal', prices);

      expect(mockKV.put).toHaveBeenCalledTimes(2);
      expect(mockKV._store.has('budget:prices:v1:crystal:5729')).toBe(true);
      expect(mockKV._store.has('budget:prices:v1:crystal:5730')).toBe(true);
    });
  });

  describe('invalidateCachedPrice', () => {
    it('should delete cached entry', async () => {
      mockKV._store.set('budget:prices:v1:crystal:5729', JSON.stringify({ data: samplePrice }));

      await invalidateCachedPrice(mockKV, 'Crystal', 5729);

      expect(mockKV.delete).toHaveBeenCalledWith('budget:prices:v1:crystal:5729');
    });
  });
});
