/**
 * Tests for Rate Limiter Service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    checkRateLimit,
    formatRateLimitMessage,
    type RateLimitResult,
} from './rate-limiter.js';

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

describe('rate-limiter.ts', () => {
    let mockKV: ReturnType<typeof createMockKV>;
    const mockUserId = 'user-123';

    beforeEach(() => {
        mockKV = createMockKV();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('checkRateLimit', () => {
        it('should allow first request and update the counter', async () => {
            const result = await checkRateLimit(mockKV, mockUserId, 'harmony');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(14); // harmony has limit of 15, so 14 remaining
            expect(mockKV.put).toHaveBeenCalled();
        });

        it('should use command-specific limits', async () => {
            // match_image has a limit of 5
            let result = await checkRateLimit(mockKV, mockUserId, 'match_image');
            expect(result.remaining).toBe(4); // 5 - 1 = 4

            // dye has a limit of 20
            mockKV._store.clear();
            result = await checkRateLimit(mockKV, mockUserId, 'dye');
            expect(result.remaining).toBe(19); // 20 - 1 = 19

            // about has a limit of 30
            mockKV._store.clear();
            result = await checkRateLimit(mockKV, mockUserId, 'about');
            expect(result.remaining).toBe(29); // 30 - 1 = 29
        });

        it('should use default limit for unknown commands', async () => {
            // Default limit is 15
            const result = await checkRateLimit(mockKV, mockUserId, 'unknown_command');
            expect(result.remaining).toBe(14); // 15 - 1 = 14
        });

        it('should use global limit when no command name provided', async () => {
            const result = await checkRateLimit(mockKV, mockUserId);
            expect(result.remaining).toBe(14); // Default 15 - 1 = 14
        });

        it('should increment counter on subsequent requests', async () => {
            await checkRateLimit(mockKV, mockUserId, 'harmony');
            await checkRateLimit(mockKV, mockUserId, 'harmony');
            const result = await checkRateLimit(mockKV, mockUserId, 'harmony');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(12); // 15 - 3 = 12
        });

        it('should rate limit when count exceeds limit', async () => {
            // Make 15 requests (harmony limit)
            for (let i = 0; i < 15; i++) {
                await checkRateLimit(mockKV, mockUserId, 'harmony');
            }

            // 16th request should be rate limited
            const result = await checkRateLimit(mockKV, mockUserId, 'harmony');

            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfter).toBeDefined();
            expect(result.retryAfter).toBeGreaterThan(0);
        });

        it('should reset after window expires', async () => {
            // Make requests until rate limited
            for (let i = 0; i < 16; i++) {
                await checkRateLimit(mockKV, mockUserId, 'match_image');
            }

            // Advance time by 61 seconds (window is 60 seconds)
            vi.advanceTimersByTime(61 * 1000);

            const result = await checkRateLimit(mockKV, mockUserId, 'match_image');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4); // Fresh window: 5 - 1 = 4
        });

        it('should track different commands separately', async () => {
            // Exhaust the match_image limit (5 requests)
            for (let i = 0; i < 5; i++) {
                await checkRateLimit(mockKV, mockUserId, 'match_image');
            }

            const matchImageResult = await checkRateLimit(mockKV, mockUserId, 'match_image');
            expect(matchImageResult.allowed).toBe(false);

            // harmony should still be allowed
            const harmonyResult = await checkRateLimit(mockKV, mockUserId, 'harmony');
            expect(harmonyResult.allowed).toBe(true);
        });

        it('should fail open on KV errors', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV unavailable'));

            const result = await checkRateLimit(mockKV, mockUserId, 'harmony');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(15); // Default limit
        });

        it('should log error on KV failure when logger is provided', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV unavailable'));
            const mockLogger = { error: vi.fn() };

            const result = await checkRateLimit(mockKV, mockUserId, 'harmony', mockLogger as any);

            expect(result.allowed).toBe(true);
            expect(result.kvError).toBe(true);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Rate limit check failed',
                expect.any(Error)
            );
        });

        it('should log undefined when non-Error is thrown with logger', async () => {
            mockKV.get = vi.fn().mockRejectedValue('string error');
            const mockLogger = { error: vi.fn() };

            const result = await checkRateLimit(mockKV, mockUserId, 'harmony', mockLogger as any);

            expect(result.allowed).toBe(true);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Rate limit check failed',
                undefined
            );
        });

        it('should include correct resetAt timestamp', async () => {
            const now = Date.now();
            const result = await checkRateLimit(mockKV, mockUserId, 'harmony');

            // Reset should be 60 seconds from window start
            expect(result.resetAt).toBe(now + 60 * 1000);
        });
    });

    describe('formatRateLimitMessage', () => {
        it('should format message using retryAfter', () => {
            const result: RateLimitResult = {
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 30000,
                retryAfter: 30,
            };

            const message = formatRateLimitMessage(result);

            expect(message).toBe("You're using this command too quickly! Please wait **30 seconds** before trying again.");
        });

        it('should use singular second for 1 second', () => {
            const result: RateLimitResult = {
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 1000,
                retryAfter: 1,
            };

            const message = formatRateLimitMessage(result);

            expect(message).toBe("You're using this command too quickly! Please wait **1 second** before trying again.");
        });

        it('should calculate retryAfter from resetAt if not provided', () => {
            vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

            const result: RateLimitResult = {
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 45000, // 45 seconds from now
            };

            const message = formatRateLimitMessage(result);

            expect(message).toContain('45 seconds');
        });
    });
});
