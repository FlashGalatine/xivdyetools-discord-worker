/**
 * Tests for /manual Command Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleManualCommand } from './manual.js';

// Mock bot-i18n service
vi.mock('../../services/bot-i18n.js', () => ({
    createUserTranslator: vi.fn(() =>
        Promise.resolve({
            t: vi.fn((key: string) => key),
            locale: 'en',
        })
    ),
}));

describe('handlers/commands/manual.ts', () => {
    const mockEnv = {
        KV: {
            get: vi.fn(),
        },
    } as any;

    const mockCtx = {
        waitUntil: vi.fn(),
    } as unknown as ExecutionContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleManualCommand', () => {
        it('should return embeds with manual content', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                locale: 'en-US',
                member: { user: { id: 'user123' } },
            };

            const response = await handleManualCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
            expect(body.data.embeds).toBeDefined();
            expect(body.data.embeds.length).toBeGreaterThan(0);
            expect(body.data.flags).toBe(64); // Ephemeral
        });

        it('should include all help sections', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                member: { user: { id: 'user123' } },
            };

            const response = await handleManualCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            // Should have 5 embeds: Overview, Color Matching, Dye Information, Bot Information, Tips
            expect(body.data.embeds.length).toBe(5);
        });

        it('should handle DM user (without member)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                user: { id: 'user123' },
            };

            const response = await handleManualCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.type).toBe(4);
            expect(body.data.embeds).toBeDefined();
        });

        it('should include Discord blurple color in overview', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                member: { user: { id: 'user123' } },
            };

            const response = await handleManualCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            // First embed should be overview with blurple color
            expect(body.data.embeds[0].color).toBe(0x5865f2);
        });

        it('should handle missing user (fallback to unknown)', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
            };

            const response = await handleManualCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.type).toBe(4);
            expect(body.data.embeds).toBeDefined();
        });
    });
});
