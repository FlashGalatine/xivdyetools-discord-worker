/**
 * /accessibility Command Handler
 *
 * Provides accessibility analysis for FFXIV dyes:
 * - Single dye: Colorblind simulation (protanopia, deuteranopia, tritanopia)
 * - Multiple dyes (2-4): WCAG contrast matrix with AAA/AA/FAIL badges
 *
 * Helps players choose dye combinations that are distinguishable
 * for users with color vision deficiencies.
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import { deferredResponse, errorEmbed } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import {
  generateAccessibilityComparison,
  type VisionType,
} from '../../services/svg/accessibility-comparison.js';
import {
  generateContrastMatrix,
  type ContrastDye,
} from '../../services/svg/contrast-matrix.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
import { getDyeEmoji } from '../../services/emoji.js';
import type { Env } from '../../types/env.js';

// ============================================================================
// Service Initialization
// ============================================================================

const dyeService = new DyeService(dyeDatabase);

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
  };
}

/**
 * Resolved dye input
 */
interface ResolvedDye {
  hex: string;
  name: string;
  id?: number;
  dye?: Dye;
}

// ============================================================================
// Constants
// ============================================================================

const VISION_TYPES: VisionType[] = ['protanopia', 'deuteranopia', 'tritanopia'];

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Resolves dye input (hex or name) to a color
 */
function resolveDyeInput(input: string): ResolvedDye | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    const hex = normalizeHex(input);
    // Try to find closest matching dye for the name
    const closest = dyeService.findClosestDye(hex);
    return {
      hex,
      name: closest ? closest.name : hex.toUpperCase(),
      id: closest?.id,
      dye: closest ?? undefined,
    };
  }

  // Try to find a dye by name (exclude Facewear)
  const dyes = dyeService.searchByName(input);
  const nonFacewear = dyes.find((d) => d.category !== 'Facewear');

  if (nonFacewear) {
    return {
      hex: nonFacewear.hex,
      name: nonFacewear.name,
      id: nonFacewear.id,
      dye: nonFacewear,
    };
  }

  return null;
}

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Handles the /accessibility command
 */
export async function handleAccessibilityCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Extract options
  const options = interaction.data?.options || [];

  // Get all dye inputs
  const dyeInputs: { name: string; value: string }[] = [];
  for (const opt of options) {
    if (opt.name.startsWith('dye') && opt.value) {
      dyeInputs.push({ name: opt.name, value: opt.value as string });
    }
  }

  // Get optional vision type filter
  const visionOption = options.find((opt) => opt.name === 'vision');
  const visionFilter = visionOption?.value as VisionType | undefined;

  // Validate at least one dye is provided
  if (dyeInputs.length === 0) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [
          errorEmbed('Missing Input', 'Please provide at least one dye (hex code or dye name).'),
        ],
        flags: 64, // Ephemeral
      },
    });
  }

  // Resolve all dye inputs
  const resolvedDyes: ResolvedDye[] = [];
  for (const input of dyeInputs) {
    const resolved = resolveDyeInput(input.value);
    if (!resolved) {
      return Response.json({
        type: 4,
        data: {
          embeds: [
            errorEmbed(
              'Invalid Color',
              `Could not resolve "${input.value}" to a color. ` +
                'Please provide a valid hex code (e.g., #FF0000) or dye name (e.g., "Dalamud Red").'
            ),
          ],
          flags: 64,
        },
      });
    }
    resolvedDyes.push(resolved);
  }

  // Defer the response (SVG generation takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processAccessibilityCommand(interaction, env, resolvedDyes, visionFilter)
  );

  return deferResponse;
}

/**
 * Background processing for accessibility command
 */
