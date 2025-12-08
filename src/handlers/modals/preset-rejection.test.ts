/**
 * Tests for Preset Rejection Modal Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handlePresetRejectionModal,
    isPresetRejectionModal,
    handlePresetRevertModal,
    isPresetRevertModal,
} from './preset-rejection.js';
import { InteractionResponseType } from '../../types/env.js';

// Mock preset API
vi.mock('../../services/preset-api.js', () => ({
    isModerator: vi.fn((env, userId) => env.MODERATOR_IDS?.includes(userId)),
    rejectPreset: vi.fn(() => Promise.resolve({ id: 'preset123', name: 'Test Preset' })),
    revertPreset: vi.fn(() => Promise.resolve({ id: 'preset123', name: 'Test Preset' })),
}));

// Mock discord-api
vi.mock('../../utils/discord-api.js', () => ({
    editMessage: vi.fn(() => Promise.resolve()),
    sendMessage: vi.fn(() => Promise.resolve()),
}));

describe('preset-rejection.ts', () => {
    const mockEnv = {
        MODERATOR_IDS: 'mod123,mod456',
        DISCORD_TOKEN: 'test-token',
        SUBMISSION_LOG_CHANNEL_ID: 'log-channel',
    } as any;

    const mockCtx = {
        waitUntil: vi.fn(),
    } as unknown as ExecutionContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isPresetRejectionModal', () => {
        it('should return true for rejection modal custom_ids', () => {
            expect(isPresetRejectionModal('preset_reject_modal_abc123')).toBe(true);
        });

        it('should return false for other custom_ids', () => {
            expect(isPresetRejectionModal('preset_approve_abc123')).toBe(false);
            expect(isPresetRejectionModal('other_modal')).toBe(false);
        });
    });

    describe('isPresetRevertModal', () => {
        it('should return true for revert modal custom_ids', () => {
            expect(isPresetRevertModal('preset_revert_modal_abc123')).toBe(true);
        });

        it('should return false for other custom_ids', () => {
            expect(isPresetRevertModal('preset_reject_modal_abc123')).toBe(false);
            expect(isPresetRevertModal('other_modal')).toBe(false);
        });
    });

    describe('handlePresetRejectionModal', () => {
        it('should return error for invalid modal submission', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_reject_modal_' }, // No preset ID
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRejectionModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

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
                    custom_id: 'preset_reject_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'rejection_reason', value: 'This is a valid reason' }],
                        },
                    ],
                },
                member: { user: { id: 'user999', username: 'User' } },
            };

            const response = await handlePresetRejectionModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.embeds[0].description).toContain('permission');
        });

        it('should return error for short rejection reason', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_reject_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'rejection_reason', value: 'Short' }],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRejectionModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.embeds[0].description).toContain('10 characters');
        });

        it('should defer update and process for valid submission', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_reject_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'rejection_reason', value: 'This is a valid rejection reason' }],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Mod' } },
                channel_id: 'channel123',
                message: { id: 'msg123', embeds: [{ title: 'Test' }] },
            };

            const response = await handlePresetRejectionModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.DEFERRED_UPDATE_MESSAGE);
            expect(mockCtx.waitUntil).toHaveBeenCalled();
        });
    });

    describe('handlePresetRevertModal', () => {
        it('should return error for invalid modal submission', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_revert_modal_' }, // No preset ID
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRevertModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
            expect(body.data.embeds[0].title).toContain('Error');
        });

        it('should return error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_revert_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'revert_reason', value: 'This is a valid reason' }],
                        },
                    ],
                },
                member: { user: { id: 'user999', username: 'User' } },
            };

            const response = await handlePresetRevertModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.embeds[0].description).toContain('permission');
        });

        it('should return error for short revert reason', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_revert_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'revert_reason', value: 'Short' }],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRevertModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.embeds[0].description).toContain('10 characters');
        });

        it('should defer update and process for valid submission', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_revert_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'revert_reason', value: 'This is a valid revert reason' }],
                        },
                    ],
                },
                member: { user: { id: 'mod123', username: 'Mod' } },
                channel_id: 'channel123',
                message: { id: 'msg123', embeds: [{ title: 'Test' }] },
            };

            const response = await handlePresetRevertModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.DEFERRED_UPDATE_MESSAGE);
            expect(mockCtx.waitUntil).toHaveBeenCalled();
        });

        it('should handle DM user without member', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {
                    custom_id: 'preset_revert_modal_abc123',
                    components: [
                        {
                            type: 1,
                            components: [{ type: 4, custom_id: 'revert_reason', value: 'This is a valid revert reason' }],
                        },
                    ],
                },
                user: { id: 'mod123', username: 'Mod' }, // DM style
                channel_id: 'channel123',
                message: { id: 'msg123', embeds: [{ title: 'Test' }] },
            };

            const response = await handlePresetRevertModal(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.DEFERRED_UPDATE_MESSAGE);
        });
    });
});
