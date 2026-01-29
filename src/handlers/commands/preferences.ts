/**
 * /preferences Command Handler (V4)
 *
 * Unified settings management for user preferences.
 *
 * Subcommands:
 * - show: Display current preferences
 * - set: Set a preference value
 * - reset: Reset a preference to default
 *
 * @module handlers/commands/preferences
 */

import type { ExtendedLogger } from '@xivdyetools/logger';
import { messageResponse, errorEmbed, hexToDiscordColor } from '../../utils/response.js';
import {
  getUserPreferences,
  setPreference,
  resetPreference,
  getDefaultValue,
  getAffectedCommands,
} from '../../services/preferences.js';
import {
  PREFERENCE_DEFAULTS,
  BLENDING_MODES,
  MATCHING_METHODS,
  CLANS_BY_RACE,
  VALID_CLANS,
  type PreferenceKey,
  type UserPreferences,
} from '../../types/preferences.js';
import { createUserTranslator, type Translator } from '../../services/bot-i18n.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// ============================================================================
// Constants
// ============================================================================

/** Embed color for preferences display (Discord blurple) */
const PREFS_COLOR = 0x5865f2;

/** Preference display order */
const PREFERENCE_ORDER: PreferenceKey[] = [
  'language',
  'blending',
  'matching',
  'count',
  'clan',
  'gender',
  'world',
  'market',
];

/** Human-readable labels for preference keys */
const PREFERENCE_LABELS: Record<PreferenceKey, string> = {
  language: 'Language',
  blending: 'Blending Mode',
  matching: 'Matching Method',
  count: 'Result Count',
  clan: 'Default Clan',
  gender: 'Default Gender',
  world: 'Market World',
  market: 'Show Prices',
};

/** Emojis for preference categories */
const PREFERENCE_EMOJIS: Record<PreferenceKey, string> = {
  language: '🌐',
  blending: '🎨',
  matching: '🔍',
  count: '📊',
  clan: '👤',
  gender: '⚧️',
  world: '🌍',
  market: '💰',
};

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Handles the /preferences command
 *
 * Routes to appropriate subcommand handler based on interaction data.
 */
export async function handlePreferencesCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Get subcommand from options
  const options = interaction.data?.options || [];
  const subcommandOption = options[0];

  if (!subcommandOption) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), 'No subcommand provided')],
      flags: 64,
    });
  }

  const subcommand = subcommandOption.name;

  switch (subcommand) {
    case 'show':
      return handleShowSubcommand(env, userId, t, logger);

    case 'set':
      return handleSetSubcommand(env, userId, subcommandOption.options || [], t, logger);

    case 'reset':
      return handleResetSubcommand(env, userId, subcommandOption.options || [], t, logger);

    default:
      return messageResponse({
        embeds: [errorEmbed(t.t('common.error'), `Unknown subcommand: ${subcommand}`)],
        flags: 64,
      });
  }
}

// ============================================================================
// Show Subcommand
// ============================================================================

/**
 * Handles /preferences show
 *
 * Displays all current preferences with their values and defaults.
 */
async function handleShowSubcommand(
  env: Env,
  userId: string,
  t: Translator,
  logger?: ExtendedLogger
): Promise<Response> {
  const prefs = await getUserPreferences(env.KV, userId, logger);

  // Build fields for each preference
  const fields = PREFERENCE_ORDER.map((key) => {
    const emoji = PREFERENCE_EMOJIS[key];
    const label = PREFERENCE_LABELS[key];
    const currentValue = prefs[key];
    const defaultValue = getDefaultValue(key);

    // Format the display value
    let displayValue: string;
    if (currentValue !== undefined) {
      displayValue = formatPreferenceValue(key, currentValue);
    } else if (defaultValue !== undefined) {
      displayValue = `*${formatPreferenceValue(key, defaultValue)}* (default)`;
    } else {
      displayValue = '*Not set*';
    }

    return {
      name: `${emoji} ${label}`,
      value: displayValue,
      inline: true,
    };
  });

  // Add last updated timestamp if available
  const footer = prefs.updatedAt
    ? { text: `Last updated: ${new Date(prefs.updatedAt).toLocaleString()}` }
    : { text: 'Use /preferences set to customize (e.g., /preferences set language:en)' };

  return messageResponse({
    embeds: [
      {
        title: '⚙️ Your Preferences',
        description: 'These settings affect how commands work for you.\nParameters you provide always override these defaults.',
        color: PREFS_COLOR,
        fields,
        footer,
      },
    ],
  });
}

