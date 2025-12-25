/**
 * Tests for Preset Ban/Unban Command Handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleBanUserSubcommand,
    handleUnbanUserSubcommand,
} from './preset-ban.js';
import { InteractionResponseType, type InteractionResponseBody } from '../types/env.js';

// Mock preset API
vi.mock('../../services/preset-api.js', () => ({
    isModerator: vi.fn((env, userId) => env.MODERATOR_IDS?.includes(userId)),
}));

// Mock ban service
vi.mock('../../services/ban-service.js', () => ({
    getUserForBanConfirmation: vi.fn(),
    getActiveBan: vi.fn(),
    unbanUser: vi.fn(),
}));

// Mock discord-api
vi.mock('../../utils/discord-api.js', () => ({
    editOriginalResponse: vi.fn(() => Promise.resolve()),
}));

describe('preset-ban.ts', () => {
    const mockEnv = {
        MODERATOR_IDS: 'mod123,mod456',
        DISCORD_TOKEN: 'test-token',
        DISCORD_CLIENT_ID: 'client-123',
        MODERATION_CHANNEL_ID: 'mod-channel-123',
        DB: {} as D1Database,
    } as any;

    const mockCtx = {
        waitUntil: vi.fn((promise: Promise<void>) => {
            // Execute the promise to test async behavior
            promise.catch(() => {});
        }),
    } as unknown as ExecutionContext;

    const mockTranslator = {
        t: vi.fn((key: string) => key),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // handleBanUserSubcommand tests
    // ========================================================================

    describe('handleBanUserSubcommand', () => {
        it('should return error when not in moderation channel', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'other-channel', // Not moderation channel
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('moderation channel');
            expect(body.data.flags).toBe(64);
        });

        it('should return error when MODERATION_CHANNEL_ID is not set', async () => {
            const envNoChannel = {
                ...mockEnv,
                MODERATION_CHANNEL_ID: undefined,
            };

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'some-channel',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                envNoChannel,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('moderation channel');
        });

        it('should return error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'regular-user', // Not a moderator
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('permission');
            expect(body.data.flags).toBe(64);
        });

        it('should return error when user option is missing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [] // No options
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('specify a user');
            expect(body.data.flags).toBe(64);
        });

        it('should return error when user not found', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue(null);

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '999999999' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('not found');
            expect(body.data.flags).toBe(64);
        });

        it('should show confirmation embed for valid request', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 5,
                },
                recentPresets: [
                    { id: 'p1', name: 'Preset 1', shareUrl: 'https://example.com/presets/p1' },
                    { id: 'p2', name: 'Preset 2', shareUrl: 'https://example.com/presets/p2' },
                ],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
            expect(body.data.embeds[0].title).toContain('Confirm');
            expect(body.data.embeds[0].color).toBe(0xed4245); // Red color
        });

        it('should include user details in confirmation embed', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 5,
                },
                recentPresets: [],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            const fields = body.data.embeds[0].fields;
            expect(fields.find((f: any) => f.name === 'Username').value).toBe('TestUser');
            expect(fields.find((f: any) => f.name === 'Discord ID').value).toBe('123456789');
            expect(fields.find((f: any) => f.name === 'Total Presets').value).toBe('5');
        });

        it('should include recent presets as links', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 2,
                },
                recentPresets: [
                    { id: 'p1', name: 'Sunset', shareUrl: 'https://example.com/presets/p1' },
                ],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            const presetsField = body.data.embeds[0].fields.find((f: any) => f.name === 'Recent Presets');
            expect(presetsField.value).toContain('[Sunset]');
            expect(presetsField.value).toContain('https://example.com/presets/p1');
        });

        it('should show "No presets found" when user has no presets', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 0,
                },
                recentPresets: [],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            const presetsField = body.data.embeds[0].fields.find((f: any) => f.name === 'Recent Presets');
            expect(presetsField.value).toContain('No presets');
        });

        it('should include Yes/No buttons', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 1,
                },
                recentPresets: [],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            const buttons = body.data.components[0].components;
            expect(buttons).toHaveLength(2);
            expect(buttons[0].custom_id).toBe('ban_confirm_123456789_TestUser');
            expect(buttons[0].style).toBe(4); // Danger
            expect(buttons[1].custom_id).toBe('ban_cancel_123456789');
            expect(buttons[1].style).toBe(2); // Secondary
        });

        it('should be ephemeral', async () => {
            const { getUserForBanConfirmation } = await import('../../services/ban-service.js');
            vi.mocked(getUserForBanConfirmation).mockResolvedValue({
                user: {
                    discordId: '123456789',
                    username: 'TestUser',
                    presetCount: 1,
                },
                recentPresets: [],
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.flags).toBe(64);
        });

        it('should handle undefined options', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleBanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                undefined
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('specify a user');
        });
    });

    // ========================================================================
    // handleUnbanUserSubcommand tests
    // ========================================================================

    describe('handleUnbanUserSubcommand', () => {
        it('should return error when not in moderation channel', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'other-channel',
            } as any;

            const response = await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('moderation channel');
        });

        it('should return error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'regular-user',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('permission');
        });

        it('should return error when user option is missing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                []
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('specify a user');
        });

        it('should return deferred response for valid request', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            const response = await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE);
            expect(body.data.flags).toBe(64); // Ephemeral
        });

        it('should call waitUntil for background processing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );

            expect(mockCtx.waitUntil).toHaveBeenCalled();
        });

        it('should process unban successfully', async () => {
            const { getActiveBan, unbanUser } = await import('../../services/ban-service.js');
            const { editOriginalResponse } = await import('../../utils/discord-api.js');

            vi.mocked(getActiveBan).mockResolvedValue({
                id: 'ban-123',
                discordId: '123456789',
                xivAuthId: null,
                username: 'BannedUser',
                moderatorDiscordId: 'mod789',
                reason: 'Test ban',
                bannedAt: '2024-01-01T00:00:00Z',
                unbannedAt: null,
                unbanModeratorDiscordId: null,
            });
            vi.mocked(unbanUser).mockResolvedValue({
                success: true,
                presetsRestored: 5,
            });

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(editOriginalResponse).toHaveBeenCalledWith(
                'client-123',
                'test-token',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Unbanned'),
                        }),
                    ]),
                })
            );
        });

        it('should handle user not banned', async () => {
            const { getActiveBan } = await import('../../services/ban-service.js');
            const { editOriginalResponse } = await import('../../utils/discord-api.js');

            vi.mocked(getActiveBan).mockResolvedValue(null);

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(editOriginalResponse).toHaveBeenCalledWith(
                'client-123',
                'test-token',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Error'),
                        }),
                    ]),
                })
            );
        });

        it('should handle unban failure', async () => {
            const { getActiveBan, unbanUser } = await import('../../services/ban-service.js');
            const { editOriginalResponse } = await import('../../utils/discord-api.js');

            vi.mocked(getActiveBan).mockResolvedValue({
                id: 'ban-123',
                discordId: '123456789',
                xivAuthId: null,
                username: 'BannedUser',
                moderatorDiscordId: 'mod789',
                reason: 'Test ban',
                bannedAt: '2024-01-01T00:00:00Z',
                unbannedAt: null,
                unbanModeratorDiscordId: null,
            });
            vi.mocked(unbanUser).mockResolvedValue({
                success: false,
                presetsRestored: 0,
                error: 'Database error',
            });

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(editOriginalResponse).toHaveBeenCalledWith(
                'client-123',
                'test-token',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Error'),
                        }),
                    ]),
                })
            );
        });

        it('should handle exception during unban', async () => {
            const { getActiveBan, unbanUser } = await import('../../services/ban-service.js');
            const { editOriginalResponse } = await import('../../utils/discord-api.js');

            vi.mocked(getActiveBan).mockResolvedValue({
                id: 'ban-123',
                discordId: '123456789',
                xivAuthId: null,
                username: 'BannedUser',
                moderatorDiscordId: 'mod789',
                reason: 'Test ban',
                bannedAt: '2024-01-01T00:00:00Z',
                unbannedAt: null,
                unbanModeratorDiscordId: null,
            });
            vi.mocked(unbanUser).mockRejectedValue(new Error('Unexpected error'));

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }]
            );

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(editOriginalResponse).toHaveBeenCalledWith(
                'client-123',
                'test-token',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Error'),
                        }),
                    ]),
                })
            );
        });

        it('should log unban info when logger is provided', async () => {
            const { getActiveBan, unbanUser } = await import('../../services/ban-service.js');

            vi.mocked(getActiveBan).mockResolvedValue({
                id: 'ban-123',
                discordId: '123456789',
                xivAuthId: null,
                username: 'BannedUser',
                moderatorDiscordId: 'mod789',
                reason: 'Test ban',
                bannedAt: '2024-01-01T00:00:00Z',
                unbannedAt: null,
                unbanModeratorDiscordId: null,
            });
            vi.mocked(unbanUser).mockResolvedValue({
                success: true,
                presetsRestored: 3,
            });

            const mockLogger = {
                info: vi.fn(),
                error: vi.fn(),
            };

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }],
                mockLogger as any
            );

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogger.info).toHaveBeenCalledWith(
                'User unbanned',
                expect.objectContaining({
                    targetUserId: '123456789',
                    moderatorId: 'mod123',
                    presetsRestored: 3,
                })
            );
        });

        it('should log error when unban fails with logger', async () => {
            const { getActiveBan, unbanUser } = await import('../../services/ban-service.js');

            vi.mocked(getActiveBan).mockResolvedValue({
                id: 'ban-123',
                discordId: '123456789',
                xivAuthId: null,
                username: 'BannedUser',
                moderatorDiscordId: 'mod789',
                reason: 'Test ban',
                bannedAt: '2024-01-01T00:00:00Z',
                unbannedAt: null,
                unbanModeratorDiscordId: null,
            });
            vi.mocked(unbanUser).mockRejectedValue(new Error('Test error'));

            const mockLogger = {
                info: vi.fn(),
                error: vi.fn(),
            };

            const interaction = {
                id: '123',
                token: 'test-token',
                application_id: 'app',
                channel_id: 'mod-channel-123',
            } as any;

            await handleUnbanUserSubcommand(
                interaction,
                mockEnv,
                mockCtx,
                mockTranslator,
                'mod123',
                [{ name: 'user', value: '123456789' }],
                mockLogger as any
            );

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to unban user',
                expect.any(Error)
            );
        });
    });
});
