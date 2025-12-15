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

import { DyeService, dyeDatabase, type Dye } from '@xivdyetools/core';
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
import { createTranslator, createUserTranslator, type Translator } from '../../services/bot-i18n.js';
import { discordLocaleToLocaleCode, initializeLocale, getLocalizedDyeName, type LocaleCode } from '../../services/i18n.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// ============================================================================
// Service Initialization
// ============================================================================

const dyeService = new DyeService(dyeDatabase);

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved dye input
 */
interface ResolvedDye {
  hex: string;
  name: string;
  id?: number;
  itemID?: number;
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
      itemID: closest?.itemID,
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
      itemID: nonFacewear.itemID,
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
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

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

  // Get translator for validation errors (before deferring)
  const t = userId
    ? await createUserTranslator(env.KV, userId, interaction.locale)
    : createTranslator(discordLocaleToLocaleCode(interaction.locale ?? 'en') ?? 'en');

  // Validate at least one dye is provided
  if (dyeInputs.length === 0) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.missingInput')),
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
            errorEmbed(t.t('common.error'), t.t('errors.invalidColor', { input: input.value })),
          ],
          flags: 64,
        },
      });
    }
    resolvedDyes.push(resolved);
  }

  // Resolve locale for background processing
  // Use translator's resolved locale instead of calling resolveUserLocale again
  const locale = t.getLocale();

  // Defer the response (SVG generation takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processAccessibilityCommand(interaction, env, resolvedDyes, visionFilter, locale)
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
  visionFilter: VisionType | undefined,
  locale: LocaleCode
): Promise<void> {
  const t = createTranslator(locale);

  // Initialize xivdyetools-core localization for dye names
  await initializeLocale(locale);

  try {
    if (dyes.length === 1) {
      // Single dye mode: Colorblind simulation
      await processSingleDyeAccessibility(interaction, env, dyes[0], visionFilter, t);
    } else {
      // Multi-dye mode: Contrast matrix
      await processMultiDyeContrast(interaction, env, dyes, t);
    }
  } catch (error) {
    console.error('Accessibility command error:', error);

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        errorEmbed(t.t('common.error'), t.t('errors.generationFailed')),
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
  visionFilter: VisionType | undefined,
  t: Translator
): Promise<void> {
  // Determine which vision types to show
  const visionTypes = visionFilter ? [visionFilter] : VISION_TYPES;

  // Get localized dye name
  const localizedDyeName = dye.itemID
    ? getLocalizedDyeName(dye.itemID, dye.name)
    : dye.name;

  // Generate SVG with localized name
  const svg = generateAccessibilityComparison({
    dyeHex: dye.hex,
    dyeName: localizedDyeName,
    visionTypes,
  });

  // Render to PNG
  const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

  // Build description
  const emoji = dye.id ? getDyeEmoji(dye.id) : undefined;
  const emojiPrefix = emoji ? `${emoji} ` : '';

  const description =
    `${emojiPrefix}**${localizedDyeName}** (\`${dye.hex.toUpperCase()}\`)\n\n` +
    `${t.t('accessibility.description')}\n\n` +
    `• **${t.t('accessibility.protanopia')}** - ${t.t('accessibility.protanopiaDesc')}\n` +
    `• **${t.t('accessibility.deuteranopia')}** - ${t.t('accessibility.deuteranopiaDesc')}\n` +
    `• **${t.t('accessibility.tritanopia')}** - ${t.t('accessibility.tritanopiaDesc')}`;

  // Send response
  await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
    embeds: [
      {
        title: t.t('accessibility.title'),
        description,
        color: parseInt(dye.hex.replace('#', ''), 16),
        image: { url: 'attachment://image.png' },
        footer: {
          text: `${t.t('common.footer')} • ${t.t('accessibility.simulationMethod')}`,
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
  dyes: ResolvedDye[],
  t: Translator
): Promise<void> {
  // Convert to ContrastDye format with localized names
  const contrastDyes: ContrastDye[] = dyes.map((d) => ({
    name: d.itemID ? getLocalizedDyeName(d.itemID, d.name) : d.name,
    hex: d.hex,
  }));

  // Generate SVG with localized names
  const svg = generateContrastMatrix({
    dyes: contrastDyes,
    title: t.t('accessibility.contrastTitle'),
  });

  // Render to PNG
  const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

  // Build description with localized names
  const dyeList = dyes
    .map((d) => {
      const emoji = d.id ? getDyeEmoji(d.id) : undefined;
      const emojiPrefix = emoji ? `${emoji} ` : '';
      const localizedName = d.itemID ? getLocalizedDyeName(d.itemID, d.name) : d.name;
      return `${emojiPrefix}**${localizedName}** (\`${d.hex.toUpperCase()}\`)`;
    })
    .join('\n');

  const description =
    `${t.t('accessibility.comparing', { count: dyes.length })}:\n${dyeList}\n\n` +
    `${t.t('accessibility.matrixDescription')}\n\n` +
    `🟢 **AAA** (7:1+) - ${t.t('accessibility.wcagAAADesc')}\n` +
    `🟡 **AA** (4.5:1+) - ${t.t('accessibility.wcagAADesc')}\n` +
    `🔴 **${t.t('comparison.fails')}** (<4.5:1) - ${t.t('accessibility.wcagFailDesc')}`;

  // Send response
  await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
    embeds: [
      {
        title: t.t('accessibility.contrastAnalysis'),
        description,
        color: parseInt(dyes[0].hex.replace('#', ''), 16),
        image: { url: 'attachment://image.png' },
        footer: {
          text: `${t.t('common.footer')} • ${t.t('accessibility.wcagGuidelines')}`,
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
