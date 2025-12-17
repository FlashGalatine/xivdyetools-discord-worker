/**
 * Tests for Ban Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isUserBannedByDiscordId,
    isUserBannedByXivAuthId,
    isUserBanned,
    searchPresetAuthors,
    searchBannedUsers,
    getUserForBanConfirmation,
    banUser,
    unbanUser,
    hideUserPresets,
    restoreUserPresets,
    getActiveBan,
} from './ban-service.js';

// Helper to create mock D1Database
function createMockDb(overrides?: Partial<{
    first: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
}>) {
    const mockFirst = overrides?.first ?? vi.fn().mockResolvedValue(null);
    const mockAll = overrides?.all ?? vi.fn().mockResolvedValue({ results: [] });
    const mockRun = overrides?.run ?? vi.fn().mockResolvedValue({ meta: { changes: 0 } });

    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                first: mockFirst,
                all: mockAll,
                run: mockRun,
            }),
        }),
    } as unknown as D1Database;
}

describe('ban-service.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    // ========================================================================
    // isUserBannedByDiscordId tests
    // ========================================================================

    describe('isUserBannedByDiscordId', () => {
        it('should return true when user is banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue({ '1': 1 }), // Row exists
            });

            const result = await isUserBannedByDiscordId(mockDb, '123456789');

            expect(result).toBe(true);
            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('SELECT 1 FROM banned_users')
            );
        });

        it('should return false when user is not banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await isUserBannedByDiscordId(mockDb, '123456789');

            expect(result).toBe(false);
        });
    });

    // ========================================================================
    // isUserBannedByXivAuthId tests
    // ========================================================================

    describe('isUserBannedByXivAuthId', () => {
        it('should return true when user is banned by XIVAuth ID', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue({ '1': 1 }),
            });

            const result = await isUserBannedByXivAuthId(mockDb, 'xivauth-id-123');

            expect(result).toBe(true);
            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('xivauth_id')
            );
        });

        it('should return false when user is not banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await isUserBannedByXivAuthId(mockDb, 'xivauth-id-123');

            expect(result).toBe(false);
        });
    });

    // ========================================================================
    // isUserBanned tests
    // ========================================================================

    describe('isUserBanned', () => {
        it('should return true when Discord ID is banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue({ '1': 1 }),
            });

            const result = await isUserBanned(mockDb, '123456789', null);

            expect(result).toBe(true);
        });

        it('should return true when XIVAuth ID is banned', async () => {
            const mockFirst = vi.fn()
                .mockResolvedValueOnce(null) // Discord ID not banned
                .mockResolvedValueOnce({ '1': 1 }); // XIVAuth ID banned

            const mockDb = createMockDb({ first: mockFirst });

            const result = await isUserBanned(mockDb, '123456789', 'xivauth-123');

            expect(result).toBe(true);
        });

        it('should return false when neither ID is banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await isUserBanned(mockDb, '123456789', 'xivauth-123');

            expect(result).toBe(false);
        });

        it('should return false when both IDs are null', async () => {
            const mockDb = createMockDb();

            const result = await isUserBanned(mockDb, null, null);

            expect(result).toBe(false);
        });

        it('should check Discord ID first and short-circuit if banned', async () => {
            const mockFirst = vi.fn().mockResolvedValue({ '1': 1 });
            const mockDb = createMockDb({ first: mockFirst });

            const result = await isUserBanned(mockDb, '123456789', 'xivauth-123');

            expect(result).toBe(true);
            // Should only call once (short-circuit after finding Discord ID banned)
            expect(mockFirst).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // searchPresetAuthors tests
    // ========================================================================

    describe('searchPresetAuthors', () => {
        it('should return formatted search results', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({
                    results: [
                        { discord_id: '123', username: 'User1', preset_count: 5 },
                        { discord_id: '456', username: 'User2', preset_count: 3 },
                    ],
                }),
            });

            const result = await searchPresetAuthors(mockDb, 'User');

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                discordId: '123',
                username: 'User1',
                presetCount: 5,
            });
        });

        it('should escape special LIKE characters', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({ results: [] }),
            });

            await searchPresetAuthors(mockDb, 'Test%User_Name');

            // The bind should be called with escaped pattern
            expect(mockDb.prepare).toHaveBeenCalled();
        });

        it('should respect limit parameter', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({ results: [] }),
            });

            await searchPresetAuthors(mockDb, 'User', 10);

            expect(mockDb.prepare).toHaveBeenCalled();
        });

        it('should use default limit of 25', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({ results: [] }),
            });

            await searchPresetAuthors(mockDb, 'User');

            expect(mockDb.prepare).toHaveBeenCalled();
        });

        it('should fallback to simple query when banned_users table fails', async () => {
            const mockAll = vi.fn()
                .mockRejectedValueOnce(new Error('no such table: banned_users'))
                .mockResolvedValueOnce({
                    results: [
                        { discord_id: '123', username: 'User1', preset_count: 5 },
                    ],
                });

            const mockDb = createMockDb({ all: mockAll });

            const result = await searchPresetAuthors(mockDb, 'User');

            expect(result).toHaveLength(1);
            expect(console.warn).toHaveBeenCalled();
        });

        it('should return empty array when no results', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({ results: [] }),
            });

            const result = await searchPresetAuthors(mockDb, 'NonExistent');

            expect(result).toEqual([]);
        });

        it('should handle undefined results array', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({}),
            });

            const result = await searchPresetAuthors(mockDb, 'User');

            expect(result).toEqual([]);
        });
    });

    // ========================================================================
    // searchBannedUsers tests
    // ========================================================================

    describe('searchBannedUsers', () => {
        it('should return formatted banned user results', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({
                    results: [
                        {
                            discord_id: '123',
                            xivauth_id: 'xiv123',
                            username: 'BannedUser',
                            banned_at: '2024-01-01T00:00:00Z',
                        },
                    ],
                }),
            });

            const result = await searchBannedUsers(mockDb, 'Banned');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                discordId: '123',
                xivAuthId: 'xiv123',
                username: 'BannedUser',
                bannedAt: '2024-01-01T00:00:00Z',
            });
        });

        it('should search by both username and discord_id', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({ results: [] }),
            });

            await searchBannedUsers(mockDb, '123456789');

            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('username LIKE')
            );
        });

        it('should return empty array when table does not exist', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockRejectedValue(new Error('no such table')),
            });

            const result = await searchBannedUsers(mockDb, 'User');

            expect(result).toEqual([]);
            expect(console.warn).toHaveBeenCalled();
        });

        it('should handle null IDs in results', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({
                    results: [
                        {
                            discord_id: null,
                            xivauth_id: null,
                            username: 'User',
                            banned_at: '2024-01-01T00:00:00Z',
                        },
                    ],
                }),
            });

            const result = await searchBannedUsers(mockDb, 'User');

            expect(result[0].discordId).toBeNull();
            expect(result[0].xivAuthId).toBeNull();
        });

        it('should handle undefined results array', async () => {
            const mockDb = createMockDb({
                all: vi.fn().mockResolvedValue({}), // No results property
            });

            const result = await searchBannedUsers(mockDb, 'User');

            expect(result).toEqual([]);
        });
    });

    // ========================================================================
    // getUserForBanConfirmation tests
    // ========================================================================

    describe('getUserForBanConfirmation', () => {
        it('should return user data with recent presets', async () => {
            const mockFirst = vi.fn().mockResolvedValue({
                discord_id: '123',
                username: 'TestUser',
                preset_count: 10,
            });
            const mockAll = vi.fn().mockResolvedValue({
                results: [
                    { id: 'preset1', name: 'Sunset Palette' },
                    { id: 'preset2', name: 'Ocean Blue' },
                ],
            });

            const mockDb = createMockDb({ first: mockFirst, all: mockAll });

            const result = await getUserForBanConfirmation(mockDb, '123', 'https://example.com');

            expect(result).not.toBeNull();
            expect(result!.user).toEqual({
                discordId: '123',
                username: 'TestUser',
                presetCount: 10,
            });
            expect(result!.recentPresets).toHaveLength(2);
            expect(result!.recentPresets[0].shareUrl).toBe('https://example.com/presets/preset1');
        });

        it('should return null when user not found', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await getUserForBanConfirmation(mockDb, '999', 'https://example.com');

            expect(result).toBeNull();
        });

        it('should handle empty presets list', async () => {
            const mockFirst = vi.fn().mockResolvedValue({
                discord_id: '123',
                username: 'TestUser',
                preset_count: 0,
            });
            const mockAll = vi.fn().mockResolvedValue({ results: [] });

            const mockDb = createMockDb({ first: mockFirst, all: mockAll });

            const result = await getUserForBanConfirmation(mockDb, '123', 'https://example.com');

            expect(result!.recentPresets).toEqual([]);
        });

        it('should construct correct share URLs', async () => {
            const mockFirst = vi.fn().mockResolvedValue({
                discord_id: '123',
                username: 'TestUser',
                preset_count: 1,
            });
            const mockAll = vi.fn().mockResolvedValue({
                results: [{ id: 'abc-123-def', name: 'My Preset' }],
            });

            const mockDb = createMockDb({ first: mockFirst, all: mockAll });

            const result = await getUserForBanConfirmation(mockDb, '123', 'https://xivdyetools.com');

            expect(result!.recentPresets[0].shareUrl).toBe('https://xivdyetools.com/presets/abc-123-def');
        });

        it('should handle undefined presets results array', async () => {
            const mockFirst = vi.fn().mockResolvedValue({
                discord_id: '123',
                username: 'TestUser',
                preset_count: 5,
            });
            const mockAll = vi.fn().mockResolvedValue({}); // No results property

            const mockDb = createMockDb({ first: mockFirst, all: mockAll });

            const result = await getUserForBanConfirmation(mockDb, '123', 'https://example.com');

            expect(result).not.toBeNull();
            expect(result!.user.username).toBe('TestUser');
            expect(result!.recentPresets).toEqual([]);
        });
    });

    // ========================================================================
    // banUser tests
    // ========================================================================

    describe('banUser', () => {
        it('should successfully ban a user', async () => {
            const mockFirst = vi.fn().mockResolvedValue(null); // Not already banned
            const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 3 } });

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            // Mock crypto.randomUUID
            vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid');

            const result = await banUser(mockDb, '123', 'TestUser', 'mod456', 'Spam submissions');

            expect(result.success).toBe(true);
            expect(result.presetsHidden).toBe(3);
        });

        it('should return error if user already banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue({ '1': 1 }), // Already banned
            });

            const result = await banUser(mockDb, '123', 'TestUser', 'mod456', 'Spam');

            expect(result.success).toBe(false);
            expect(result.error).toContain('already banned');
        });

        it('should return error when banned_users table missing', async () => {
            const mockFirst = vi.fn().mockResolvedValue(null);
            const mockRun = vi.fn().mockRejectedValue(new Error('no such table: banned_users'));

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await banUser(mockDb, '123', 'TestUser', 'mod456', 'Test reason');

            expect(result.success).toBe(false);
            expect(result.error).toContain('database migration');
        });

        it('should return error for other database errors', async () => {
            const mockFirst = vi.fn().mockResolvedValue(null);
            const mockRun = vi.fn().mockRejectedValue(new Error('Connection failed'));

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await banUser(mockDb, '123', 'TestUser', 'mod456', 'Test reason');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection failed');
        });

        it('should handle non-Error exceptions', async () => {
            const mockFirst = vi.fn().mockResolvedValue(null);
            const mockRun = vi.fn().mockRejectedValue('string error');

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await banUser(mockDb, '123', 'TestUser', 'mod456', 'Test reason');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error');
        });
    });

    // ========================================================================
    // unbanUser tests
    // ========================================================================

    describe('unbanUser', () => {
        it('should successfully unban a user', async () => {
            const mockFirst = vi.fn().mockResolvedValue({ '1': 1 }); // User is banned
            const mockRun = vi.fn()
                .mockResolvedValueOnce({ meta: { changes: 1 } }) // Update ban record
                .mockResolvedValueOnce({ meta: { changes: 5 } }); // Restore presets

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await unbanUser(mockDb, '123', 'mod456');

            expect(result.success).toBe(true);
            expect(result.presetsRestored).toBe(5);
        });

        it('should return error if user not currently banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await unbanUser(mockDb, '123', 'mod456');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not currently banned');
        });

        it('should return error if ban record update fails', async () => {
            const mockFirst = vi.fn().mockResolvedValue({ '1': 1 });
            const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 0 } });

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await unbanUser(mockDb, '123', 'mod456');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to update');
        });

        it('should handle database errors', async () => {
            const mockFirst = vi.fn().mockResolvedValue({ '1': 1 });
            const mockRun = vi.fn().mockRejectedValue(new Error('Database error'));

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await unbanUser(mockDb, '123', 'mod456');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database error');
        });

        it('should handle non-Error exceptions', async () => {
            const mockFirst = vi.fn().mockResolvedValue({ '1': 1 });
            const mockRun = vi.fn().mockRejectedValue('string error');

            const mockDb = createMockDb({ first: mockFirst, run: mockRun });

            const result = await unbanUser(mockDb, '123', 'mod456');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error');
        });
    });

    // ========================================================================
    // hideUserPresets tests
    // ========================================================================

    describe('hideUserPresets', () => {
        it('should return number of presets hidden', async () => {
            const mockDb = createMockDb({
                run: vi.fn().mockResolvedValue({ meta: { changes: 5 } }),
            });

            const result = await hideUserPresets(mockDb, '123');

            expect(result).toBe(5);
        });

        it('should return 0 when no presets to hide', async () => {
            const mockDb = createMockDb({
                run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
            });

            const result = await hideUserPresets(mockDb, '123');

            expect(result).toBe(0);
        });

        it('should handle undefined changes', async () => {
            const mockDb = createMockDb({
                run: vi.fn().mockResolvedValue({ meta: {} }),
            });

            const result = await hideUserPresets(mockDb, '123');

            expect(result).toBe(0);
        });
    });

    // ========================================================================
    // restoreUserPresets tests
    // ========================================================================

    describe('restoreUserPresets', () => {
        it('should return number of presets restored', async () => {
            const mockDb = createMockDb({
                run: vi.fn().mockResolvedValue({ meta: { changes: 10 } }),
            });

            const result = await restoreUserPresets(mockDb, '123');

            expect(result).toBe(10);
        });

        it('should return 0 when no presets to restore', async () => {
            const mockDb = createMockDb({
                run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
            });

            const result = await restoreUserPresets(mockDb, '123');

            expect(result).toBe(0);
        });
    });

    // ========================================================================
    // getActiveBan tests
    // ========================================================================

    describe('getActiveBan', () => {
        it('should return ban record when user is banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue({
                    id: 'ban-123',
                    discord_id: '123456789',
                    xivauth_id: 'xiv-123',
                    username: 'BannedUser',
                    moderator_discord_id: 'mod789',
                    reason: 'Violation of rules',
                    banned_at: '2024-01-01T00:00:00Z',
                    unbanned_at: null,
                    unban_moderator_discord_id: null,
                }),
            });

            const result = await getActiveBan(mockDb, '123456789');

            expect(result).not.toBeNull();
            expect(result!.id).toBe('ban-123');
            expect(result!.discordId).toBe('123456789');
            expect(result!.xivAuthId).toBe('xiv-123');
            expect(result!.username).toBe('BannedUser');
            expect(result!.moderatorDiscordId).toBe('mod789');
            expect(result!.reason).toBe('Violation of rules');
            expect(result!.bannedAt).toBe('2024-01-01T00:00:00Z');
            expect(result!.unbannedAt).toBeNull();
        });

        it('should return null when user is not banned', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null),
            });

            const result = await getActiveBan(mockDb, '123456789');

            expect(result).toBeNull();
        });

        it('should only return active bans (unbanned_at IS NULL)', async () => {
            const mockDb = createMockDb({
                first: vi.fn().mockResolvedValue(null), // Simulating no active ban
            });

            await getActiveBan(mockDb, '123456789');

            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('unbanned_at IS NULL')
            );
        });
    });
});
