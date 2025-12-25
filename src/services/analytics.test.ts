/**
 * Tests for Analytics Service
 *
 * Tests KV-based counters and Analytics Engine tracking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackCommand,
  incrementCounter,
  getCounter,
  trackUniqueUser,
  trackCommandWithKV,
  getStats,
  type CommandEvent,
} from './analytics.js';
import type { Env } from '../types/env.js';

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
    list: vi.fn(async () => ({ keys: [] })),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// Create mock Analytics Engine
function createMockAnalytics() {
  return {
    writeDataPoint: vi.fn(),
  };
}

describe('analytics.ts', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let mockAnalytics: ReturnType<typeof createMockAnalytics>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKV = createMockKV();
    mockAnalytics = createMockAnalytics();
    mockEnv = {
      DISCORD_PUBLIC_KEY: 'test-key',
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: 'test-app-id',
      PRESETS_API_URL: 'https://test-api.example.com',
      INTERNAL_WEBHOOK_SECRET: 'test-secret',
      KV: mockKV,
      ANALYTICS: mockAnalytics as unknown as AnalyticsEngineDataset,
    } as Env;

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('trackCommand', () => {
    it('should write data point to Analytics Engine with correct structure', () => {
      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        guildId: 'guild-456',
        success: true,
        latencyMs: 150,
      };

      trackCommand(mockEnv, event);

      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledWith({
        indexes: ['harmony'],
        blobs: ['harmony', 'user-123', 'guild-456', '1', ''],
        doubles: [1, 150, 1],
      });
    });

    it('should use "dm" for guildId when not provided', () => {
      const event: CommandEvent = {
        commandName: 'match',
        userId: 'user-123',
        success: true,
      };

      trackCommand(mockEnv, event);

      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          blobs: expect.arrayContaining(['dm']),
        })
      );
    });

    it('should track failed commands with error type', () => {
      const event: CommandEvent = {
        commandName: 'dye',
        userId: 'user-123',
        guildId: 'guild-456',
        success: false,
        errorType: 'VALIDATION_ERROR',
      };

      trackCommand(mockEnv, event);

      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledWith({
        indexes: ['dye'],
        blobs: ['dye', 'user-123', 'guild-456', '0', 'VALIDATION_ERROR'],
        doubles: [0, 0, 1],
      });
    });

    it('should silently skip when Analytics is not configured', () => {
      const envWithoutAnalytics = { ...mockEnv, ANALYTICS: undefined };
      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        success: true,
      };

      // Should not throw
      trackCommand(envWithoutAnalytics, event);
      expect(mockAnalytics.writeDataPoint).not.toHaveBeenCalled();
    });

    it('should catch errors without throwing', () => {
      mockAnalytics.writeDataPoint.mockImplementation(() => {
        throw new Error('Analytics error');
      });

      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        success: true,
      };

      // Should not throw (errors are silently caught when no logger is provided)
      expect(() => trackCommand(mockEnv, event)).not.toThrow();
    });

    it('should log errors when logger is provided', () => {
      mockAnalytics.writeDataPoint.mockImplementation(() => {
        throw new Error('Analytics error');
      });

      const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
      } as any;

      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        success: true,
      };

      trackCommand(mockEnv, event, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Analytics tracking error',
        expect.any(Error)
      );
    });

    it('should pass undefined to logger for non-Error exceptions', () => {
      mockAnalytics.writeDataPoint.mockImplementation(() => {
        throw 'string error'; // Non-Error exception
      });

      const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
      } as any;

      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        success: true,
      };

      trackCommand(mockEnv, event, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Analytics tracking error',
        undefined
      );
    });
  });

  describe('incrementCounter', () => {
    it('should create new counter starting at 1', async () => {
      await incrementCounter(mockKV, 'total');

      expect(mockKV.put).toHaveBeenCalledWith(
        'stats:total',
        '1',
        expect.objectContaining({ expirationTtl: 30 * 24 * 60 * 60 })
      );
    });

    it('should increment existing counter', async () => {
      mockKV._store.set('stats:total', '5');

      await incrementCounter(mockKV, 'total');

      expect(mockKV.put).toHaveBeenCalledWith(
        'stats:total',
        '6',
        expect.objectContaining({ expirationTtl: 30 * 24 * 60 * 60 })
      );
    });

    it('should handle command-specific counters', async () => {
      await incrementCounter(mockKV, 'cmd:harmony');

      expect(mockKV.put).toHaveBeenCalledWith(
        'stats:cmd:harmony',
        '1',
        expect.any(Object)
      );
    });
  });

  describe('getCounter', () => {
    it('should return 0 for non-existent counter', async () => {
      const result = await getCounter(mockKV, 'nonexistent');
      expect(result).toBe(0);
    });

    it('should return correct value for existing counter', async () => {
      mockKV._store.set('stats:total', '42');

      const result = await getCounter(mockKV, 'total');
      expect(result).toBe(42);
    });

    it('should handle command-specific counters', async () => {
      mockKV._store.set('stats:cmd:dye', '100');

      const result = await getCounter(mockKV, 'cmd:dye');
      expect(result).toBe(100);
    });
  });

  describe('trackUniqueUser', () => {
    it('should add user to daily set', async () => {
      await trackUniqueUser(mockKV, 'user-123');

      const stored = mockKV._store.get('stats:users:2024-06-15');
      expect(stored).toBe('user-123');
    });

    it('should append user to existing set', async () => {
      mockKV._store.set('stats:users:2024-06-15', 'user-111,user-222');

      await trackUniqueUser(mockKV, 'user-333');

      const stored = mockKV._store.get('stats:users:2024-06-15');
      expect(stored).toContain('user-111');
      expect(stored).toContain('user-222');
      expect(stored).toContain('user-333');
    });

    it('should not duplicate existing user', async () => {
      mockKV._store.set('stats:users:2024-06-15', 'user-123');

      await trackUniqueUser(mockKV, 'user-123');

      const stored = mockKV._store.get('stats:users:2024-06-15');
      expect(stored).toBe('user-123'); // Not duplicated
    });

    it('should use correct date for key', async () => {
      vi.setSystemTime(new Date('2024-12-25T23:59:59Z'));

      await trackUniqueUser(mockKV, 'user-123');

      expect(mockKV.put).toHaveBeenCalledWith(
        'stats:users:2024-12-25',
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('trackCommandWithKV', () => {
    it('should track both Analytics Engine and KV counters', async () => {
      const event: CommandEvent = {
        commandName: 'harmony',
        userId: 'user-123',
        guildId: 'guild-456',
        success: true,
      };

      await trackCommandWithKV(mockEnv, event);

      // Should call Analytics Engine
      expect(mockAnalytics.writeDataPoint).toHaveBeenCalled();

      // Should increment KV counters
      expect(mockKV._store.get('stats:total')).toBe('1');
      expect(mockKV._store.get('stats:cmd:harmony')).toBe('1');
      expect(mockKV._store.get('stats:success')).toBe('1');
      expect(mockKV._store.get('stats:users:2024-06-15')).toBe('user-123');
    });

    it('should increment failure counter on failed command', async () => {
      const event: CommandEvent = {
        commandName: 'dye',
        userId: 'user-456',
        success: false,
        errorType: 'NOT_FOUND',
      };

      await trackCommandWithKV(mockEnv, event);

      expect(mockKV._store.get('stats:failure')).toBe('1');
      expect(mockKV._store.get('stats:success')).toBeUndefined();
    });

    it('should track multiple commands correctly', async () => {
      // First command
      await trackCommandWithKV(mockEnv, {
        commandName: 'harmony',
        userId: 'user-1',
        success: true,
      });

      // Second command
      await trackCommandWithKV(mockEnv, {
        commandName: 'dye',
        userId: 'user-2',
        success: true,
      });

      // Third command (same as first)
      await trackCommandWithKV(mockEnv, {
        commandName: 'harmony',
        userId: 'user-1',
        success: false,
      });

      expect(mockKV._store.get('stats:total')).toBe('3');
      expect(mockKV._store.get('stats:cmd:harmony')).toBe('2');
      expect(mockKV._store.get('stats:cmd:dye')).toBe('1');
      expect(mockKV._store.get('stats:success')).toBe('2');
      expect(mockKV._store.get('stats:failure')).toBe('1');
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty KV', async () => {
      const stats = await getStats(mockKV);

      expect(stats).toEqual({
        totalCommands: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        commandBreakdown: {},
        uniqueUsersToday: 0,
      });
    });

    it('should return correct stats from KV', async () => {
      // Set up test data
      mockKV._store.set('stats:total', '100');
      mockKV._store.set('stats:success', '95');
      mockKV._store.set('stats:failure', '5');
      mockKV._store.set('stats:cmd:harmony', '40');
      mockKV._store.set('stats:cmd:dye', '30');
      mockKV._store.set('stats:cmd:match', '20');
      mockKV._store.set('stats:users:2024-06-15', 'user-1,user-2,user-3');

      const stats = await getStats(mockKV);

      expect(stats.totalCommands).toBe(100);
      expect(stats.successCount).toBe(95);
      expect(stats.failureCount).toBe(5);
      expect(stats.successRate).toBe(95);
      expect(stats.commandBreakdown).toEqual({
        harmony: 40,
        dye: 30,
        match: 20,
      });
      expect(stats.uniqueUsersToday).toBe(3);
    });

    it('should only include commands with non-zero counts', async () => {
      mockKV._store.set('stats:cmd:harmony', '10');
      mockKV._store.set('stats:cmd:dye', '0'); // Should not appear

      const stats = await getStats(mockKV);

      expect(stats.commandBreakdown).toEqual({ harmony: 10 });
      expect(stats.commandBreakdown['dye']).toBeUndefined();
    });

    it('should calculate success rate correctly', async () => {
      mockKV._store.set('stats:total', '200');
      mockKV._store.set('stats:success', '150');
      mockKV._store.set('stats:failure', '50');

      const stats = await getStats(mockKV);

      expect(stats.successRate).toBe(75);
    });

    it('should handle empty unique users string', async () => {
      mockKV._store.set('stats:users:2024-06-15', '');

      const stats = await getStats(mockKV);

      // Empty string returns 0 unique users today (correctly handles edge case)
      expect(stats.uniqueUsersToday).toBe(0);
    });

    it('should use current date for unique users', async () => {
      vi.setSystemTime(new Date('2024-12-31T23:59:59Z'));
      mockKV._store.set('stats:users:2024-12-31', 'user-a,user-b');

      const stats = await getStats(mockKV);

      expect(stats.uniqueUsersToday).toBe(2);
    });

    it('should fetch all known command counters', async () => {
      // All expected command names should be queried
      const expectedCommands = [
        'harmony', 'match', 'match_image', 'dye', 'mixer',
        'comparison', 'accessibility', 'manual', 'about',
        'favorites', 'collection', 'preset', 'language', 'stats',
      ];

      await getStats(mockKV);

      // Verify KV.get was called for each command
      for (const cmd of expectedCommands) {
        expect(mockKV.get).toHaveBeenCalledWith(`stats:cmd:${cmd}`);
      }
    });
  });
});
