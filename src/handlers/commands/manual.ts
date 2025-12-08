/**
 * /manual Command Handler
 *
 * Displays comprehensive help documentation for all bot commands.
 * Organizes commands into logical categories with descriptions.
 * Sends as ephemeral message (only visible to the user).
 */

import type { Env, DiscordInteraction } from '../../types/env.js';
import { createUserTranslator, type Translator } from '../../services/bot-i18n.js';

// Discord embed color constants
const COLORS = {
  blurple: 0x5865f2,
  green: 0x57f287,
  yellow: 0xfee75c,
  fuchsia: 0xeb459e,
  red: 0xed4245,
  blue: 0x3498db,
} as const;

/**
 * Build embeds using translated strings
 */
function buildEmbeds(t: Translator) {
  return [
    // Overview
    {
      title: `📖 ${t.t('manual.title')}`,
      description: [
        t.t('manual.welcome'),
        '',
        t.t('manual.commandsIntro'),
        t.t('manual.autocompleteNote'),
      ].join('\n'),
      color: COLORS.blurple,
    },

    // Color Matching Tools
    {
      title: `🎨 ${t.t('manual.colorMatching')}`,
      color: COLORS.green,
      fields: [
        {
          name: t.t('manual.match.name'),
          value: t.t('manual.match.description'),
          inline: false,
        },
        {
          name: t.t('manual.harmony.name'),
          value: t.t('manual.harmony.description'),
          inline: false,
        },
        {
          name: t.t('manual.mixer.name'),
          value: t.t('manual.mixer.description'),
          inline: false,
        },
      ],
    },

    // Dye Information
    {
      title: `🧪 ${t.t('manual.dyeInformation')}`,
      color: COLORS.yellow,
      fields: [
        {
          name: t.t('manual.dyeSearch.name'),
          value: t.t('manual.dyeSearch.description'),
          inline: false,
        },
        {
          name: t.t('manual.dyeInfo.name'),
          value: t.t('manual.dyeInfo.description'),
          inline: false,
        },
        {
          name: t.t('manual.dyeList.name'),
          value: t.t('manual.dyeList.description'),
          inline: false,
        },
        {
          name: t.t('manual.dyeRandom.name'),
          value: t.t('manual.dyeRandom.description'),
          inline: false,
        },
      ],
    },

    // Bot Information
    {
      title: `ℹ️ ${t.t('manual.botInformation')}`,
      color: COLORS.fuchsia,
      fields: [
        {
          name: t.t('manual.about.name'),
          value: t.t('manual.about.description'),
          inline: true,
        },
        {
          name: t.t('manual.manualCmd.name'),
          value: t.t('manual.manualCmd.description'),
          inline: true,
        },
      ],
    },

    // Tips & Resources
    {
      title: `💡 ${t.t('manual.tipsResources')}`,
      color: COLORS.blue,
      description: [
        t.t('manual.tips.autocomplete'),
        '',
        t.t('manual.tips.hexColors'),
        '',
        t.t('manual.tips.dyeNames'),
        '',
        t.t('manual.tips.facewearExcluded'),
        '',
        t.t('manual.tips.links'),
        '• [Web App](https://xivdyetools.projectgalatine.com/)',
        '• [Support Server](https://discord.gg/5VUSKTZCe5)',
        '• [Patreon](https://patreon.com/ProjectGalatine)',
      ].join('\n'),
    },
  ];
}

/**
 * Handles the /manual command
 */
export async function handleManualCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';

  // Get translator for user's locale
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Build localized embeds
  const embeds = buildEmbeds(t);

  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      embeds,
      flags: 64, // Ephemeral - only visible to user
    },
  });
}
