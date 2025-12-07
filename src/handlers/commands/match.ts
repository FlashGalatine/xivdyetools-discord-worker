/**
 * /match Command Handler
 *
 * Finds the closest FFXIV dye(s) to a given color input.
 * Accepts hex codes or dye names, returns match quality and details.
 */

import { DyeService, dyeDatabase, ColorService, type Dye } from 'xivdyetools-core';
import { messageResponse, errorEmbed, hexToDiscordColor } from '../../utils/response.js';
import { getDyeEmoji } from '../../services/emoji.js';
import { createCopyButtons } from '../buttons/index.js';
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
      value?: string | number | boolean;
    }>;
  };
}

/**
 * Validates if a string is a valid hex color
 */
function isValidHex(input: string): boolean {
  return /^#?[0-9A-Fa-f]{6}$/.test(input) || /^#?[0-9A-Fa-f]{3}$/.test(input);
}

/**
 * Normalizes a hex color (ensures # prefix and 6 digits)
 */
function normalizeHex(hex: string): string {
  let clean = hex.replace('#', '');

  // Expand 3-digit hex to 6-digit
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }

  return `#${clean}`;
}

/**
 * Resolves color input to a hex value
 */
function resolveColorInput(input: string): { hex: string; fromDye?: Dye } | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    return { hex: normalizeHex(input) };
  }

  // Try to find a dye by name (excluding Facewear)
  const dyes = dyeService.searchByName(input);
  const nonFacewearDye = dyes.find((d) => d.category !== 'Facewear');

  if (nonFacewearDye) {
    return { hex: nonFacewearDye.hex, fromDye: nonFacewearDye };
  }

  return null;
}

/**
 * Calculates Euclidean distance between two hex colors
 */
function getColorDistance(hex1: string, hex2: string): number {
  const rgb1 = ColorService.hexToRgb(hex1);
  const rgb2 = ColorService.hexToRgb(hex2);

  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
}

/**
 * Gets match quality emoji and label based on color distance
 */
function getMatchQuality(distance: number): { emoji: string; label: string } {
  if (distance === 0) return { emoji: '🎯', label: 'Perfect' };
  if (distance < 10) return { emoji: '✨', label: 'Excellent' };
  if (distance < 25) return { emoji: '👍', label: 'Good' };
  if (distance < 50) return { emoji: '⚠️', label: 'Fair' };
  return { emoji: '🔍', label: 'Approximate' };
}

/**
 * Formats RGB values for display
 */
function formatRgb(hex: string): string {
  const rgb = ColorService.hexToRgb(hex);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Formats HSV values for display
 */
function formatHsv(hex: string): string {
  const rgb = ColorService.hexToRgb(hex);
  const hsv = ColorService.rgbToHsv(rgb.r, rgb.g, rgb.b);
  return `${Math.round(hsv.h)}°, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%`;
}

/**
 * Handles the /match command
 */
export async function handleMatchCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];
  const colorOption = options.find((opt) => opt.name === 'color');
  const countOption = options.find((opt) => opt.name === 'count');

  const colorInput = colorOption?.value as string | undefined;
  const matchCount = Math.min(Math.max((countOption?.value as number) || 1, 1), 10);

  // Validate required input
  if (!colorInput) {
    return messageResponse({
      embeds: [errorEmbed('Missing Input', 'Please provide a color (hex code or dye name).')],
      flags: 64,
    });
  }

  // Resolve the color input
  const resolved = resolveColorInput(colorInput);
  if (!resolved) {
    return messageResponse({
      embeds: [
        errorEmbed(
          'Invalid Color',
          `Could not resolve "${colorInput}" to a color.\n\n` +
            'Please provide a valid hex code (e.g., `#FF0000`) or dye name (e.g., `Dalamud Red`).'
        ),
      ],
      flags: 64,
    });
  }

  const targetHex = resolved.hex;

  // Find closest dye(s), excluding Facewear
  const matches: Array<{ dye: Dye; distance: number }> = [];
  const excludeIds: number[] = [];

  for (let i = 0; i < matchCount; i++) {
    // Find closest dye, iterating until we find a non-Facewear dye
    let closestDye: Dye | null = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = dyeService.findClosestDye(targetHex, excludeIds);
      if (!candidate) break;

      if (candidate.category !== 'Facewear') {
        closestDye = candidate;
        break;
      }
      excludeIds.push(candidate.id);
    }

    if (closestDye) {
      const distance = getColorDistance(targetHex, closestDye.hex);
      matches.push({ dye: closestDye, distance });
      excludeIds.push(closestDye.id);
    }
  }

  if (matches.length === 0) {
    return messageResponse({
      embeds: [
        errorEmbed('No Match Found', 'Could not find any matching dyes in the database.'),
      ],
      flags: 64,
    });
  }

  // Build response based on single or multiple matches
  if (matchCount === 1) {
    return buildSingleMatchResponse(targetHex, matches[0], resolved.fromDye);
  } else {
    return buildMultiMatchResponse(targetHex, matches, resolved.fromDye);
  }
}

