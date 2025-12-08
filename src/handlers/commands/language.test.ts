/**
 * Tests for /language Command Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLanguageCommand } from './language.js';

// Mock i18n service with overridable functions
let mockGetUserLanguagePreference = vi.fn(() => Promise.resolve(null));
let mockSetUserLanguagePreference = vi.fn(() => Promise.resolve(true));
let mockClearUserLanguagePreference = vi.fn(() => Promise.resolve(true));
let mockGetLocaleInfo = vi.fn((locale: string) => {
    if (locale === 'en') return { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' };
    if (locale === 'ja') return { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' };
    return null;
});
let mockDiscordLocaleToLocaleCode = vi.fn((locale: string) => {
    if (locale === 'en-US') return 'en';
    if (locale === 'ja') return 'ja';
    return null;
});

vi.mock('../../services/i18n.js', () => ({
    SUPPORTED_LOCALES: [
        { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
        { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    ],
    isValidLocale: vi.fn((locale: string) => ['en', 'ja'].includes(locale)),
    getLocaleInfo: (locale: string) => mockGetLocaleInfo(locale),
    getUserLanguagePreference: (...args: any[]) => mockGetUserLanguagePreference(...args),
    setUserLanguagePreference: (...args: any[]) => mockSetUserLanguagePreference(...args),
    clearUserLanguagePreference: (...args: any[]) => mockClearUserLanguagePreference(...args),
    discordLocaleToLocaleCode: (locale: string) => mockDiscordLocaleToLocaleCode(locale),
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
        // Reset mock implementations to default
        mockGetUserLanguagePreference = vi.fn(() => Promise.resolve(null));
        mockSetUserLanguagePreference = vi.fn(() => Promise.resolve(true));
        mockClearUserLanguagePreference = vi.fn(() => Promise.resolve(true));
        mockGetLocaleInfo = vi.fn((locale: string) => {
            if (locale === 'en') return { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' };
            if (locale === 'ja') return { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' };
            return null;
        });
        mockDiscordLocaleToLocaleCode = vi.fn((locale: string) => {
            if (locale === 'en-US') return 'en';
            if (locale === 'ja') return 'ja';
            return null;
        });
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

            it('should return error when KV save fails', async () => {
                // Override mock to return false (KV failure)
                mockSetUserLanguagePreference = vi.fn(() => Promise.resolve(false));

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
                expect(body.data.embeds[0].title).toContain('error');
            });

            it('should handle unknown locale info (getLocaleInfo returns null)', async () => {
                // Override to return null for the locale being set
                mockGetLocaleInfo = vi.fn(() => null);

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

                // Should still succeed, just display raw locale code
                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
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

            it('should show existing user preference', async () => {
                // User has an existing preference
                mockGetUserLanguagePreference = vi.fn(() => Promise.resolve('ja'));

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
                // Should include Japanese in the display
                expect(body.data.embeds[0].description).toContain('日本語');
            });

            it('should handle unsupported Discord locale', async () => {
                // Override to return null for Discord locale mapping
                mockDiscordLocaleToLocaleCode = vi.fn(() => null);

                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    locale: 'zh-CN', // Unsupported locale
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [{ name: 'show', type: 1 }],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
            });

            it('should handle no Discord locale', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    // No locale property
                    member: { user: { id: 'user123', username: 'User' } },
                    data: {
                        options: [{ name: 'show', type: 1 }],
                    },
                };

                const response = await handleLanguageCommand(interaction, mockEnv, mockCtx);
                const body = (await response.json()) as any;

                expect(body.type).toBe(4);
                expect(body.data.embeds).toBeDefined();
            });

            it('should handle unknown preference locale info (getLocaleInfo returns null for preference)', async () => {
                // User has preference but getLocaleInfo returns null
                mockGetUserLanguagePreference = vi.fn(() => Promise.resolve('unknown-locale'));
                mockGetLocaleInfo = vi.fn(() => null);

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
                // Should display raw locale code
                expect(body.data.embeds[0].description).toContain('unknown-locale');
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

            it('should return error when KV clear fails', async () => {
                // Override mock to return false (KV failure)
                mockClearUserLanguagePreference = vi.fn(() => Promise.resolve(false));

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
                expect(body.data.embeds[0].title).toContain('error');
            });
        });

        describe('user context', () => {
            it('should use interaction.user when member is not present (DM context)', async () => {
                const interaction = {
                    id: '123',
                    token: 'token',
                    application_id: 'app',
                    locale: 'en-US',
                    user: { id: 'dm-user123', username: 'DMUser' }, // DM style
                    data: {
                        options: [{ name: 'show', type: 1 }],
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
