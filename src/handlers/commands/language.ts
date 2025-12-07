/**
 * /language Command Handler
 *
 * Manages user language preferences for bot responses.
 * Preferences are stored in Cloudflare KV and persist across sessions.
 */

import { ephemeralResponse, successEmbed, errorEmbed, infoEmbed } from '../../utils/response.js';
import {
  type LocaleCode,
  SUPPORTED_LOCALES,
  isValidLocale,
  getLocaleInfo,
  getUserLanguagePreference,
  setUserLanguagePreference,
  clearUserLanguagePreference,
  discordLocaleToLocaleCode,
} from '../../services/i18n.js';
import { createUserTranslator, type Translator } from '../../services/bot-i18n.js';
import type { Env } from '../../types/env.js';

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  locale?: string; // Discord's detected user locale
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  user?: {
    id: string;
    username: string;
  };
  data?: {
    options?: Array<{
      name: string;
      type: number;
      value?: string | number | boolean;
      options?: Array<{
        name: string;
        type: number;
        value?: string | number | boolean;
      }>;
    }>;
  };
}

/**
 * Handles the /language command
 */
export async function handleLanguageCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!userId) {
    return ephemeralResponse('Could not identify user.');
  }

  // Get translator for user's current locale
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Extract subcommand
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1); // SUB_COMMAND type

  if (!subcommand) {
    return ephemeralResponse('Please specify a subcommand: `set`, `show`, or `reset`.');
  }

  switch (subcommand.name) {
    case 'set':
      return handleSetLanguage(env, userId, t, subcommand.options);

    case 'show':
      return handleShowLanguage(interaction, env, userId, t);

    case 'reset':
      return handleResetLanguage(env, userId, t);

    default:
      return ephemeralResponse(`Unknown subcommand: ${subcommand.name}`);
  }
}

/**
 * Handle /language set <locale>
 */
async function handleSetLanguage(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const localeOption = options?.find((opt) => opt.name === 'locale');
  const locale = localeOption?.value as string | undefined;

  if (!locale) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('language.missingLanguage'))],
        flags: 64,
      },
    });
  }

  if (!isValidLocale(locale)) {
    const validLocales = SUPPORTED_LOCALES.map((l) => `\`${l.code}\``).join(', ');
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            t.t('common.error'),
            t.t('language.invalidLanguage', { locale, validList: validLocales })
          ),
        ],
        flags: 64,
      },
    });
  }

  // Save preference to KV
  const success = await setUserLanguagePreference(env.KV, userId, locale);

  if (!success) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.failedToSave'))],
        flags: 64,
      },
    });
  }

  const localeInfo = getLocaleInfo(locale);
  const displayName = localeInfo
    ? `${localeInfo.flag} ${localeInfo.name} (${localeInfo.nativeName})`
    : locale;

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(
          t.t('common.success'),
          t.t('language.updated', { language: displayName }) +
            '\n\n' +
            t.t('language.updateNote')
        ),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /language show
 */
async function handleShowLanguage(
  interaction: DiscordInteraction,
  env: Env,
  userId: string,
  t: Translator
): Promise<Response> {
  // Get user's explicit preference
  const preference = await getUserLanguagePreference(env.KV, userId);

  // Get Discord's detected locale
  const discordLocale = interaction.locale;
  const mappedDiscord = discordLocale ? discordLocaleToLocaleCode(discordLocale) : null;

  // Build status message
  const lines: string[] = [];

  if (preference) {
    const prefInfo = getLocaleInfo(preference);
    const prefDisplay = prefInfo
      ? `${prefInfo.flag} ${prefInfo.name} (${prefInfo.nativeName})`
      : preference;
    lines.push(`**${t.t('language.yourPreference')}:** ${prefDisplay}`);
  } else {
    lines.push(`**${t.t('language.yourPreference')}:** ${t.t('language.notSet')}`);
  }

  if (discordLocale) {
    const discordDisplay = mappedDiscord
      ? (() => {
          const info = getLocaleInfo(mappedDiscord);
          return info ? `${info.flag} ${info.name} (${info.nativeName})` : mappedDiscord;
        })()
      : `${discordLocale} (${t.t('language.unsupported')})`;
    lines.push(`**${t.t('language.discordLocale')}:** ${discordDisplay}`);
  }

  // Effective locale
  const effective = preference ?? mappedDiscord ?? 'en';
  const effectiveInfo = getLocaleInfo(effective as LocaleCode);
  const effectiveDisplay = effectiveInfo
    ? `${effectiveInfo.flag} ${effectiveInfo.name} (${effectiveInfo.nativeName})`
    : effective;
  lines.push(`\n**${t.t('language.effectiveLanguage')}:** ${effectiveDisplay}`);

  // Add supported languages list
  lines.push(`\n**${t.t('language.supportedLanguages')}:**`);
  for (const locale of SUPPORTED_LOCALES) {
    const marker = locale.code === effective ? ' ✓' : '';
    lines.push(`${locale.flag} \`${locale.code}\` - ${locale.name} (${locale.nativeName})${marker}`);
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [infoEmbed(t.t('language.title'), lines.join('\n'))],
      flags: 64,
    },
  });
}

/**
 * Handle /language reset
 */
async function handleResetLanguage(
  env: Env,
  userId: string,
  t: Translator
): Promise<Response> {
  const success = await clearUserLanguagePreference(env.KV, userId);

  if (!success) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.failedToReset'))],
        flags: 64,
      },
    });
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(
          t.t('common.success'),
          t.t('language.reset') + '\n\n' + t.t('language.resetNote')
        ),
      ],
      flags: 64,
    },
  });
}
