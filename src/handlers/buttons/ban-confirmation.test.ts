/**
 * Tests for Ban Confirmation Button Handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleBanConfirmButton,
    handleBanCancelButton,
    isBanConfirmButton,
    isBanCancelButton,
} from './ban-confirmation.js';
import { InteractionResponseType, type InteractionResponseBody } from '../../types/env.js';

// Mock preset API
vi.mock('../../services/preset-api.js', () => ({
    isModerator: vi.fn((env, userId) => env.MODERATOR_IDS?.includes(userId)),
}));

describe('ban-confirmation.ts', () => {
    const mockEnv = {
        MODERATOR_IDS: 'mod123,mod456',
        DISCORD_TOKEN: 'test-token',
        MODERATION_CHANNEL_ID: 'mod-channel',
    } as any;

    const mockCtx = {
        waitUntil: vi.fn(),
    } as unknown as ExecutionContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // isBanConfirmButton tests
    // ========================================================================

    describe('isBanConfirmButton', () => {
        it('should return true for ban confirm buttons', () => {
            expect(isBanConfirmButton('ban_confirm_123456789_TestUser')).toBe(true);
        });

        it('should return true for ban confirm button with complex username', () => {
            expect(isBanConfirmButton('ban_confirm_123_User_Name_With_Underscores')).toBe(true);
        });

        it('should return false for ban cancel buttons', () => {
            expect(isBanCancelButton('ban_confirm_123456789')).toBe(false);
        });

        it('should return false for other buttons', () => {
            expect(isBanConfirmButton('copy_hex_FF0000')).toBe(false);
            expect(isBanConfirmButton('preset_approve_abc123')).toBe(false);
        });
    });

    // ========================================================================
    // isBanCancelButton tests
    // ========================================================================

    describe('isBanCancelButton', () => {
        it('should return true for ban cancel buttons', () => {
            expect(isBanCancelButton('ban_cancel_123456789')).toBe(true);
        });

        it('should return false for ban confirm buttons', () => {
            expect(isBanCancelButton('ban_confirm_123456789_TestUser')).toBe(false);
        });

        it('should return false for other buttons', () => {
            expect(isBanCancelButton('copy_hex_FF0000')).toBe(false);
            expect(isBanCancelButton('preset_reject_abc123')).toBe(false);
        });
    });

    // ========================================================================
    // handleBanConfirmButton tests
    // ========================================================================

    describe('handleBanConfirmButton', () => {
        it('should return ephemeral error when user ID is missing', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_TestUser' },
                // No member or user
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('Invalid');
            expect(body.data.flags).toBe(64);
        });

        it('should return ephemeral error for non-moderators', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_TestUser' },
                member: { user: { id: 'user999', username: 'RegularUser' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('permission');
            expect(body.data.flags).toBe(64);
        });

        it('should return ephemeral error for invalid custom_id format (no underscore after ID)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789' }, // No username part
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('Invalid button data');
            expect(body.data.flags).toBe(64);
        });

        it('should return ephemeral error when target user ID is empty', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm__TestUser' }, // Empty ID before underscore
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.content).toContain('Invalid target user');
            expect(body.data.flags).toBe(64);
        });

        it('should show ban reason modal for valid moderator request', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_TestUser' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.MODAL);
            expect(body.data.custom_id).toBe('ban_reason_modal_123456789_TestUser');
            expect(body.data.title).toBe('Ban Reason');
        });

        it('should include reason text input in modal', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_TestUser' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            const textInput = body.data.components[0].components[0];
            expect(textInput.custom_id).toBe('ban_reason');
            expect(textInput.type).toBe(4); // Text Input
            expect(textInput.style).toBe(2); // Paragraph
            expect(textInput.min_length).toBe(10);
            expect(textInput.max_length).toBe(500);
            expect(textInput.required).toBe(true);
        });

        it('should handle DM user without member (user object)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_TestUser' },
                user: { id: 'mod123', username: 'Moderator' }, // DM style
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.MODAL);
        });

        it('should preserve username with underscores in modal custom_id', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_confirm_123456789_User_Name_Here' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.custom_id).toBe('ban_reason_modal_123456789_User_Name_Here');
        });

        it('should handle missing custom_id gracefully', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: {}, // No custom_id
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanConfirmButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            // Should fail validation since empty custom_id won't have underscore
            expect(body.data.content).toContain('Invalid');
            expect(body.data.flags).toBe(64);
        });
    });

    // ========================================================================
    // handleBanCancelButton tests
    // ========================================================================

    describe('handleBanCancelButton', () => {
        it('should return UPDATE_MESSAGE response with cancellation embed', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_cancel_123456789' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanCancelButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
        });

        it('should show cancellation message in embed', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_cancel_123456789' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanCancelButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].title).toContain('Cancelled');
            expect(body.data.embeds[0].description).toContain('cancelled');
        });

        it('should remove buttons from the message', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_cancel_123456789' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanCancelButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.components).toEqual([]);
        });

        it('should use Discord Blurple color for cancel embed', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_cancel_123456789' },
                member: { user: { id: 'mod123', username: 'Moderator' } },
            };

            const response = await handleBanCancelButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.data.embeds[0].color).toBe(0x5865f2);
        });

        it('should work without member (DM context)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { custom_id: 'ban_cancel_123456789' },
                user: { id: 'user123', username: 'User' }, // DM style
            };

            const response = await handleBanCancelButton(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as InteractionResponseBody;

            expect(body.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
        });
    });
});