async function processAccessibilityCommand(
  interaction: DiscordInteraction,
  env: Env,
  dyes: ResolvedDye[],
  visionFilter?: VisionType
): Promise<void> {
  try {
    if (dyes.length === 1) {
      // Single dye mode: Colorblind simulation
      await processSingleDyeAccessibility(interaction, env, dyes[0], visionFilter);
    } else {
      // Multi-dye mode: Contrast matrix
      await processMultiDyeContrast(interaction, env, dyes);
    }
  } catch (error) {
    console.error('Accessibility command error:', error);

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        errorEmbed(
          'Processing Failed',
          'An error occurred while generating the accessibility visualization. ' +
            'Please try again later.'
        ),
      ],
    });
  }
}

/**
 * Process single dye accessibility (colorblind simulation)
 */
async function processSingleDyeAccessibility(
  interaction: DiscordInteraction,
  env: Env,
  dye: ResolvedDye,
  visionFilter?: VisionType
): Promise<void> {
  // Determine which vision types to show
  const visionTypes = visionFilter ? [visionFilter] : VISION_TYPES;

  // Generate SVG
  const svg = generateAccessibilityComparison({
    dyeHex: dye.hex,
    dyeName: dye.name,
    visionTypes,
  });

  // Render to PNG
  const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

  // Build description
  const emoji = dye.id ? getDyeEmoji(dye.id) : undefined;
  const emojiPrefix = emoji ? `${emoji} ` : '';

  const description =
    `${emojiPrefix}**${dye.name}** (\`${dye.hex.toUpperCase()}\`)\n\n` +
    'This visualization shows how the dye appears to people with different types of color vision deficiency:\n\n' +
    '• **Protanopia** - Reduced sensitivity to red light (~1% of males)\n' +
    '• **Deuteranopia** - Reduced sensitivity to green light (~1% of males)\n' +
    '• **Tritanopia** - Reduced sensitivity to blue light (rare)';

  // Send response
  await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
    embeds: [
      {
        title: 'Color Vision Accessibility',
        description,
        color: parseInt(dye.hex.replace('#', ''), 16),
        image: { url: 'attachment://image.png' },
        footer: {
          text: 'XIV Dye Tools • Brettel 1997 colorblind simulation',
        },
      },
    ],
    file: {
      name: 'accessibility.png',
      data: pngBuffer,
      contentType: 'image/png',
    },
  });
}

/**
 * Process multi-dye contrast matrix
 */
async function processMultiDyeContrast(
  interaction: DiscordInteraction,
  env: Env,
  dyes: ResolvedDye[]
): Promise<void> {
  // Convert to ContrastDye format
  const contrastDyes: ContrastDye[] = dyes.map((d) => ({
    name: d.name,
    hex: d.hex,
  }));

  // Generate SVG
  const svg = generateContrastMatrix({
    dyes: contrastDyes,
    title: 'Contrast Comparison',
  });

  // Render to PNG
  const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

  // Build description
  const dyeList = dyes
    .map((d) => {
      const emoji = d.id ? getDyeEmoji(d.id) : undefined;
      const emojiPrefix = emoji ? `${emoji} ` : '';
      return `${emojiPrefix}**${d.name}** (\`${d.hex.toUpperCase()}\`)`;
    })
    .join('\n');

  const description =
    `Comparing ${dyes.length} dyes:\n${dyeList}\n\n` +
    'The matrix shows WCAG contrast ratios between each pair of dyes:\n\n' +
    '🟢 **AAA** (7:1+) - Excellent for all text sizes\n' +
    '🟡 **AA** (4.5:1+) - Acceptable for normal text\n' +
    '🔴 **FAIL** (<4.5:1) - May be difficult to distinguish';

  // Send response
  await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
    embeds: [
      {
        title: 'WCAG Contrast Analysis',
        description,
        color: parseInt(dyes[0].hex.replace('#', ''), 16),
        image: { url: 'attachment://image.png' },
        footer: {
          text: 'XIV Dye Tools • WCAG 2.1 contrast guidelines',
        },
      },
    ],
    file: {
      name: 'contrast-matrix.png',
      data: pngBuffer,
      contentType: 'image/png',
    },
  });
}
