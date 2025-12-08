/**
 * Tests for Preset Moderation Button Handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handlePresetApproveButton,
    handlePresetRejectButton,
    handlePresetRevertButton,
    isPresetModerationButton,
} from './preset-moderation.js';
import { InteractionResponseType } from '../../types/env.js';

// Mock preset API
vi.mock('../../services/preset-api.js', () => ({
    isModerator: vi.fn((env, userId) => env.MODERATOR_IDS?.includes(userId)),
    approvePreset: vi.fn(() => Promise.resolve({ id: 'preset123', name: 'Test Preset' })),
    rejectPreset: vi.fn(() => Promise.resolve({ id: 'preset123', name: 'Test Preset' })),
    revertPreset: vi.fn(() => Promise.resolve({ id: 'preset123', name: 'Test Preset' })),
}));

// Mock discord-api
vi.mock('../../utils/discord-api.js', () => ({
    editMessage: vi.fn(() => Promise.resolve()),
    sendMessage: vi.fn(() => Promise.resolve()),
}));

describe('preset-moderation.ts', () => {
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

    describe('isPresetModerationButton', () => {
        it('should return true for approve buttons', () => {
            expect(isPresetModerationButton('preset_approve_abc123')).toBe(true);
        });

        it('should return true for reject buttons', () => {
            expect(isPresetModerationButton('preset_reject_abc123')).toBe(true);
        });

        it('should return true for revert buttons', () => {
            expect(isPresetModerationButton('preset_revert_abc123')).toBe(true);
        });

        it('should return false for other buttons', () => {
            expect(isPresetModerationButton('copy_hex_FF0000')).toBe(false);
            expect(isPresetModerationButton('other_button')).toBe(false);
        });
    });

    describe('handlePresetApproveButton', () => {
        it('should return ephemeral error for invalid interaction', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_approve_' }, // No preset ID
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetApproveButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.content).toContain('Invalid');
            expect(body.data.flags).toBe(64);
        });

        it('should return ephemeral error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_approve_abc123' },
                member: { user: { id: 'user999', username: 'User' } },
            };

            const response = await handlePresetApproveButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.content).toContain('permission');
            expect(body.data.flags).toBe(64);
        });

        it('should defer update and process for moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_approve_abc123' },
                member: { user: { id: 'mod123', username: 'Mod' } },
                channel_id: 'channel123',
                message: { id: 'msg123', embeds: [{ title: 'Test' }] },
            };

            const response = await handlePresetApproveButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.DEFERRED_UPDATE_MESSAGE);
            expect(mockCtx.waitUntil).toHaveBeenCalled();
        });
    });

    describe('handlePresetRejectButton', () => {
        it('should return ephemeral error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_reject_abc123' },
                member: { user: { id: 'user999', username: 'User' } },
            };

            const response = await handlePresetRejectButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.content).toContain('permission');
        });

        it('should show modal for moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_reject_abc123' },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRejectButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.MODAL);
            expect(body.data.custom_id).toBe('preset_reject_modal_abc123');
            expect(body.data.title).toBe('Reject Preset');
        });

        it('should include rejection reason text input in modal', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_reject_abc123' },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRejectButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            const textInput = body.data.components[0].components[0];
            expect(textInput.custom_id).toBe('rejection_reason');
            expect(textInput.type).toBe(4); // Text Input
            expect(textInput.min_length).toBe(10);
        });
    });

    describe('handlePresetRevertButton', () => {
        it('should return ephemeral error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_revert_abc123' },
                member: { user: { id: 'user999', username: 'User' } },
            };

            const response = await handlePresetRevertButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.content).toContain('permission');
        });

        it('should show modal for moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_revert_abc123' },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRevertButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.type).toBe(InteractionResponseType.MODAL);
            expect(body.data.custom_id).toBe('preset_revert_modal_abc123');
            expect(body.data.title).toBe('Revert Preset Edit');
        });

        it('should include revert reason text input in modal', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_revert_abc123' },
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRevertButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            const textInput = body.data.components[0].components[0];
            expect(textInput.custom_id).toBe('revert_reason');
            expect(textInput.type).toBe(4);
        });

        it('should return ephemeral error for invalid interaction', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'preset_revert_' }, // No preset ID
                member: { user: { id: 'mod123', username: 'Mod' } },
            };

            const response = await handlePresetRevertButton(interaction, mockEnv, mockCtx);
            const body = await response.json();

            expect(body.data.content).toContain('Invalid');
        });
    });
});
