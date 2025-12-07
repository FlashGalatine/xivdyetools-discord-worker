/**
 * I18n Service
 *
 * Manages user language preferences using Cloudflare KV.
 * Integrates with xivdyetools-core LocalizationService for translations.
 *
 * @module services/i18n
 */

import { LocalizationService } from 'xivdyetools-core';

/**
 * Supported locale codes
 */
export type LocaleCode = 'en' | 'ja' | 'de' | 'fr' | 'ko' | 'zh';

/**
 * Locale display information
 */
export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  nativeName: string;
  flag: string;
}

/**
 * All supported locales with display info
 */
export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
];

/** KV key prefix for user language preferences */
const KEY_PREFIX = 'i18n:user:';

/**
 * Validates if a string is a valid locale code
 */
export function isValidLocale(code: string): code is LocaleCode {
  return ['en', 'ja', 'de', 'fr', 'ko', 'zh'].includes(code);
}

/**
 * Get locale info by code
 */
export function getLocaleInfo(code: LocaleCode): LocaleInfo | undefined {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}

/**
 * Maps Discord locale codes to our supported locales
 *
 * @see https://discord.com/developers/docs/reference#locales
 */
export function discordLocaleToLocaleCode(discordLocale: string): LocaleCode | null {
  const mapping: Record<string, LocaleCode> = {
    'en-US': 'en',
    'en-GB': 'en',
    'ja': 'ja',
    'de': 'de',
    'fr': 'fr',
    'ko': 'ko',
    'zh-CN': 'zh',
    'zh-TW': 'zh',
  };
  return mapping[discordLocale] ?? null;
}

/**
 * Get a user's language preference from KV
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @returns Locale code or null if not set
 */
export async function getUserLanguagePreference(
  kv: KVNamespace,
  userId: string
): Promise<LocaleCode | null> {
  try {
    const value = await kv.get(`${KEY_PREFIX}${userId}`);
    if (value && isValidLocale(value)) {
      return value;
    }
    return null;
  } catch (error) {
    console.error('Failed to get user language preference:', error);
    return null;
  }
}

/**
 * Set a user's language preference in KV
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param locale - Locale code to set
 */
export async function setUserLanguagePreference(
  kv: KVNamespace,
  userId: string,
  locale: LocaleCode
): Promise<boolean> {
  try {
    await kv.put(`${KEY_PREFIX}${userId}`, locale);
    return true;
  } catch (error) {
    console.error('Failed to set user language preference:', error);
    return false;
  }
}

/**
 * Clear a user's language preference from KV
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 */
export async function clearUserLanguagePreference(
  kv: KVNamespace,
  userId: string
): Promise<boolean> {
  try {
    await kv.delete(`${KEY_PREFIX}${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to clear user language preference:', error);
    return false;
  }
}

/**
 * Resolve the effective locale for a user
 *
 * Priority:
 * 1. User's explicit preference (KV)
 * 2. Discord client locale (interaction.locale)
 * 3. Default (English)
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param discordLocale - Discord's detected locale
 * @returns Effective locale code
 */
export async function resolveUserLocale(
  kv: KVNamespace,
  userId: string,
  discordLocale?: string
): Promise<LocaleCode> {
  // 1. Check user preference
  const preference = await getUserLanguagePreference(kv, userId);
  if (preference) {
    return preference;
  }

  // 2. Try Discord locale
  if (discordLocale) {
    const mapped = discordLocaleToLocaleCode(discordLocale);
    if (mapped) {
      return mapped;
    }
  }

  // 3. Default to English
  return 'en';
}

/**
 * Initialize the LocalizationService with a locale
 * Should be called at the start of command handling if translations are needed
 *
 * Note: We clear the singleton's state before setting the locale to ensure
 * clean language switching. This prevents stale locale state from persisting
 * across requests in Cloudflare Workers isolates.
 */
export async function initializeLocale(locale: LocaleCode): Promise<void> {
  try {
    // Clear previous state to ensure clean locale switching
    LocalizationService.clear();
    await LocalizationService.setLocale(locale);
  } catch (error) {
    console.error('Failed to initialize locale:', error);
    // Fall back to English
    LocalizationService.clear();
    await LocalizationService.setLocale('en');
  }
}

/**
 * Format locale for display
 */
export function formatLocaleDisplay(locale: LocaleCode): string {
  const info = getLocaleInfo(locale);
  if (!info) return locale;
  return `${info.flag} ${info.name} (${info.nativeName})`;
}

/**
 * Get localized dye name from xivdyetools-core
 *
 * @param itemID - The dye's item ID (e.g., 5729)
 * @param fallbackName - Fallback name if localization fails
 * @returns Localized name or fallback
 */
export function getLocalizedDyeName(itemID: number, fallbackName: string): string {
  try {
    const localizedName = LocalizationService.getDyeName(itemID);
    return localizedName ?? fallbackName;
  } catch {
    return fallbackName;
  }
}

/**
 * Get localized category name from xivdyetools-core
 *
 * @param category - The category key (e.g., "Reds", "Blues")
 * @returns Localized category name
 */
export function getLocalizedCategory(category: string): string {
  try {
    return LocalizationService.getCategory(category);
  } catch {
    return category;
  }
}
