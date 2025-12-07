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
import { createTranslator, createUserTranslator, type Translator } from '../../services/bot-i18n.js';
import { resolveUserLocale, discordLocaleToLocaleCode, initializeLocale, getLocalizedDyeName, type LocaleCode } from '../../services/i18n.js';
import type { Env } from '../../types/env.js';

// Initialize DyeService with the database
const dyeService = new DyeService(dyeDatabase);

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  locale?: string;
  member?: {
    user: {
      id: string;
    };
  };
  user?: {
    id: string;
  };
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
function resolveColorInput(input: string): { hex: string; name?: string; id?: number; itemID?: number } | null {
  // Check if it's a hex color
  if (isValidHex(input)) {
    return { hex: normalizeHex(input) };
  }

  // Try to find a dye by name (excluding Facewear)
  const dyes = dyeService.searchByName(input);
  const nonFacewearDye = dyes.find((d) => d.category !== 'Facewear');

  if (nonFacewearDye) {
    return { hex: nonFacewearDye.hex, name: nonFacewearDye.name, id: nonFacewearDye.id, itemID: nonFacewearDye.itemID };
  }

  return null;
}

/**
 * Gets match quality description based on color distance
 */
function getMatchQuality(distance: number, t: Translator): string {
  if (distance === 0) return t.t('quality.perfect');
  if (distance < 10) return t.t('quality.excellent');
  if (distance < 25) return t.t('quality.good');
  if (distance < 50) return t.t('quality.fair');
  return t.t('quality.approximate');
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
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  // Extract options
  const options = interaction.data?.options || [];
  const startOption = options.find((opt) => opt.name === 'start_color');
  const endOption = options.find((opt) => opt.name === 'end_color');
  const stepsOption = options.find((opt) => opt.name === 'steps');

  const startInput = startOption?.value as string | undefined;
  const endInput = endOption?.value as string | undefined;
  const stepCount = (stepsOption?.value as number) || 6;

  // Get translator for validation errors (before deferring)
  const t = userId
    ? await createUserTranslator(env.KV, userId, interaction.locale)
    : createTranslator(discordLocaleToLocaleCode(interaction.locale ?? 'en') ?? 'en');

  // Validate required inputs
  if (!startInput || !endInput) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingInput'))],
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
          errorEmbed(t.t('common.error'), t.t('errors.invalidColor', { input: startInput })),
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
          errorEmbed(t.t('common.error'), t.t('errors.invalidColor', { input: endInput })),
        ],
        flags: 64,
      },
    });
  }

  // Resolve locale for background processing
  const locale = userId
    ? await resolveUserLocale(env.KV, userId, interaction.locale ?? 'en')
    : (discordLocaleToLocaleCode(interaction.locale ?? 'en') ?? 'en');

  // Defer the response (image generation takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processMixerCommand(
      interaction,
      env,
      startResolved,
      endResolved,
      stepCount,
      locale
    )
  );

  return deferResponse;
}

interface ResolvedColor {
  hex: string;
  name?: string;
  id?: number;
  itemID?: number;
}

/**
 * Background processing for mixer command
 */
async function processMixerCommand(
  interaction: DiscordInteraction,
  env: Env,
  startColor: ResolvedColor,
  endColor: ResolvedColor,
  stepCount: number,
  locale: LocaleCode
): Promise<void> {
  const t = createTranslator(locale);

  // Initialize xivdyetools-core localization for dye names
  await initializeLocale(locale);

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

      // Get localized name if dye exists
      const localizedDyeName = closestDye
        ? getLocalizedDyeName(closestDye.itemID, closestDye.name)
        : undefined;

      gradientSteps.push({
        hex,
        dyeName: localizedDyeName,
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
      const quality = getMatchQuality(step.distance, t);
      const dyeText = step.dyeName
        ? `${emojiPrefix}**${step.dyeName}**`
        : `_${t.t('errors.noMatchFound')}_`;

      // Label start/end
      let label = '';
      if (i === 0) label = ` (${t.t('mixer.startColor')})`;
      else if (i === gradientSteps.length - 1) label = ` (${t.t('mixer.endColor')})`;

      return `**${i + 1}.** ${dyeText} • \`${step.hex.toUpperCase()}\` • ${quality}${label}`;
    }).join('\n');

    // Build start/end labels with localized names
    const startEmoji = startColor.id ? getDyeEmoji(startColor.id) : undefined;
    const endEmoji = endColor.id ? getDyeEmoji(endColor.id) : undefined;
    const startEmojiPrefix = startEmoji ? `${startEmoji} ` : '';
    const endEmojiPrefix = endEmoji ? `${endEmoji} ` : '';
    const localizedStartName = startColor.itemID && startColor.name
      ? getLocalizedDyeName(startColor.itemID, startColor.name)
      : startColor.name;
    const localizedEndName = endColor.itemID && endColor.name
      ? getLocalizedDyeName(endColor.itemID, endColor.name)
      : endColor.name;
    const startText = localizedStartName
      ? `${startEmojiPrefix}**${localizedStartName}** (\`${startColor.hex.toUpperCase()}\`)`
      : `\`${startColor.hex.toUpperCase()}\``;
    const endText = localizedEndName
      ? `${endEmojiPrefix}**${localizedEndName}** (\`${endColor.hex.toUpperCase()}\`)`
      : `\`${endColor.hex.toUpperCase()}\``;

    // Send follow-up with image
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: `${t.t('mixer.title')} • ${t.t('mixer.steps', { count: stepCount })}`,
          description: [
            `**${t.t('mixer.startColor')}:** ${startText}`,
            `**${t.t('mixer.endColor')}:** ${endText}`,
            '',
            `**${t.t('match.topMatches', { count: stepCount })}:**`,
            dyeLines,
          ].join('\n'),
          color: hexToDiscordColor(startColor.hex),
          image: { url: 'attachment://image.png' },
          footer: {
            text: `${t.t('common.footer')} • ${t.t('match.useInfoNameHint')}`,
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
        errorEmbed(t.t('common.error'), t.t('errors.generationFailed')),
      ],
    });
  }
}
