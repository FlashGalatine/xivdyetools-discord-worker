/**
 * /comparison Command Handler
 *
 * Compares 2-4 FFXIV dyes side-by-side, showing color values,
 * distances, and contrast ratios.
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import { deferredResponse, errorEmbed } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import { generateComparisonGrid } from '../../services/svg/comparison-grid.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
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
      value?: string | number | boolean;
    }>;
  };
}

/**
 * Validates if a string is a valid hex color
 */
function isValidHex(input: string): boolean {
  return /^#?[0-9A-Fa-f]{6}$/.test(input);
}

/**
 * Normalizes a hex color (ensures # prefix)
 */
function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/**
 * Resolves color input to a dye
 * Returns the dye if found by name, or creates a synthetic dye from hex
 */
function resolveColorInput(input: string): Dye | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    const hex = normalizeHex(input);
    // Find closest dye to this hex color
    const closestDye = dyeService.findClosestDye(hex);
    if (closestDye) {
      return closestDye;
    }
    // If no dye found, return null (unlikely but possible)
    return null;
  }

  // Try to find a dye by name
  const dyes = dyeService.searchByName(input);
  if (dyes.length > 0) {
    // Filter out Facewear and take the first match
    const nonFacewear = dyes.filter((d) => d.category !== 'Facewear');
    return nonFacewear[0] || dyes[0];
  }

  return null;
}

/**
 * Handles the /comparison command
 */
export async function handleComparisonCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];
  const dye1Input = options.find((opt) => opt.name === 'dye1')?.value as string | undefined;
  const dye2Input = options.find((opt) => opt.name === 'dye2')?.value as string | undefined;
  const dye3Input = options.find((opt) => opt.name === 'dye3')?.value as string | undefined;
  const dye4Input = options.find((opt) => opt.name === 'dye4')?.value as string | undefined;

  // Validate required inputs
  if (!dye1Input || !dye2Input) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [errorEmbed('Missing Input', 'Please provide at least two dyes to compare.')],
        flags: 64, // Ephemeral
      },
    });
  }

  // Resolve all dye inputs
  const resolvedDyes: Array<{ input: string; dye: Dye | null }> = [
    { input: dye1Input, dye: resolveColorInput(dye1Input) },
    { input: dye2Input, dye: resolveColorInput(dye2Input) },
  ];

  if (dye3Input) {
    resolvedDyes.push({ input: dye3Input, dye: resolveColorInput(dye3Input) });
  }
  if (dye4Input) {
    resolvedDyes.push({ input: dye4Input, dye: resolveColorInput(dye4Input) });
  }

  // Check for any resolution failures
  const failures = resolvedDyes.filter((r) => r.dye === null);
  if (failures.length > 0) {
    const failedInputs = failures.map((f) => `"${f.input}"`).join(', ');
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            'Invalid Input',
            `Could not resolve ${failedInputs} to a dye or color. ` +
              'Please provide valid hex codes (e.g., #FF0000) or dye names (e.g., "Dalamud Red").'
          ),
        ],
        flags: 64,
      },
    });
  }

  // Extract valid dyes (we know they're all non-null now)
  const dyes = resolvedDyes.map((r) => r.dye as Dye);

  // Defer the response (image generation takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(processComparisonCommand(interaction, env, dyes));

  return deferResponse;
}

/**
 * Background processing for comparison command
 */
async function processComparisonCommand(
  interaction: DiscordInteraction,
  env: Env,
  dyes: Dye[]
): Promise<void> {
  try {
    // Generate SVG
    const svg = generateComparisonGrid({
      dyes,
      width: 800,
      showHsv: true,
    });

    // Render to PNG
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    // Build description with dye list and emojis
    const dyeList = dyes
      .map((dye, i) => {
        const emoji = getDyeEmoji(dye.id);
        const emojiPrefix = emoji ? `${emoji} ` : '';
        return `**${i + 1}.** ${emojiPrefix}${dye.name} (\`${dye.hex.toUpperCase()}\`)`;
      })
      .join('\n');

    // Calculate the embed color from the first dye
    const embedColor = parseInt(dyes[0].hex.replace('#', ''), 16);

    // Send follow-up with image
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: `Comparing ${dyes.length} Dyes`,
          description: dyeList,
          color: embedColor,
          image: { url: 'attachment://image.png' },
          footer: {
            text: 'XIV Dye Tools • Color distance uses RGB Euclidean distance',
          },
        },
      ],
      file: {
        name: 'comparison.png',
        data: pngBuffer,
        contentType: 'image/png',
      },
    });
  } catch (error) {
    console.error('Comparison command error:', error);

    // Send error response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        errorEmbed(
          'Generation Failed',
          'An error occurred while generating the comparison visualization. ' +
            'Please try again later.'
        ),
      ],
    });
  }
}
