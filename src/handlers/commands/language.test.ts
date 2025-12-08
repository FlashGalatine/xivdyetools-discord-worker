/**
 * Tests for /language Command Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLanguageCommand } from './language.js';

// Mock i18n service
vi.mock('../../services/i18n.js', () => ({
    SUPPORTED_LOCALES: [
        { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
        { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    ],
    isValidLocale: vi.fn((locale: string) => ['en', 'ja'].includes(locale)),
    getLocaleInfo: vi.fn((locale: string) => {
        if (locale === 'en') return { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' };
        if (locale === 'ja') return { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' };
        return null;
    }),
    getUserLanguagePreference: vi.fn(() => Promise.resolve(null)),
    setUserLanguagePreference: vi.fn(() => Promise.resolve(true)),
    clearUserLanguagePreference: vi.fn(() => Promise.resolve(true)),
    discordLocaleToLocaleCode: vi.fn((locale: string) => {
        if (locale === 'en-US') return 'en';
        if (locale === 'ja') return 'ja';
        return null;
    }),
}));

// Mock bot-i18n service
vi.mock('../../services/bot-i18n.js', () => ({
    createUserTranslator: vi.fn(() =>
        Promise.resolve({
            t: vi.fn((key: string) => key),
            locale: 'en',
        })
    ),
}));

describe('handlers/commands/language.ts', () => {
    const mockEnv = {
        KV: {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
    } as any;

    const mockCtx = {
        waitUntil: vi.fn(),
    } as unknown as ExecutionContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleLanguageCommand', () => {
        it('should return error for missing user ID', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                data: { options: [{ name: 'show', type: 1 }] },
            };

            const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.data.content).toContain('Could not identify user');
        });

        it('should return error for missing subcommand', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                member: { user: { id: 'user123', username: 'User' } },
                data: { options: [] },
            };

            const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.data.content).toContain('subcommand');
        });

        it('should return error for unknown subcommand', async () => {
            const interaction = {
                id: '123',
                token: 'token',
                application_id: 'app',
                member: { user: { id: 'user123', username: 'User' } },
                data: { options: [{ name: 'unknown', type: 1 }] },
            };

            const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
            const body = (await response.json()) as any;

            expect(body.data.content).toContain('Unknown subcommand');
        });

        describe('set subcommand', () => {
            it('should set valid language preference', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [
                            {
                                name: 'set',
                                type: 1,
                                options: [{ name: 'locale', value: 'ja' }],
                            },
                        ],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
            });

            it('should return error for missing locale', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [{ name: 'set', type: 1, options: [] }],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds[0].title).toContain('error');
            });

            it('should return error for invalid locale', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [
                            {
                                name: 'set',
                                type: 1,
                                options: [{ name: 'locale', value: 'invalid' }],
                            },
                        ],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds[0].title).toContain('error');
            });
        });

        describe('show subcommand', () => {
            it('should show current language settings', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    locale: 'en-US',
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [{ name: 'show', type: 1 }],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
                expect(body.data.flags).toBe(64);
            });
        });

        describe('reset subcommand', () => {
            it('should reset language preference', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [{ name: 'reset', type: 1 }],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
            });
        });
    });
});
