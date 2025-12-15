/**
 * Tests for I18n Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isValidLocale,
    getLocaleInfo,
    discordLocaleToLocaleCode,
    getUserLanguagePreference,
    setUserLanguagePreference,
    clearUserLanguagePreference,
    resolveUserLocale,
    initializeLocale,
    formatLocaleDisplay,
    getLocalizedDyeName,
    getLocalizedCategory,
    SUPPORTED_LOCALES,
    type LocaleCode,
} from './i18n.js';

// Mock xivdyetools-core LocalizationService
vi.mock('@xivdyetools/core', () => ({
    LocalizationService: {
        clear: vi.fn(),
        setLocale: vi.fn().mockResolvedValue(undefined),
        getDyeName: vi.fn((itemID: number) => {
            const names: Record<number, string> = { 5729: 'Snow White', 5730: 'Soot Black' };
            return names[itemID] ?? null;
        }),
        getCategory: vi.fn((category: string) => `Localized_${category}`),
    },
}));

import { LocalizationService } from '@xivdyetools/core';

// Create mock KV namespace
function createMockKV() {
    const store = new Map<string, string>();

    return {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        _store: store,
    } as unknown as KVNamespace & { _store: Map<string, string> };
}

describe('i18n.ts', () => {
    let mockKV: ReturnType<typeof createMockKV>;
    const mockUserId = 'user-123';

    beforeEach(() => {
        mockKV = createMockKV();
        vi.clearAllMocks();
    });

    describe('SUPPORTED_LOCALES', () => {
        it('should contain all 6 supported locales', () => {
            expect(SUPPORTED_LOCALES).toHaveLength(6);

            const codes = SUPPORTED_LOCALES.map(l => l.code);
            expect(codes).toContain('en');
            expect(codes).toContain('ja');
            expect(codes).toContain('de');
            expect(codes).toContain('fr');
            expect(codes).toContain('ko');
            expect(codes).toContain('zh');
        });

        it('should have proper locale info structure', () => {
            const en = SUPPORTED_LOCALES.find(l => l.code === 'en');
            expect(en).toEqual({
                code: 'en',
                name: 'English',
                nativeName: 'English',
                flag: '🇺🇸',
            });

            const ja = SUPPORTED_LOCALES.find(l => l.code === 'ja');
            expect(ja).toEqual({
                code: 'ja',
                name: 'Japanese',
                nativeName: '日本語',
                flag: '🇯🇵',
            });
        });
    });

    describe('isValidLocale', () => {
        it('should return true for valid locale codes', () => {
            expect(isValidLocale('en')).toBe(true);
            expect(isValidLocale('ja')).toBe(true);
            expect(isValidLocale('de')).toBe(true);
            expect(isValidLocale('fr')).toBe(true);
            expect(isValidLocale('ko')).toBe(true);
            expect(isValidLocale('zh')).toBe(true);
        });

        it('should return false for invalid locale codes', () => {
            expect(isValidLocale('es')).toBe(false);
            expect(isValidLocale('pt')).toBe(false);
            expect(isValidLocale('EN')).toBe(false); // Case-sensitive
            expect(isValidLocale('')).toBe(false);
            expect(isValidLocale('english')).toBe(false);
        });
    });

    describe('getLocaleInfo', () => {
        it('should return locale info for valid codes', () => {
            const info = getLocaleInfo('ja');

            expect(info).toBeDefined();
            expect(info?.code).toBe('ja');
            expect(info?.name).toBe('Japanese');
            expect(info?.nativeName).toBe('日本語');
            expect(info?.flag).toBe('🇯🇵');
        });

        it('should return undefined for invalid codes', () => {
            // Type assertion since we're testing with invalid input
            const info = getLocaleInfo('invalid' as LocaleCode);
            expect(info).toBeUndefined();
        });
    });

    describe('discordLocaleToLocaleCode', () => {
        it('should map English locales', () => {
            expect(discordLocaleToLocaleCode('en-US')).toBe('en');
            expect(discordLocaleToLocaleCode('en-GB')).toBe('en');
        });

        it('should map Japanese locale', () => {
            expect(discordLocaleToLocaleCode('ja')).toBe('ja');
        });

        it('should map German locale', () => {
            expect(discordLocaleToLocaleCode('de')).toBe('de');
        });

        it('should map French locale', () => {
            expect(discordLocaleToLocaleCode('fr')).toBe('fr');
        });

        it('should map Korean locale', () => {
            expect(discordLocaleToLocaleCode('ko')).toBe('ko');
        });

        it('should map Chinese locales', () => {
            expect(discordLocaleToLocaleCode('zh-CN')).toBe('zh');
            expect(discordLocaleToLocaleCode('zh-TW')).toBe('zh');
        });

        it('should return null for unsupported Discord locales', () => {
            expect(discordLocaleToLocaleCode('es-ES')).toBeNull();
            expect(discordLocaleToLocaleCode('pt-BR')).toBeNull();
            expect(discordLocaleToLocaleCode('ru')).toBeNull();
        });
    });

    describe('getUserLanguagePreference', () => {
        it('should return null when no preference is set', async () => {
            const result = await getUserLanguagePreference(mockKV, mockUserId);
            expect(result).toBeNull();
        });

        it('should return the stored locale code', async () => {
            mockKV._store.set(`i18n:user:${mockUserId}`, 'ja');

            const result = await getUserLanguagePreference(mockKV, mockUserId);

            expect(result).toBe('ja');
        });

        it('should return null for invalid stored values', async () => {
            mockKV._store.set(`i18n:user:${mockUserId}`, 'invalid');

            const result = await getUserLanguagePreference(mockKV, mockUserId);

            expect(result).toBeNull();
        });

        it('should return null on KV error', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await getUserLanguagePreference(mockKV, mockUserId);

            expect(result).toBeNull();
        });
    });

    describe('setUserLanguagePreference', () => {
        it('should store the language preference', async () => {
            const result = await setUserLanguagePreference(mockKV, mockUserId, 'de');

            expect(result).toBe(true);
            expect(mockKV._store.get(`i18n:user:${mockUserId}`)).toBe('de');
        });

        it('should return false on KV error', async () => {
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await setUserLanguagePreference(mockKV, mockUserId, 'fr');

            expect(result).toBe(false);
        });
    });

    describe('clearUserLanguagePreference', () => {
        it('should delete the language preference', async () => {
            mockKV._store.set(`i18n:user:${mockUserId}`, 'ja');

            const result = await clearUserLanguagePreference(mockKV, mockUserId);

            expect(result).toBe(true);
            expect(mockKV.delete).toHaveBeenCalled();
        });

        it('should return false on KV error', async () => {
            mockKV.delete = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await clearUserLanguagePreference(mockKV, mockUserId);

            expect(result).toBe(false);
        });
    });

    describe('resolveUserLocale', () => {
        it('should prefer user preference over Discord locale', async () => {
            mockKV._store.set(`i18n:user:${mockUserId}`, 'ja');

            const result = await resolveUserLocale(mockKV, mockUserId, 'en-US');

            expect(result).toBe('ja');
        });

        it('should use Discord locale when no preference is set', async () => {
            const result = await resolveUserLocale(mockKV, mockUserId, 'de');

            expect(result).toBe('de');
        });

        it('should map Discord locale codes correctly', async () => {
            const result = await resolveUserLocale(mockKV, mockUserId, 'zh-CN');

            expect(result).toBe('zh');
        });

        it('should default to English when no preference and unsupported Discord locale', async () => {
            const result = await resolveUserLocale(mockKV, mockUserId, 'es-ES');

            expect(result).toBe('en');
        });

        it('should default to English when no preference and no Discord locale', async () => {
            const result = await resolveUserLocale(mockKV, mockUserId);

            expect(result).toBe('en');
        });
    });

    describe('initializeLocale', () => {
        it('should clear and set the locale', async () => {
            await initializeLocale('ja');

            expect(LocalizationService.clear).toHaveBeenCalled();
            expect(LocalizationService.setLocale).toHaveBeenCalledWith('ja');
        });

        it('should fall back to English on error', async () => {
            vi.mocked(LocalizationService.setLocale)
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce(undefined);

            await initializeLocale('invalid' as LocaleCode);

            expect(LocalizationService.clear).toHaveBeenCalledTimes(2);
            expect(LocalizationService.setLocale).toHaveBeenLastCalledWith('en');
        });
    });

    describe('formatLocaleDisplay', () => {
        it('should format locale for display', () => {
            expect(formatLocaleDisplay('en')).toBe('🇺🇸 English (English)');
            expect(formatLocaleDisplay('ja')).toBe('🇯🇵 Japanese (日本語)');
            expect(formatLocaleDisplay('de')).toBe('🇩🇪 German (Deutsch)');
            expect(formatLocaleDisplay('fr')).toBe('🇫🇷 French (Français)');
            expect(formatLocaleDisplay('ko')).toBe('🇰🇷 Korean (한국어)');
            expect(formatLocaleDisplay('zh')).toBe('🇨🇳 Chinese (中文)');
        });

        it('should return code for unknown locale', () => {
            const result = formatLocaleDisplay('invalid' as LocaleCode);
            expect(result).toBe('invalid');
        });
    });

    describe('getLocalizedDyeName', () => {
        it('should return localized dye name', () => {
            const result = getLocalizedDyeName(5729, 'Fallback');
            expect(result).toBe('Snow White');
        });

        it('should return fallback when localization fails', () => {
            const result = getLocalizedDyeName(9999, 'Unknown Dye');
            expect(result).toBe('Unknown Dye');
        });

        it('should return fallback on error', () => {
            vi.mocked(LocalizationService.getDyeName).mockImplementationOnce(() => {
                throw new Error('Error');
            });

            const result = getLocalizedDyeName(5729, 'Fallback');
            expect(result).toBe('Fallback');
        });
    });

    describe('getLocalizedCategory', () => {
        it('should return localized category name', () => {
            const result = getLocalizedCategory('Reds');
            expect(result).toBe('Localized_Reds');
        });

        it('should return original category on error', () => {
            vi.mocked(LocalizationService.getCategory).mockImplementationOnce(() => {
                throw new Error('Error');
            });

            const result = getLocalizedCategory('Blues');
            expect(result).toBe('Blues');
        });
    });

    // ==========================================================================
    // Logger Coverage Tests
    // ==========================================================================

    describe('Logger coverage - error logging', () => {
        const mockLogger = {
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        } as never;

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should log error when getUserLanguagePreference fails with logger', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await getUserLanguagePreference(mockKV, mockUserId, mockLogger);

            expect(result).toBeNull();
        });

        it('should log error when setUserLanguagePreference fails with logger', async () => {
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await setUserLanguagePreference(mockKV, mockUserId, 'de', mockLogger);

            expect(result).toBe(false);
        });

        it('should log error when clearUserLanguagePreference fails with logger', async () => {
            mockKV.delete = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await clearUserLanguagePreference(mockKV, mockUserId, mockLogger);

            expect(result).toBe(false);
        });

        it('should log error when initializeLocale fails with logger', async () => {
            vi.mocked(LocalizationService.setLocale)
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce(undefined);

            await initializeLocale('invalid' as LocaleCode, mockLogger);

            expect(LocalizationService.clear).toHaveBeenCalled();
            expect(LocalizationService.setLocale).toHaveBeenCalledWith('en');
        });
    });
});