/**
 * Builds response for a single match
 */
function buildSingleMatchResponse(
  targetHex: string,
  match: { dye: Dye; distance: number },
  fromDye?: Dye
): Response {
  const { dye, distance } = match;
  const quality = getMatchQuality(distance);
  const emoji = getDyeEmoji(dye.id);
  const emojiPrefix = emoji ? `${emoji} ` : '';

  // Build input color description
  let inputDesc = `**Hex:** \`${targetHex.toUpperCase()}\`\n`;
  inputDesc += `**RGB:** \`${formatRgb(targetHex)}\`\n`;
  inputDesc += `**HSV:** \`${formatHsv(targetHex)}\``;

  if (fromDye) {
    const fromEmoji = getDyeEmoji(fromDye.id);
    const fromEmojiPrefix = fromEmoji ? `${fromEmoji} ` : '';
    inputDesc = `${fromEmojiPrefix}**${fromDye.name}**\n${inputDesc}`;
  }

  // Build match description
  let matchDesc = `${emojiPrefix}**${dye.name}**\n`;
  matchDesc += `**Hex:** \`${dye.hex.toUpperCase()}\`\n`;
  matchDesc += `**RGB:** \`${formatRgb(dye.hex)}\`\n`;
  matchDesc += `**HSV:** \`${formatHsv(dye.hex)}\`\n`;
  matchDesc += `**Category:** ${dye.category}`;

  // Create copy buttons for the matched dye
  const rgb = ColorService.hexToRgb(dye.hex);
  const hsv = ColorService.rgbToHsv(rgb.r, rgb.g, rgb.b);
  const copyButtons = createCopyButtons(
    dye.hex,
    rgb,
    { h: Math.round(hsv.h), s: Math.round(hsv.s), v: Math.round(hsv.v) }
  );

  return messageResponse({
    embeds: [
      {
        title: `${quality.emoji} Dye Match: ${dye.name}`,
        color: hexToDiscordColor(dye.hex),
        fields: [
          {
            name: '🎨 Input Color',
            value: inputDesc,
            inline: true,
          },
          {
            name: '🧪 Closest Dye',
            value: matchDesc,
            inline: true,
          },
          {
            name: '📊 Match Quality',
            value: `**Distance:** ${distance.toFixed(2)}\n**Quality:** ${quality.label}`,
            inline: true,
          },
        ],
        footer: {
          text: 'XIV Dye Tools • Use /dye info for acquisition details',
        },
      },
    ],
    components: [copyButtons],
  });
}

/**
 * Builds response for multiple matches
 */
function buildMultiMatchResponse(
  targetHex: string,
  matches: Array<{ dye: Dye; distance: number }>,
  fromDye?: Dye
): Response {
  // Build input description
  let inputText = fromDye
    ? `**${fromDye.name}** (\`${targetHex.toUpperCase()}\`)`
    : `\`${targetHex.toUpperCase()}\``;

  // Build matches list
  const matchLines = matches.map((match, i) => {
    const { dye, distance } = match;
    const quality = getMatchQuality(distance);
    const emoji = getDyeEmoji(dye.id);
    const emojiPrefix = emoji ? `${emoji} ` : '';

    return `**${i + 1}.** ${emojiPrefix}**${dye.name}** • \`${dye.hex.toUpperCase()}\` • ${quality.emoji} ${quality.label} (Δ ${distance.toFixed(1)})`;
  }).join('\n');

  return messageResponse({
    embeds: [
      {
        title: `🎨 Top ${matches.length} Dye Matches`,
        description: `Finding closest matches for ${inputText}\n\n${matchLines}`,
        color: hexToDiscordColor(matches[0].dye.hex),
        footer: {
          text: 'XIV Dye Tools • Use /dye info <name> for acquisition details',
        },
      },
    ],
  });
}
