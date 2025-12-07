/**
 * /manual Command Handler
 *
 * Displays comprehensive help documentation for all bot commands.
 * Organizes commands into logical categories with descriptions.
 * Sends as ephemeral message (only visible to the user).
 */

import type { Env } from '../../types/env.js';

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
}

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
 * Handles the /manual command
 */
export async function handleManualCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const embeds = [
    // Overview
    {
      title: '📖 XIV Dye Tools Manual',
      description: [
        'Welcome to **XIV Dye Tools**! This bot helps you explore and match FFXIV dye colors.',
        '',
        'Below you\'ll find all available commands organized by category.',
        'All commands support **autocomplete** for dye names!',
      ].join('\n'),
      color: COLORS.blurple,
    },

    // Color Matching Tools
    {
      title: '🎨 Color Matching',
      color: COLORS.green,
      fields: [
        {
          name: '`/match <color> [count]`',
          value: 'Find the closest FFXIV dye to any color.\n• Accepts hex codes (`#FF0000`) or dye names\n• Optional: show up to 10 closest matches',
          inline: false,
        },
        {
          name: '`/harmony <color> [type]`',
          value: 'Generate harmonious dye combinations.\n• Types: Complementary, Analogous, Triadic, Split-Complementary, Tetradic, Square, Monochromatic\n• Creates a visual color wheel',
          inline: false,
        },
        {
          name: '`/mixer <start> <end> [steps]`',
          value: 'Create a color gradient between two colors.\n• Shows matched dyes for each gradient step\n• Configurable step count (2-10)',
          inline: false,
        },
      ],
    },

    // Dye Information
    {
      title: '🧪 Dye Information',
      color: COLORS.yellow,
      fields: [
        {
          name: '`/dye search <query>`',
          value: 'Search for dyes by name.\n• Fuzzy matching finds partial matches\n• Shows hex codes and categories',
          inline: false,
        },
        {
          name: '`/dye info <name>`',
          value: 'Get detailed information about a specific dye.\n• Shows hex, RGB, HSV values\n• Displays category and item ID',
          inline: false,
        },
        {
          name: '`/dye list [category]`',
          value: 'List all dyes or filter by category.\n• Categories: Reds, Browns, Yellows, Greens, Blues, Purples, Neutral, Special',
          inline: false,
        },
        {
          name: '`/dye random [unique_categories]`',
          value: 'Show 5 randomly selected dyes.\n• Option to limit to 1 dye per category',
          inline: false,
        },
      ],
    },

    // Bot Information
    {
      title: 'ℹ️ Bot Information',
      color: COLORS.fuchsia,
      fields: [
        {
          name: '`/about`',
          value: 'Show bot information, version, and links.',
          inline: true,
        },
        {
          name: '`/manual`',
          value: 'Show this help guide.',
          inline: true,
        },
      ],
    },

    // Tips & Resources
    {
      title: '💡 Tips & Resources',
      color: COLORS.blue,
      description: [
        '**Autocomplete:** Start typing a dye name and suggestions will appear!',
        '',
        '**Hex Colors:** Use standard web format like `#FF0000` (red) or `#5865F2` (blurple)',
        '',
        '**Dye Names:** Type partial names - "dala" will find "Dalamud Red"',
        '',
        '**Facewear Excluded:** Generic Facewear dyes (like "Red", "Blue") are excluded from results',
        '',
        '**Links:**',
        '• [Web App](https://xivdyetools.projectgalatine.com/)',
        '• [Support Server](https://discord.gg/5VUSKTZCe5)',
        '• [Patreon](https://patreon.com/ProjectGalatine)',
      ].join('\n'),
    },
  ];

  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      embeds,
      flags: 64, // Ephemeral - only visible to user
    },
  });
}
