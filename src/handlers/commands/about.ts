/**
 * /about Command Handler
 *
 * Displays bot information including:
 * - Dynamic version from package.json
 * - Full list of available commands
 * - Links to resources
 */

import type { Env, DiscordInteraction } from '../../types/env.js';
import { createUserTranslator } from '../../services/bot-i18n.js';
import packageJson from '../../../package.json' with { type: 'json' };

// Discord embed color constants
const COLORS = {
  blurple: 0x5865f2,
} as const;

// All available commands organized by category
const COMMAND_CATEGORIES = {
  colorTools: {
    emoji: '🎨',
    commands: [
      { name: '/harmony', desc: 'Generate color harmonies (complementary, triadic, etc.)' },
      { name: '/match', desc: 'Find closest FFXIV dye to a hex color' },
      { name: '/match_image', desc: 'Extract colors from an image and match to dyes' },
      { name: '/mixer', desc: 'Create color gradients between two colors' },
    ],
  },
  dyeDatabase: {
    emoji: '📚',
    commands: [
      { name: '/dye search', desc: 'Search dyes by name' },
      { name: '/dye info', desc: 'Get detailed dye information' },
      { name: '/dye list', desc: 'List dyes by category' },
      { name: '/dye random', desc: 'Get random dye suggestions' },
    ],
  },
  analysis: {
    emoji: '🔍',
    commands: [
      { name: '/comparison', desc: 'Compare 2-4 dyes side by side' },
      { name: '/accessibility', desc: 'Colorblindness simulation & contrast' },
    ],
  },
  userData: {
    emoji: '💾',
    commands: [
      { name: '/favorites', desc: 'Manage your favorite dyes' },
      { name: '/collection', desc: 'Create custom dye collections' },
    ],
  },
  community: {
    emoji: '🌐',
    commands: [
      { name: '/preset', desc: 'Browse, submit & vote on community presets' },
    ],
  },
  utility: {
    emoji: '⚙️',
    commands: [
      { name: '/language', desc: 'Set your preferred language' },
      { name: '/manual', desc: 'Show help guide' },
      { name: '/about', desc: 'Bot information (this command)' },
      { name: '/stats', desc: 'Usage statistics (authorized only)' },
    ],
  },
} as const;

/**
 * Build the command list as a formatted string
 */
function buildCommandList(): string {
  const sections: string[] = [];

  for (const [_categoryKey, category] of Object.entries(COMMAND_CATEGORIES)) {
    const categoryCommands = category.commands
      .map(cmd => `\`${cmd.name}\` - ${cmd.desc}`)
      .join('\n');
    sections.push(`${category.emoji} **${getCategoryTitle(_categoryKey)}**\n${categoryCommands}`);
  }

  return sections.join('\n\n');
}

/**
 * Get human-readable category title
 */
function getCategoryTitle(key: string): string {
  const titles: Record<string, string> = {
    colorTools: 'Color Tools',
    dyeDatabase: 'Dye Database',
    analysis: 'Analysis',
    userData: 'Your Data',
    community: 'Community',
    utility: 'Utility',
  };
  return titles[key] || key;
}

/**
 * Handles the /about command
 */
export async function handleAboutCommand(
  interaction: DiscordInteraction,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Get version from package.json (bundled at build time)
  const version = packageJson.version || '2.0.0';

  const commandList = buildCommandList();

  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      embeds: [
        {
          title: `${t.t('about.title')} v${version}`,
          description: [
            t.t('about.description'),
            '',
            `**${t.t('about.commands')}** (${getTotalCommandCount()} total)`,
          ].join('\n'),
          color: COLORS.blurple,
          fields: [
            {
              name: '\u200B', // Zero-width space for spacing
              value: commandList,
              inline: false,
            },
            {
              name: `🔗 ${t.t('about.links')}`,
              value: [
                '[Web App](https://xivdyetools.projectgalatine.com/)',
                '[GitHub](https://github.com/FlashGalatine/xivdyetools-discord-worker)',
                '[Invite Bot](https://discord.com/oauth2/authorize?client_id=1447108133020369048)',
                '[Patreon](https://www.patreon.com/ProjectGalatine)',
              ].join(' • '),
              inline: false,
            },
          ],
          footer: {
            text: `${t.t('about.poweredBy')} • v${version}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });
}

/**
 * Get total number of commands
 */
function getTotalCommandCount(): number {
  return Object.values(COMMAND_CATEGORIES).reduce(
    (total, category) => total + category.commands.length,
    0
  );
}