// ============================================================================
// Set Subcommand
// ============================================================================

/**
 * Handles /preferences set [options...]
 *
 * Sets one or more preference values. Each preference is an optional parameter.
 * Users can set multiple preferences in a single command:
 *   /preferences set language:en blending:oklab market:true
 */
async function handleSetSubcommand(
  env: Env,
  userId: string,
  options: Array<{ name: string; value?: string | number | boolean }>,
  t: Translator,
  logger?: ExtendedLogger
): Promise<Response> {
  // Check if any options were provided
  if (options.length === 0) {
    return messageResponse({
      embeds: [
        errorEmbed(
          t.t('common.error'),
          'Please provide at least one preference to set.\n\nExample: `/preferences set language:en blending:oklab`'
        ),
      ],
      flags: 64,
    });
  }

  // Process each provided option
  const updates: Array<{ key: PreferenceKey; value: unknown; success: boolean; reason?: string }> = [];
  const affectedCommandsSet = new Set<string>();

  for (const opt of options) {
    const key = opt.name as PreferenceKey;
    const value = opt.value;

    // Skip if no value provided
    if (value === undefined) continue;

    // Validate key is a known preference
    if (!PREFERENCE_ORDER.includes(key)) continue;

    // Attempt to set the preference
    const result = await setPreference(env.KV, userId, key, value, logger);
    updates.push({ key, value, success: result.success, reason: result.reason });

    // Collect affected commands for successful updates
    if (result.success) {
      getAffectedCommands(key).forEach((cmd) => affectedCommandsSet.add(cmd));
    }
  }

  // Check if any updates were attempted
  if (updates.length === 0) {
    return messageResponse({
      embeds: [
        errorEmbed(
          t.t('common.error'),
          'No valid preferences were provided. Use options like `language`, `blending`, `matching`, etc.'
        ),
      ],
      flags: 64,
    });
  }

  // Separate successes and failures
  const successes = updates.filter((u) => u.success);
  const failures = updates.filter((u) => !u.success);

  // Build response
  if (successes.length === 0) {
    // All failed
    const errorLines = failures.map((f) => {
      const emoji = PREFERENCE_EMOJIS[f.key];
      const label = PREFERENCE_LABELS[f.key];
      const reason = getValidationErrorMessage(f.key, f.reason);
      return `${emoji} **${label}**: ${reason}`;
    });

    return messageResponse({
      embeds: [
        errorEmbed(t.t('common.error'), errorLines.join('\n\n')),
      ],
      flags: 64,
    });
  }

  // Build success description
  const successLines = successes.map((s) => {
    const emoji = PREFERENCE_EMOJIS[s.key];
    const label = PREFERENCE_LABELS[s.key];
    const displayValue = formatPreferenceValue(s.key, s.value);
    return `${emoji} **${label}** → **${displayValue}**`;
  });

  // Build response embed
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  // Add affected commands field
  if (affectedCommandsSet.size > 0) {
    fields.push({
      name: '📋 Affects',
      value: Array.from(affectedCommandsSet).join(', '),
      inline: false,
    });
  }

  // Add failures field if any
  if (failures.length > 0) {
    const failureLines = failures.map((f) => {
      const emoji = PREFERENCE_EMOJIS[f.key];
      const label = PREFERENCE_LABELS[f.key];
      return `${emoji} ${label}: ${f.reason || 'Invalid value'}`;
    });
    fields.push({
      name: '⚠️ Failed to Update',
      value: failureLines.join('\n'),
      inline: false,
    });
  }

  const title = successes.length === 1
    ? '✅ Preference Updated'
    : `✅ ${successes.length} Preferences Updated`;

  return messageResponse({
    embeds: [
      {
        title,
        description: successLines.join('\n'),
        color: failures.length > 0 ? 0xfee75c : 0x57f287, // Yellow if partial, green if all succeeded
        fields,
        footer: {
          text: 'Command parameters will override these settings',
        },
      },
    ],
  });
}

// ============================================================================
// Reset Subcommand
// ============================================================================

/**
 * Handles /preferences reset [key]
 *
 * Resets a single preference to default, or all preferences if no key provided.
 */
