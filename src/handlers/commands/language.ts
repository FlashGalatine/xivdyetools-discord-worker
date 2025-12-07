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
  formatLocaleDisplay,
} from '../../services/i18n.js';
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

  // Extract subcommand
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1); // SUB_COMMAND type

  if (!subcommand) {
    return ephemeralResponse('Please specify a subcommand: `set`, `show`, or `reset`.');
  }

  switch (subcommand.name) {
    case 'set':
      return handleSetLanguage(interaction, env, userId, subcommand.options);

    case 'show':
      return handleShowLanguage(interaction, env, userId);

    case 'reset':
      return handleResetLanguage(env, userId);

    default:
      return ephemeralResponse(`Unknown subcommand: ${subcommand.name}`);
  }
}

/**
 * Handle /language set <locale>
 */
async function handleSetLanguage(
  interaction: DiscordInteraction,
  env: Env,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const localeOption = options?.find((opt) => opt.name === 'locale');
  const locale = localeOption?.value as string | undefined;

  if (!locale) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed('Missing Language', 'Please specify a language to set.')],
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
            'Invalid Language',
            `"${locale}" is not a supported language.\n\nSupported languages: ${validLocales}`
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
        embeds: [
          errorEmbed(
            'Failed to Save',
            'Could not save your language preference. Please try again later.'
          ),
        ],
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
          'Language Updated',
          `Your language preference has been set to **${displayName}**.\n\n` +
            'Dye names and bot messages will now use this language when available.'
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
  userId: string
): Promise<Response> {
  // Get user's explicit preference
  const preference = await getUserLanguagePreference(env.KV, userId);

  // Get Discord's detected locale
  const discordLocale = interaction.locale;
  const mappedDiscord = discordLocale ? discordLocaleToLocaleCode(discordLocale) : null;

  // Build status message
  const lines: string[] = [];

  if (preference) {
    lines.push(`**Your preference:** ${formatLocaleDisplay(preference)}`);
  } else {
    lines.push('**Your preference:** Not set');
  }

  if (discordLocale) {
    const discordDisplay = mappedDiscord
      ? formatLocaleDisplay(mappedDiscord)
      : `${discordLocale} (unsupported)`;
    lines.push(`**Discord locale:** ${discordDisplay}`);
  }

  // Effective locale
  const effective = preference ?? mappedDiscord ?? 'en';
  lines.push(`\n**Effective language:** ${formatLocaleDisplay(effective as LocaleCode)}`);

  // Add supported languages list
  lines.push('\n**Supported languages:**');
  for (const locale of SUPPORTED_LOCALES) {
    const marker = locale.code === effective ? ' ✓' : '';
    lines.push(`${locale.flag} \`${locale.code}\` - ${locale.name} (${locale.nativeName})${marker}`);
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [infoEmbed('Language Settings', lines.join('\n'))],
      flags: 64,
    },
  });
}

/**
 * Handle /language reset
 */
async function handleResetLanguage(env: Env, userId: string): Promise<Response> {
  const success = await clearUserLanguagePreference(env.KV, userId);

  if (!success) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            'Failed to Reset',
            'Could not clear your language preference. Please try again later.'
          ),
        ],
        flags: 64,
      },
    });
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(
          'Language Reset',
          'Your language preference has been cleared.\n\n' +
            "The bot will now use your Discord client's language setting (if supported) or default to English."
        ),
      ],
      flags: 64,
    },
  });
}
