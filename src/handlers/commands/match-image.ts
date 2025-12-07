/**
 * /match_image Command Handler
 *
 * Extracts dominant colors from an uploaded image and matches
 * each color to the closest FFXIV dye.
 *
 * Features:
 * - 1-5 color extraction using K-means clustering
 * - Quality indicators (PERFECT/EXCELLENT/GOOD/FAIR/APPROX)
 * - Visual palette grid showing extracted vs matched colors
 * - Dominance percentages for each color
 */

import {
  DyeService,
  dyeDatabase,
  PaletteService,
  type PaletteMatch,
} from 'xivdyetools-core';
import { deferredResponse, errorEmbed } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import { generatePaletteGrid, type PaletteEntry } from '../../services/svg/palette-grid.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
import { getDyeEmoji } from '../../services/emoji.js';
import { validateAndFetchImage, processImageForExtraction } from '../../services/image/index.js';
import { getMatchQuality } from '../../types/image.js';
import type { Env } from '../../types/env.js';

// ============================================================================
// Service Initialization
// ============================================================================

const dyeService = new DyeService(dyeDatabase);
const paletteService = new PaletteService();

// ============================================================================
// Types
// ============================================================================

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  data?: {
    options?: Array<{
      name: string;
      value?: string | number | boolean;
      type: number;
    }>;
    resolved?: {
      attachments?: Record<
        string,
        {
          id: string;
          filename: string;
          size: number;
          url: string;
          proxy_url: string;
          content_type?: string;
          width?: number;
          height?: number;
        }
      >;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum colors to extract */
const MIN_COLORS = 1;

/** Maximum colors to extract */
const MAX_COLORS = 5;

/** Default number of colors */
const DEFAULT_COLORS = 1;

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Handles the /match_image command
 */
export async function handleMatchImageCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];
  const attachments = interaction.data?.resolved?.attachments || {};

  // Get the image attachment option
  const imageOption = options.find((opt) => opt.name === 'image');
  const colorsOption = options.find((opt) => opt.name === 'colors');

  // Validate image attachment
  if (!imageOption?.value) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [errorEmbed('Missing Image', 'Please attach an image to analyze.')],
        flags: 64, // Ephemeral
      },
    });
  }

  // Get attachment data from resolved
  const attachmentId = imageOption.value as string;
  const attachment = attachments[attachmentId];

  if (!attachment) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed('Invalid Attachment', 'Could not find the attached image.')],
        flags: 64,
      },
    });
  }

  // Validate color count
  let colorCount = DEFAULT_COLORS;
  if (colorsOption?.value !== undefined) {
    colorCount = Math.max(MIN_COLORS, Math.min(MAX_COLORS, Number(colorsOption.value)));
  }

  // Defer the response (image processing takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(processMatchImageCommand(interaction, env, attachment.url, colorCount));

  return deferResponse;
}

/**
 * Background processing for match_image command
 */
async function processMatchImageCommand(
  interaction: DiscordInteraction,
  env: Env,
  imageUrl: string,
  colorCount: number
): Promise<void> {
  try {
    // Step 1: Validate and fetch image
    const { buffer } = await validateAndFetchImage(imageUrl);

    // Step 2: Process image to extract pixels
    const processed = await processImageForExtraction(buffer);

    // Step 3: Convert pixels to RGB array (filtering transparent pixels)
    const rgbPixels = PaletteService.pixelDataToRGBFiltered(
      processed.pixels as unknown as Uint8ClampedArray,
      128 // Alpha threshold
    );

    if (rgbPixels.length === 0) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          errorEmbed(
            'No Colors Found',
            'The image appears to be fully transparent or too small to analyze.'
          ),
        ],
      });
      return;
    }

    // Step 4: Extract and match palette
    const matches = paletteService.extractAndMatchPalette(rgbPixels, dyeService, {
      colorCount,
      maxIterations: 25,
      maxSamples: 10000,
    });

    if (matches.length === 0) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          errorEmbed('Extraction Failed', 'Could not extract colors from the image.'),
        ],
      });
      return;
    }

    // Step 5: Convert to PaletteEntry format
    const entries: PaletteEntry[] = matches.map((match: PaletteMatch) => ({
      extracted: match.extracted,
      matchedDye: match.matchedDye,
      distance: match.distance,
      dominance: match.dominance,
    }));

    // Step 6: Generate SVG
    const svg = generatePaletteGrid({
      entries,
      title: colorCount === 1 ? 'Color Match' : `${colorCount} Color Palette`,
    });

    // Step 7: Render to PNG
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    // Step 8: Build description
    const description = buildMatchDescription(matches);

    // Step 9: Send response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: colorCount === 1 ? 'Closest Dye Match' : `Top ${matches.length} Matching Dyes`,
          description,
          color: parseInt(matches[0].matchedDye.hex.replace('#', ''), 16),
          image: { url: 'attachment://image.png' },
          footer: {
            text: 'XIV Dye Tools • Color extracted via K-means clustering',
          },
        },
      ],
      file: {
        name: 'match-image.png',
        data: pngBuffer,
        contentType: 'image/png',
      },
    });
  } catch (error) {
    console.error('Match image command error:', error);

    // Determine error message
    let errorMessage = 'An error occurred while processing the image.';
    if (error instanceof Error) {
      // Use specific error messages for known issues
      if (error.message.includes('SSRF') || error.message.includes('Discord CDN')) {
        errorMessage = 'Only images uploaded directly to Discord can be analyzed.';
      } else if (error.message.includes('too large')) {
        errorMessage = error.message;
      } else if (error.message.includes('format')) {
        errorMessage = 'Unsupported image format. Please use PNG, JPEG, GIF, or WebP.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Image download timed out. Please try again.';
      }
    }

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed('Processing Failed', errorMessage)],
    });
  }
}

/**
 * Build description text for matches
 */
function buildMatchDescription(matches: PaletteMatch[]): string {
  const lines = matches.map((match, i) => {
    const emoji = getDyeEmoji(match.matchedDye.id);
    const emojiPrefix = emoji ? `${emoji} ` : '';
    const quality = getMatchQuality(match.distance);
    const qualityBadge = `[${quality.shortLabel}]`;

    // Format: **1.** 🎨 Dalamud Red (#AA1111) [EXCELLENT] - 42%
    return (
      `**${i + 1}.** ${emojiPrefix}**${match.matchedDye.name}** ` +
      `(\`${match.matchedDye.hex.toUpperCase()}\`) ${qualityBadge} - ${match.dominance}%`
    );
  });

  return lines.join('\n');
}