async function handleResetSubcommand(
  env: Env,
  userId: string,
  options: Array<{ name: string; value?: string | number | boolean }>,
  t: Translator,
  logger?: ExtendedLogger
): Promise<Response> {
  const keyOption = options.find((opt) => opt.name === 'key');
  const key = keyOption?.value as PreferenceKey | undefined;

  // Validate key if provided
  if (key && !PREFERENCE_ORDER.includes(key)) {
    return messageResponse({
      embeds: [
        errorEmbed(
          t.t('common.error'),
          `Invalid preference key: \`${key}\`\n\nValid keys: ${PREFERENCE_ORDER.map((k) => `\`${k}\``).join(', ')}`
        ),
      ],
      flags: 64,
    });
  }

  // Reset the preference(s)
  const success = await resetPreference(env.KV, userId, key, logger);

  if (!success) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), 'Failed to reset preference(s). Please try again.')],
      flags: 64,
    });
  }

  // Success response
  if (key) {
    const emoji = PREFERENCE_EMOJIS[key];
    const label = PREFERENCE_LABELS[key];
    const defaultValue = getDefaultValue(key);
    const defaultDisplay = defaultValue !== undefined
      ? formatPreferenceValue(key, defaultValue)
      : 'Not set';

    return messageResponse({
      embeds: [
        {
          title: '🔄 Preference Reset',
          description: `**${emoji} ${label}** reset to default: **${defaultDisplay}**`,
          color: 0xfee75c, // Yellow
        },
      ],
    });
  } else {
    return messageResponse({
      embeds: [
        {
          title: '🔄 All Preferences Reset',
          description: 'All your preferences have been reset to system defaults.',
          color: 0xfee75c, // Yellow
          footer: {
            text: 'Use /preferences show to see current values',
          },
        },
      ],
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a preference value for display
 */
function formatPreferenceValue(key: PreferenceKey, value: unknown): string {
  switch (key) {
    case 'language':
      return getLanguageDisplay(value as string);

    case 'blending':
      const blendMode = BLENDING_MODES.find((m) => m.value === value);
      return blendMode ? `${blendMode.name}` : String(value);

    case 'matching':
      const matchMethod = MATCHING_METHODS.find((m) => m.value === value);
      return matchMethod ? `${matchMethod.name}` : String(value);

    case 'count':
      return `${value} results`;

    case 'clan':
      return String(value);

    case 'gender':
      return value === 'male' ? 'Male ♂️' : 'Female ♀️';

    case 'world':
      return String(value);

    case 'market':
      return value === true || value === 'on' || value === 'true' ? 'Yes' : 'No';

    default:
      return String(value);
  }
}

/**
 * Get display name for a language code
 */
function getLanguageDisplay(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    ja: '日本語 (Japanese)',
    de: 'Deutsch (German)',
    fr: 'Français (French)',
    ko: '한국어 (Korean)',
    zh: '中文 (Chinese)',
  };
  return languages[code] ?? code;
}

/**
 * Get a human-readable error message for validation failures
 */
function getValidationErrorMessage(key: PreferenceKey, reason?: string): string {
  switch (reason) {
    case 'invalidLanguage':
      return 'Invalid language. Valid options: `en`, `ja`, `de`, `fr`, `ko`, `zh`';

    case 'invalidBlendingMode':
      return `Invalid blending mode. Valid options:\n${BLENDING_MODES.map((m) => `• \`${m.value}\` - ${m.description}`).join('\n')}`;

    case 'invalidMatchingMethod':
      return `Invalid matching method. Valid options:\n${MATCHING_METHODS.map((m) => `• \`${m.value}\` - ${m.description}`).join('\n')}`;

    case 'invalidCount':
      return 'Invalid count. Must be a number between 1 and 10.';

    case 'invalidClan':
      return `Invalid clan. Valid clans:\n${Object.entries(CLANS_BY_RACE).map(([race, clans]) => `• **${race}**: ${clans.join(', ')}`).join('\n')}`;

    case 'invalidGender':
      return 'Invalid gender. Valid options: `male`, `female`';

    case 'invalidWorld':
      return 'Invalid world. Please enter a valid FFXIV world or datacenter name.';

    case 'invalidMarket':
      return 'Invalid value. Use `on`/`off` or `true`/`false`.';

    case 'error':
    default:
      return 'An error occurred while saving the preference. Please try again.';
  }
}
