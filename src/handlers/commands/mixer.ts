/**
 * /mixer Command Handler
 *
 * Generates a color gradient between two colors and finds the closest
 * FFXIV dyes for each step in the gradient.
 *
 * Accepts colors as hex codes or dye names, with configurable step count.
 */

import { DyeService, dyeDatabase, ColorService, type Dye } from 'xivdyetools-core';
import { deferredResponse, errorEmbed, hexToDiscordColor } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import {
  generateGradientBar,
  generateGradientColors,
  type GradientStep,
} from '../../services/svg/gradient.js';
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
 * Resolves color input to a hex value and optional dye info
 */
function resolveColorInput(input: string): { hex: string; name?: string; id?: number } | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    return { hex: normalizeHex(input) };
  }

  // Try to find a dye by name (excluding Facewear)
  const dyes = dyeService.searchByName(input);
  const nonFacewearDye = dyes.find((d) => d.category !== 'Facewear');

  if (nonFacewearDye) {
    return { hex: nonFacewearDye.hex, name: nonFacewearDye.name, id: nonFacewearDye.id };
  }

  return null;
}

/**
 * Gets match quality description based on color distance
 */
function getMatchQuality(distance: number): string {
  if (distance === 0) return 'Perfect';
  if (distance < 10) return 'Excellent';
  if (distance < 25) return 'Good';
  if (distance < 50) return 'Fair';
  return 'Approximate';
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
 * Handles the /mixer command
 */
export async function handleMixerCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];
  const startOption = options.find((opt) => opt.name === 'start_color');
  const endOption = options.find((opt) => opt.name === 'end_color');
  const stepsOption = options.find((opt) => opt.name === 'steps');

  const startInput = startOption?.value as string | undefined;
  const endInput = endOption?.value as string | undefined;
  const stepCount = (stepsOption?.value as number) || 6;

  // Validate required inputs
  if (!startInput || !endInput) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [errorEmbed('Missing Input', 'Please provide both a start and end color.')],
        flags: 64, // Ephemeral
      },
    });
  }

  // Resolve the start color
  const startResolved = resolveColorInput(startInput);
  if (!startResolved) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            'Invalid Start Color',
            `Could not resolve "${startInput}" to a color. ` +
              'Please provide a valid hex code (e.g., #FF0000) or dye name (e.g., "Dalamud Red").'
          ),
        ],
        flags: 64,
      },
    });
  }

  // Resolve the end color
  const endResolved = resolveColorInput(endInput);
  if (!endResolved) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(
            'Invalid End Color',
            `Could not resolve "${endInput}" to a color. ` +
              'Please provide a valid hex code (e.g., #0000FF) or dye name (e.g., "Midnight Blue").'
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
    processMixerCommand(
      interaction,
      env,
      startResolved,
      endResolved,
      stepCount
    )
  );

  return deferResponse;
}

interface ResolvedColor {
  hex: string;
  name?: string;
  id?: number;
}

/**
 * Background processing for mixer command
 */
async function processMixerCommand(
  interaction: DiscordInteraction,
  env: Env,
  startColor: ResolvedColor,
  endColor: ResolvedColor,
  stepCount: number
): Promise<void> {
  try {
    // Generate gradient colors
    const gradientHexColors = generateGradientColors(startColor.hex, endColor.hex, stepCount);

    // Find closest dye for each color (excluding Facewear)
    const gradientSteps: Array<GradientStep & { dye?: Dye; distance: number }> = [];

    for (const hex of gradientHexColors) {
      // Find closest dye, iterating until we find a non-Facewear dye
      let closestDye: Dye | null = null;
      const excludeIds: number[] = [];

      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = dyeService.findClosestDye(hex, excludeIds);
        if (!candidate) break;

        if (candidate.category !== 'Facewear') {
          closestDye = candidate;
          break;
        }
        excludeIds.push(candidate.id);
      }

      const distance = closestDye ? getColorDistance(hex, closestDye.hex) : 999;

      gradientSteps.push({
        hex,
        dyeName: closestDye?.name,
        dyeId: closestDye?.id,
        dye: closestDye ?? undefined,
        distance,
      });
    }

    // Generate SVG (800x200)
    const svg = generateGradientBar({
      steps: gradientSteps,
      width: 800,
      height: 200,
    });

    // Render to PNG
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    // Build description with matched dyes and quality
    const dyeLines = gradientSteps.map((step, i) => {
      const emoji = step.dyeId ? getDyeEmoji(step.dyeId) : undefined;
      const emojiPrefix = emoji ? `${emoji} ` : '';
      const quality = getMatchQuality(step.distance);
      const dyeText = step.dyeName
        ? `${emojiPrefix}**${step.dyeName}**`
        : '_No match_';

      // Label start/end
      let label = '';
      if (i === 0) label = ' (Start)';
      else if (i === gradientSteps.length - 1) label = ' (End)';

      return `**${i + 1}.** ${dyeText} • \`${step.hex.toUpperCase()}\` • ${quality}${label}`;
    }).join('\n');

    // Build start/end labels
    const startEmoji = startColor.id ? getDyeEmoji(startColor.id) : undefined;
    const endEmoji = endColor.id ? getDyeEmoji(endColor.id) : undefined;
    const startEmojiPrefix = startEmoji ? `${startEmoji} ` : '';
    const endEmojiPrefix = endEmoji ? `${endEmoji} ` : '';
    const startText = startColor.name
      ? `${startEmojiPrefix}**${startColor.name}** (\`${startColor.hex.toUpperCase()}\`)`
      : `\`${startColor.hex.toUpperCase()}\``;
    const endText = endColor.name
      ? `${endEmojiPrefix}**${endColor.name}** (\`${endColor.hex.toUpperCase()}\`)`
      : `\`${endColor.hex.toUpperCase()}\``;

    // Send follow-up with image
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: `Color Gradient • ${stepCount} Steps`,
          description: [
            `**From:** ${startText}`,
            `**To:** ${endText}`,
            '',
            '**Matched Dyes:**',
            dyeLines,
          ].join('\n'),
          color: hexToDiscordColor(startColor.hex),
          image: { url: 'attachment://image.png' },
          footer: {
            text: 'XIV Dye Tools • Use /dye info <name> for acquisition details',
          },
        },
      ],
      file: {
        name: `gradient-${stepCount}-steps.png`,
        data: pngBuffer,
        contentType: 'image/png',
      },
    });
  } catch (error) {
    console.error('Mixer command error:', error);

    // Send error response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        errorEmbed(
          'Generation Failed',
          'An error occurred while generating the gradient. ' +
            'Please try again later.'
        ),
      ],
    });
  }
}
