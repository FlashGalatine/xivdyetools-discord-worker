/**
 * Tests for Preset API Client
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isApiEnabled,
    isModerator,
    getPresets,
    getPreset,
    getPresetByName,
    getRandomPreset,
    getFeaturedPresets,
    submitPreset,
    deletePreset,
    getMyPresets,
    editPreset,
    voteForPreset,
    removeVote,
    hasVoted,
    getCategories,
    getPendingPresets,
    approvePreset,
    rejectPreset,
    flagPreset,
    getModerationStats,
    getModerationHistory,
    revertPreset,
    searchPresetsForAutocomplete,
} from './preset-api.js';
import { PresetAPIError } from '../types/preset.js';

// Mock fetch for URL-based tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock environment
function createMockEnv(options: {
    withServiceBinding?: boolean;
    withUrlConfig?: boolean;
    moderatorIds?: string;
} = {}): any {
    const env: any = {};

    if (options.withServiceBinding) {
        env.PRESETS_API = {
            fetch: vi.fn(),
        };
    }

    if (options.withUrlConfig) {
        env.PRESETS_API_URL = 'https://api.example.com';
        env.BOT_API_SECRET = 'secret-token';
    }

    if (options.moderatorIds) {
        env.MODERATOR_IDS = options.moderatorIds;
    }

    return env;
}

describe('preset-api.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==========================================================================
    // Utility Functions Tests
    // ==========================================================================

    describe('isApiEnabled', () => {
        it('should return true when service binding is configured', () => {
            const env = createMockEnv({ withServiceBinding: true });
            expect(isApiEnabled(env)).toBe(true);
        });

        it('should return true when URL and secret are configured', () => {
            const env = createMockEnv({ withUrlConfig: true });
            expect(isApiEnabled(env)).toBe(true);
        });

        it('should return false when neither is configured', () => {
            const env = createMockEnv();
            expect(isApiEnabled(env)).toBe(false);
        });

        it('should return false when only URL is configured without secret', () => {
            const env = { PRESETS_API_URL: 'https://api.example.com' };
            expect(isApiEnabled(env as any)).toBe(false);
        });
    });

    describe('isModerator', () => {
        it('should return true for moderator IDs', () => {
            const env = createMockEnv({ moderatorIds: '123,456,789' });
            expect(isModerator(env, '456')).toBe(true);
        });

        it('should return false for non-moderator IDs', () => {
            const env = createMockEnv({ moderatorIds: '123,456,789' });
            expect(isModerator(env, '999')).toBe(false);
        });

        it('should return false when MODERATOR_IDS is not set', () => {
            const env = createMockEnv();
            expect(isModerator(env, '123')).toBe(false);
        });

        it('should handle whitespace in moderator IDs', () => {
            const env = createMockEnv({ moderatorIds: '123, 456 , 789' });
            expect(isModerator(env, '456')).toBe(true);
        });
    });

    // ==========================================================================
    // API Request Tests (with URL-based config)
    // ==========================================================================

    describe('getPresets', () => {
        it('should fetch presets successfully', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockResponse = {
                presets: [{ id: '1', name: 'Test Preset' }],
                total: 1,
                page: 1,
                limit: 25,
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await getPresets(env);

            expect(result.presets).toHaveLength(1);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/api/v1/presets',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer secret-token',
                    }),
                })
            );
        });

        it('should include filter parameters', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ presets: [], total: 0 }),
            });

            await getPresets(env, {
                category: 'armor',
                search: 'test',
                status: 'approved',
                sort: 'popular',
                page: 2,
                limit: 10,
            });

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('category=armor');
            expect(calledUrl).toContain('search=test');
            expect(calledUrl).toContain('status=approved');
            expect(calledUrl).toContain('sort=popular');
            expect(calledUrl).toContain('page=2');
            expect(calledUrl).toContain('limit=10');
        });

        it('should throw PresetAPIError when API is not configured', async () => {
            const env = createMockEnv();

            await expect(getPresets(env)).rejects.toThrow(PresetAPIError);
        });
    });

    describe('getPreset', () => {
        it('should return preset when found', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockPreset = { id: 'abc123', name: 'Test' };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockPreset),
            });

            const result = await getPreset(env, 'abc123');

            expect(result).toEqual(mockPreset);
        });

        it('should return null when preset not found', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ message: 'Not found' }),
            });

            const result = await getPreset(env, 'nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('getFeaturedPresets', () => {
        it('should fetch featured presets', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockPresets = [{ id: '1', name: 'Featured' }];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ presets: mockPresets }),
            });

            const result = await getFeaturedPresets(env);

            expect(result).toEqual(mockPresets);
            expect(mockFetch.mock.calls[0][0]).toContain('/featured');
        });
    });

    describe('getRandomPreset', () => {
        it('should return a random preset from pool', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockPresets = [
                { id: '1', name: 'Preset 1' },
                { id: '2', name: 'Preset 2' },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ presets: mockPresets, total: 2 }),
            });

            const result = await getRandomPreset(env);

            expect(mockPresets).toContainEqual(result);
        });

        it('should return null when no presets available', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ presets: [], total: 0 }),
            });

            const result = await getRandomPreset(env);

            expect(result).toBeNull();
        });
    });

    describe('submitPreset', () => {
        it('should submit a new preset', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockResponse = { id: 'new123', message: 'Created' };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await submitPreset(
                env,
                { name: 'New Preset', description: 'Test', category: 'armor', dye_ids: [1, 2] },
                'user123',
                'TestUser'
            );

            expect(result).toEqual(mockResponse);
            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'X-User-Discord-ID': 'user123',
                'X-User-Discord-Name': 'TestUser',
            });
        });
    });

    describe('deletePreset', () => {
        it('should return true on successful delete', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            const result = await deletePreset(env, 'preset123', 'user123');

            expect(result).toBe(true);
        });

        it('should return false on 403 forbidden', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: () => Promise.resolve({ message: 'Forbidden' }),
            });

            const result = await deletePreset(env, 'preset123', 'user123');

            expect(result).toBe(false);
        });
    });

    describe('voteForPreset', () => {
        it('should add a vote', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockResponse = { success: true, vote_count: 5 };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await voteForPreset(env, 'preset123', 'user123');

            expect(result).toEqual(mockResponse);
        });
    });

    describe('hasVoted', () => {
        it('should return true when user has voted', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ has_voted: true }),
            });

            const result = await hasVoted(env, 'preset123', 'user123');

            expect(result).toBe(true);
        });

        it('should return false on error', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await hasVoted(env, 'preset123', 'user123');

            expect(result).toBe(false);
        });
    });

    describe('getCategories', () => {
        it('should fetch categories', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockCategories = [
                { name: 'armor', count: 10 },
                { name: 'weapon', count: 5 },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ categories: mockCategories }),
            });

            const result = await getCategories(env);

            expect(result).toEqual(mockCategories);
        });
    });

    describe('searchPresetsForAutocomplete', () => {
        it('should return formatted autocomplete choices', async () => {
            const env = createMockEnv({ withUrlConfig: true });
            const mockPresets = [
                { id: '1', name: 'Red Knight', vote_count: 5, author_name: 'User1' },
                { id: '2', name: 'Blue Mage', vote_count: 3 },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ presets: mockPresets, total: 2 }),
            });

            const result = await searchPresetsForAutocomplete(env, 'test');

            expect(result).toHaveLength(2);
            expect(result[0].name).toContain('Red Knight');
            expect(result[0].name).toContain('5★');
            expect(result[0].name).toContain('User1');
            expect(result[1].name).not.toContain('by');
        });

        it('should return empty array on error', async () => {
            const env = createMockEnv({ withUrlConfig: true });

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await searchPresetsForAutocomplete(env, 'test');

            expect(result).toEqual([]);
        });
    });

    // ==========================================================================
    // Service Binding Tests
    // ==========================================================================

    describe('Service Binding', () => {
        it('should use service binding when available', async () => {
            const env = createMockEnv({ withServiceBinding: true, withUrlConfig: true });
            const mockResponse = { presets: [], total: 0 };

            env.PRESETS_API.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            await getPresets(env);

            // Should use service binding, not global fetch
            expect(env.PRESETS_API.fetch).toHaveBeenCalled();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should use internal URL for service binding', async () => {
            const env = createMockEnv({ withServiceBinding: true });
            const mockResponse = { presets: [], total: 0 };

            env.PRESETS_API.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            await getPresets(env);

            const calledRequest = env.PRESETS_API.fetch.mock.calls[0][0];
            expect(calledRequest.url).toContain('https://internal');
        });
    });
});
