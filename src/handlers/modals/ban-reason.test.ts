/**
 * Tests for Ban Reason Modal Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleBanReasonModal,
    isBanReasonModal,
} from './ban-reason.js';
import { InteractionResponseType, type InteractionResponseBody } from '../../types/env.js';

// Mock preset API
vi.mock('../../services/preset-api.js', () => ({
    isModerator: vi.fn((env, userId) => env.MODERATOR_IDS?.includes(userId)),
}));

// Mock ban service
vi.mock('../../services/ban-service.js', () => ({
    banUser: vi.fn(),
}));

// Mock discord-api
vi.mock('../../utils/discord-api.js', () => ({
    sendMessage: vi.fn(() => Promise.resolve()),
}));

describe('ban-reason.ts', () => {
    const mockEnv = {
        MODERATOR_IDS: 'mod123,mod456',
        DISCORD_TOKEN: 'test-token',
        MODERATION_CHANNEL_ID: 'mod-channel-123',
        DB: {} as D1Database,
    } as any;

    const mockCtx = {
        waitUntil: vi.fn((promise: Promise<void>) => {
            promise.catch(() => {});
        }),
    } as unknown as ExecutionContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // isBanReasonModal tests
    // ========================================================================

    describe('isBanReasonModal', () => {
        it('should return true for ban reason modal custom_id', () => {
            expect(isBanReasonModal('ban_reason_modal_123456789_TestUser')).toBe(true);
        });

        it('should return true for modal with complex username', () => {
            expect(isBanReasonModal('ban_reason_modal_123_User_With_Underscores')).toBe(true);
        });

        it('should return false for other modals', () => {
            expect(isBanReasonModal('preset_reject_modal_abc123')).toBe(false);
            expect(isBanReasonModal('preset_revert_modal_abc123')).toBe(false);
        });

        it('should return false for non-modal custom_ids', () => {
            expect(isBanReasonModal('ban_confirm_123456789_TestUser')).toBe(false);
            expect(isBanReasonModal('copy_hex_FF0000')).toBe(false);
        });
    });

    // ========================================================================
    // handleBanReasonModal tests
    // ========================================================================

    describe('handleBanReasonModal', () => {
        it('should return error when moderator ID is missing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                // No member or user
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.flags).toBe(64);
        });

        it('should return error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'regular-user', username: 'RegularUser' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('permission');
            expect(body.data.flags).toBe(64);
        });

        it('should return error for invalid custom_id format', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789', // No underscore for username
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('Invalid modal data');
        });

        it('should return error when target user ID is empty', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal__TestUser', // Empty user ID
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('Invalid target user');
        });

        it('should return error when reason is missing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [], // No components
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('valid ban reason');
        });

        it('should return error when reason is too short', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Short' }, // Less than 10 chars
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('at least 10 characters');
        });

        it('should return UPDATE_MESSAGE with processing embed for valid submission', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly violating rules' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
            expect(body.data.embeds[0].title).toContain('Processing');
            expect(body.data.embeds[0].description).toContain('TestUser');
            expect(body.data.components).toEqual([]);
        });

        it('should call waitUntil for background processing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            expect(mockCtx.waitUntil).toHaveBeenCalled();
        });

        it('should handle DM context (user instead of member)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                user: { id: 'mod123', username: 'Moderator' }, // DM style
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
        });

        it('should send success message to moderation channel on successful ban', async () => {
            const { banUser } = await import('../../services/ban-service.js');
            const { sendMessage } = await import('../../utils/discord-api.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 5,
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(sendMessage).toHaveBeenCalledWith(
                'test-token',
                'mod-channel-123',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Banned'),
                        }),
                    ]),
                })
            );
        });

        it('should send failure message on ban error', async () => {
            const { banUser } = await import('../../services/ban-service.js');
            const { sendMessage } = await import('../../utils/discord-api.js');

            vi.mocked(banUser).mockResolvedValue({
                success: false,
                presetsHidden: 0,
                error: 'User already banned',
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(sendMessage).toHaveBeenCalledWith(
                'test-token',
                'mod-channel-123',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Failed'),
                        }),
                    ]),
                })
            );
        });

        it('should handle exception during ban process', async () => {
            const { banUser } = await import('../../services/ban-service.js');
            const { sendMessage } = await import('../../utils/discord-api.js');

            vi.mocked(banUser).mockRejectedValue(new Error('Database connection failed'));

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(sendMessage).toHaveBeenCalledWith(
                'test-token',
                'mod-channel-123',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Failed'),
                        }),
                    ]),
                })
            );
        });

        it('should not send message when MODERATION_CHANNEL_ID is not set', async () => {
            const { banUser } = await import('../../services/ban-service.js');
            const { sendMessage } = await import('../../utils/discord-api.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 5,
            });

            const envNoChannel = {
                ...mockEnv,
                MODERATION_CHANNEL_ID: undefined,
            };

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, envNoChannel, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(sendMessage).not.toHaveBeenCalled();
        });

        it('should log ban info when logger is provided', async () => {
            const { banUser } = await import('../../services/ban-service.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 3,
            });

            const mockLogger = {
                info: vi.fn(),
                error: vi.fn(),
            };

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx, mockLogger as any);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogger.info).toHaveBeenCalledWith(
                'User banned',
                expect.objectContaining({
                    targetUserId: '123456789',
                    targetUsername: 'TestUser',
                    moderatorId: 'mod123',
                    presetsHidden: 3,
                    reason: 'Spam submissions repeatedly',
                })
            );
        });

        it('should log error when ban fails with logger', async () => {
            const { banUser } = await import('../../services/ban-service.js');

            vi.mocked(banUser).mockRejectedValue(new Error('Test error'));

            const mockLogger = {
                info: vi.fn(),
                error: vi.fn(),
            };

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx, mockLogger as any);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to ban user',
                expect.any(Error)
            );
        });

        it('should extract reason from nested components correctly', async () => {
            const { banUser } = await import('../../services/ban-service.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 1,
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1, // Action Row
                            components: [
                                { type: 4, custom_id: 'other_field', value: 'Other value' },
                            ],
                        },
                        {
                            type: 1, // Second Action Row
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'The actual ban reason here' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(banUser).toHaveBeenCalledWith(
                expect.anything(),
                '123456789',
                'TestUser',
                'mod123',
                'The actual ban reason here'
            );
        });

        it('should skip non-action-row components', async () => {
            const { banUser } = await import('../../services/ban-service.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 1,
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 2, // Not an action row
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Should be skipped' },
                            ],
                        },
                        {
                            type: 1, // Action Row
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Valid reason text here' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(banUser).toHaveBeenCalledWith(
                expect.anything(),
                '123456789',
                'TestUser',
                'mod123',
                'Valid reason text here'
            );
        });

        it('should handle undefined components', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    // No components property
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
            expect(body.data.embeds[0].description).toContain('valid ban reason');
        });

        it('should handle missing custom_id gracefully', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    // No custom_id
                    components: [],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Error');
        });

        it('should preserve username with underscores from custom_id', async () => {
            const { banUser } = await import('../../services/ban-service.js');

            vi.mocked(banUser).mockResolvedValue({
                success: true,
                presetsHidden: 1,
            });

            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_User_Name_With_Underscores',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Valid reason with more than ten chars' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            await handleBanReasonModal(interaction, mockEnv, mockCtx);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(banUser).toHaveBeenCalledWith(
                expect.anything(),
                '123456789',
                'User_Name_With_Underscores',
                'mod123',
                expect.any(String)
            );
        });

        it('should use yellow color for processing embed', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'ban_reason_modal_123456789_TestUser',
                    components: [
                        {
                            type: 1,
                            components: [
                                { type: 4, custom_id: 'ban_reason', value: 'Spam submissions repeatedly' },
                            ],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanReasonModal(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].color).toBe(0xfee75c); // Yellow
        });
    });
});
