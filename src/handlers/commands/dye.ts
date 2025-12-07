/**
 * /dye Command Handler
 *
 * Provides subcommands for searching and exploring FFXIV dyes:
 * - /dye search <query> - Search dyes by name
 * - /dye info <name> - Get detailed information about a specific dye
 * - /dye list [category] - List dyes by category
 * - /dye random - Show 5 randomly selected dyes
 *
 * All subcommands exclude Facewear dyes (generic names like "Red", "Blue").
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import { messageResponse, errorEmbed, hexToDiscordColor } from '../../utils/response.js';
import { getDyeEmoji } from '../../services/emoji.js';
import type { Env } from '../../types/env.js';

// Initialize DyeService with the database
const dyeService = new DyeService(dyeDatabase);

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  data?: {
    options?: Array<{
      name: string;
      type: number;
      value?: string | number | boolean;
      options?: Array<{
        name: string;
        value?: string | number | boolean;
      }>;
    }>;
  };
}

/**
 * Filters out Facewear dyes from results
 */
function excludeFacewear(dyes: Dye[]): Dye[] {
  return dyes.filter((dye) => dye.category !== 'Facewear');
}

/**
 * Formats a dye for display in an embed field
 */
function formatDyeField(dye: Dye, index?: number): { name: string; value: string; inline: boolean } {
  const emoji = getDyeEmoji(dye.id);
  const emojiPrefix = emoji ? `${emoji} ` : '';
  const indexPrefix = index !== undefined ? `**${index + 1}.** ` : '';

  return {
    name: `${indexPrefix}${emojiPrefix}${dye.name}`,
    value: `\`${dye.hex.toUpperCase()}\` • ${dye.category}`,
    inline: true,
  };
}

/**
 * Formats a dye for a compact list display
 */
function formatDyeListItem(dye: Dye): string {
  const emoji = getDyeEmoji(dye.id);
  const emojiPrefix = emoji ? `${emoji} ` : '';
  return `${emojiPrefix}**${dye.name}** (\`${dye.hex.toUpperCase()}\`)`;
}

/**
 * Handles the /dye command with subcommands
 */
export async function handleDyeCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const options = interaction.data?.options || [];
  const subcommand = options[0];

  if (!subcommand) {
    return messageResponse({
      embeds: [errorEmbed('Invalid Command', 'Please use a subcommand: search, info, list, or random.')],
      flags: 64,
    });
  }

  switch (subcommand.name) {
    case 'search':
      return handleSearchSubcommand(subcommand.options);
    case 'info':
      return handleInfoSubcommand(subcommand.options);
    case 'list':
      return handleListSubcommand(subcommand.options);
    case 'random':
      return handleRandomSubcommand();
    default:
      return messageResponse({
        embeds: [errorEmbed('Unknown Subcommand', `Unknown subcommand: ${subcommand.name}`)],
        flags: 64,
      });
  }
}

/**
 * Handles /dye search <query>
 */
function handleSearchSubcommand(
  options?: Array<{ name: string; value?: string | number | boolean }>
): Response {
  const queryOption = options?.find((opt) => opt.name === 'query');
  const query = queryOption?.value as string | undefined;

  if (!query) {
    return messageResponse({
      embeds: [errorEmbed('Missing Query', 'Please provide a search term.')],
      flags: 64,
    });
  }

  // Search for dyes and exclude Facewear
  const allResults = dyeService.searchByName(query);
  const results = excludeFacewear(allResults);

  if (results.length === 0) {
    return messageResponse({
      embeds: [
        {
          title: 'No Results',
          description: `No dyes found matching "${query}".`,
          color: 0x808080,
          footer: { text: 'Try a different search term' },
        },
      ],
    });
  }

  // Limit to 10 results for display
  const displayResults = results.slice(0, 10);
  const dyeList = displayResults.map(formatDyeListItem).join('\n');

  const moreText = results.length > 10 ? `\n\n*...and ${results.length - 10} more results*` : '';

  return messageResponse({
    embeds: [
      {
        title: `Search Results for "${query}"`,
        description: `Found ${results.length} dye${results.length !== 1 ? 's' : ''}:\n\n${dyeList}${moreText}`,
        color: displayResults[0] ? hexToDiscordColor(displayResults[0].hex) : 0x5865f2,
        footer: { text: 'Use /dye info <name> for detailed information' },
      },
    ],
  });
}

/**
 * Handles /dye info <name>
 */
