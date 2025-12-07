/**
 * /harmony Command Handler
 *
 * Generates color harmony visualizations for FFXIV dyes.
 * Accepts a color (hex or dye name) and harmony type, then
 * creates a visual wheel showing harmonious dye combinations.
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import { deferredResponse, errorEmbed } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import { generateHarmonyWheel, type HarmonyDye } from '../../services/svg/harmony-wheel.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
import type { Env } from '../../types/env.js';

// Initialize DyeService with the database
const dyeService = new DyeService(dyeDatabase);

// Valid harmony types
const HARMONY_TYPES = [
  'triadic',
  'complementary',
  'analogous',
  'split-complementary',
  'tetradic',
  'square',
  'monochromatic',
] as const;

type HarmonyType = (typeof HARMONY_TYPES)[number];

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
 * Resolves color input to a hex value and optional dye name
 */
function resolveColorInput(input: string): { hex: string; name?: string } | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    return { hex: normalizeHex(input) };
  }

  // Try to find a dye by name
  const dyes = dyeService.searchByName(input);
  if (dyes.length > 0) {
    // Take the closest match (first result)
    const dye = dyes[0];
    return { hex: dye.hex, name: dye.name };
  }

  return null;
}

/**
 * Gets harmony dyes based on the harmony type
 */
function getHarmonyDyes(hex: string, type: HarmonyType): Dye[] {
  switch (type) {
    case 'triadic':
      return dyeService.findTriadicDyes(hex);
    case 'complementary': {
      const comp = dyeService.findComplementaryPair(hex);
      return comp ? [comp] : [];
    }
    case 'analogous':
      return dyeService.findAnalogousDyes(hex, 30);
    case 'split-complementary':
      return dyeService.findSplitComplementaryDyes(hex);
    case 'tetradic':
      return dyeService.findTetradicDyes(hex);
    case 'square':
      return dyeService.findSquareDyes(hex);
    case 'monochromatic':
      return dyeService.findMonochromaticDyes(hex, 5);
    default:
      return dyeService.findTriadicDyes(hex);
  }
}

/**
 * Handles the /harmony command
 */
export async function handleHarmonyCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];
  const colorOption = options.find((opt) => opt.name === 'color');
  const typeOption = options.find((opt) => opt.name === 'type');

  const colorInput = colorOption?.value as string | undefined;
  const harmonyType = (typeOption?.value as HarmonyType) || 'triadic';

  // Validate required color input
  if (!colorInput) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [errorEmbed('Missing Input', 'Please provide a color (hex code or dye name).')],
        flags: 64, // Ephemeral
      },
    });
  }

  // Resolve the color input
  const resolved = resolveColorInput(colorInput);
  if (!resolved) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            'Invalid Color',
            `Could not resolve "${colorInput}" to a color. ` +
              'Please provide a valid hex code (e.g., #FF0000) or dye name (e.g., "Dalamud Red").'
          ),
        ],
        flags: 64,
      },
    });
  }

  // Defer the response (image generation takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processHarmonyCommand(interaction, env, resolved.hex, resolved.name, harmonyType)
  );

  return deferResponse;
}

/**
 * Background processing for harmony command
 */
async function processHarmonyCommand(
  interaction: DiscordInteraction,
  env: Env,
  baseHex: string,
  baseName: string | undefined,
  harmonyType: HarmonyType
): Promise<void> {
  try {
    // Get harmony dyes
    const harmonyDyes = getHarmonyDyes(baseHex, harmonyType);

    if (harmonyDyes.length === 0) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          errorEmbed('No Matches', `No matching dyes found for ${harmonyType} harmony with color ${baseHex}.`),
        ],
      });
      return;
    }

    // Convert Dye[] to HarmonyDye[]
    const dyesForWheel: HarmonyDye[] = harmonyDyes.map((dye) => ({
      id: dye.id,
      name: dye.name,
      hex: dye.hex,
      category: dye.category,
    }));

    // Generate SVG (400x400 matches 1.x style)
    const svg = generateHarmonyWheel({
      baseColor: baseHex,
      baseName: baseName || baseHex.toUpperCase(),
      harmonyType,
      dyes: dyesForWheel,
      width: 400,
      height: 400,
    });

    // Render to PNG
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    // Build description text
    const dyeList = harmonyDyes
      .map((dye, i) => `**${i + 1}.** ${dye.name} (\`${dye.hex.toUpperCase()}\`)`)
      .join('\n');

    // Send follow-up with image
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: `${formatHarmonyType(harmonyType)} Harmony`,
          description: `Base color: **${baseName || baseHex.toUpperCase()}** (\`${baseHex.toUpperCase()}\`)\n\n${dyeList}`,
          color: parseInt(baseHex.replace('#', ''), 16),
          image: { url: 'attachment://image.png' },
          footer: {
            text: 'XIV Dye Tools • Cloudflare Workers Edition',
          },
        },
      ],
      file: {
        name: `harmony-${harmonyType}.png`,
        data: pngBuffer,
        contentType: 'image/png',
      },
    });
  } catch (error) {
    console.error('Harmony command error:', error);

    // Send error response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        errorEmbed(
          'Generation Failed',
          'An error occurred while generating the harmony visualization. ' +
            'Please try again later.'
        ),
      ],
    });
  }
}

/**
 * Formats harmony type for display
 */
function formatHarmonyType(type: string): string {
  const formats: Record<string, string> = {
    complementary: 'Complementary',
    analogous: 'Analogous',
    triadic: 'Triadic',
    'split-complementary': 'Split-Complementary',
    tetradic: 'Tetradic',
    square: 'Square',
    monochromatic: 'Monochromatic',
  };
  return formats[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Returns autocomplete choices for harmony types
 */
export function getHarmonyTypeChoices(): Array<{ name: string; value: string }> {
  return HARMONY_TYPES.map((type) => ({
    name: formatHarmonyType(type),
    value: type,
  }));
}