function handleInfoSubcommand(
  options?: Array<{ name: string; value?: string | number | boolean }>
): Response {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const name = nameOption?.value as string | undefined;

  if (!name) {
    return messageResponse({
      embeds: [errorEmbed('Missing Name', 'Please provide a dye name.')],
      flags: 64,
    });
  }

  // Search for the dye
  const results = dyeService.searchByName(name);
  const dye = results.find((d) => d.name.toLowerCase() === name.toLowerCase()) || results[0];

  if (!dye) {
    return messageResponse({
      embeds: [
        errorEmbed('Dye Not Found', `Could not find a dye named "${name}".`),
      ],
      flags: 64,
    });
  }

  // Get emoji if available
  const emoji = getDyeEmoji(dye.id);
  const emojiPrefix = emoji ? `${emoji} ` : '';

  // Build detailed info embed
  const fields = [
    { name: 'Hex Color', value: `\`${dye.hex.toUpperCase()}\``, inline: true },
    { name: 'Category', value: dye.category, inline: true },
    { name: 'Item ID', value: `\`${dye.id}\``, inline: true },
  ];

  // Add RGB values
  const rgb = dye.rgb;
  fields.push({
    name: 'RGB',
    value: `\`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\``,
    inline: true,
  });

  // Add HSV values
  const hsv = dye.hsv;
  fields.push({
    name: 'HSV',
    value: `\`${Math.round(hsv.h)}°, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%\``,
    inline: true,
  });

  return messageResponse({
    embeds: [
      {
        title: `${emojiPrefix}${dye.name}`,
        description: `Detailed information for this ${dye.category} dye.`,
        color: hexToDiscordColor(dye.hex),
        fields,
        footer: { text: 'XIV Dye Tools' },
      },
    ],
  });
}

/**
 * Handles /dye list [category]
 */
function handleListSubcommand(
  options?: Array<{ name: string; value?: string | number | boolean }>
): Response {
  const categoryOption = options?.find((opt) => opt.name === 'category');
  const category = categoryOption?.value as string | undefined;

  // Get all dyes and exclude Facewear
  const allDyes = excludeFacewear(dyeService.getAllDyes());

  if (category) {
    // Filter by category
    const categoryDyes = allDyes.filter(
      (dye) => dye.category.toLowerCase() === category.toLowerCase()
    );

    if (categoryDyes.length === 0) {
      return messageResponse({
        embeds: [
          errorEmbed('No Dyes Found', `No dyes found in the "${category}" category.`),
        ],
        flags: 64,
      });
    }

    // Format list
    const dyeList = categoryDyes.map(formatDyeListItem).join('\n');

    return messageResponse({
      embeds: [
        {
          title: `${category} Dyes`,
          description: `${categoryDyes.length} dyes in this category:\n\n${dyeList}`,
          color: categoryDyes[0] ? hexToDiscordColor(categoryDyes[0].hex) : 0x5865f2,
          footer: { text: 'Use /dye info <name> for detailed information' },
        },
      ],
    });
  }

  // No category specified - show category summary
  const categories = new Map<string, number>();
  for (const dye of allDyes) {
    const count = categories.get(dye.category) || 0;
    categories.set(dye.category, count + 1);
  }

  const categoryList = Array.from(categories.entries())
    .map(([cat, count]) => `**${cat}**: ${count} dyes`)
    .join('\n');

  return messageResponse({
    embeds: [
      {
        title: 'Dye Categories',
        description: `There are ${allDyes.length} dyes across ${categories.size} categories:\n\n${categoryList}`,
        color: 0x5865f2,
        footer: { text: 'Use /dye list <category> to see dyes in a category' },
      },
    ],
  });
}

/**
 * Handles /dye random
 * Shows 5 randomly selected non-Facewear dyes
 */
function handleRandomSubcommand(): Response {
  // Get all non-Facewear dyes
  const allDyes = excludeFacewear(dyeService.getAllDyes());

  if (allDyes.length === 0) {
    return messageResponse({
      embeds: [errorEmbed('No Dyes Available', 'No dyes available in the database.')],
      flags: 64,
    });
  }

  // Randomly select 5 dyes (or fewer if not enough)
  const count = Math.min(5, allDyes.length);
  const selectedDyes: Dye[] = [];
  const usedIndices = new Set<number>();

  while (selectedDyes.length < count) {
    const index = Math.floor(Math.random() * allDyes.length);
    if (!usedIndices.has(index)) {
      usedIndices.add(index);
      selectedDyes.push(allDyes[index]);
    }
  }

  // Format the dyes
  const dyeList = selectedDyes
    .map((dye, i) => {
      const emoji = getDyeEmoji(dye.id);
      const emojiPrefix = emoji ? `${emoji} ` : '';
      return `**${i + 1}.** ${emojiPrefix}**${dye.name}** (\`${dye.hex.toUpperCase()}\`) • ${dye.category}`;
    })
    .join('\n');

  // Use the first dye's color for the embed
  const embedColor = selectedDyes[0] ? hexToDiscordColor(selectedDyes[0].hex) : 0x5865f2;

  return messageResponse({
    embeds: [
      {
        title: 'Random Dyes',
        description: `Here are ${count} randomly selected dyes:\n\n${dyeList}`,
        color: embedColor,
        footer: { text: 'Use /dye info <name> for detailed information • Run again for different dyes!' },
      },
    ],
  });
}
