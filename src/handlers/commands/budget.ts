/**
 * /budget Command Handler
 *
 * Helps users find affordable alternatives to expensive dyes.
 * Integrates with Universalis API for market board prices.
 *
 * Subcommands:
 * - /budget find <target_dye> - Find cheaper alternatives
 * - /budget set_world <world> - Set preferred world/datacenter
 * - /budget quick <preset> - Quick picks for popular expensive dyes
 */

import type { ExtendedLogger } from '@xivdyetools/logger';
import { deferredResponse, errorEmbed, ephemeralResponse } from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
import { generateBudgetComparison, generateNoWorldSetSvg, generateErrorSvg } from '../../services/svg/budget-comparison.js';
import { createUserTranslator, createTranslator, type Translator } from '../../services/bot-i18n.js';
import { getUserWorld, setUserWorld } from '../../services/user-preferences.js';
import {
  findCheaperAlternatives,
  getDyeById,
  getDyeByName,
  getDyeAutocomplete,
  isUniversalisEnabled,
  validateWorld,
  getWorldAutocomplete,
  getQuickPickById,
  getQuickPickChoices,
} from '../../services/budget/index.js';
import type { BudgetSearchOptions, BudgetSortOption } from '../../types/budget.js';
import { UniversalisError, SORT_DISPLAY, formatGil } from '../../types/budget.js';
import type { Env, DiscordInteraction, InteractionResponseType } from '../../types/env.js';
import { getDyeEmoji } from '../../services/emoji.js';

// ============================================================================
// Constants
// ============================================================================

/** Default width for generated images */
const IMAGE_WIDTH = 800;

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Handles the /budget command and subcommands
 */
export async function handleBudgetCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Get subcommand
  const options = interaction.data?.options || [];
  const subcommand = options[0];

  if (!subcommand || !subcommand.name) {
    return ephemeralResponse(t.t('common.error'));
  }

  switch (subcommand.name) {
    case 'find':
      return handleFindSubcommand(interaction, env, ctx, subcommand.options || [], t, userId, logger);

    case 'set_world':
      return handleSetWorldSubcommand(env, subcommand.options || [], t, userId, logger);

    case 'quick':
      return handleQuickSubcommand(interaction, env, ctx, subcommand.options || [], t, userId, logger);

    default:
      return ephemeralResponse(t.t('common.error'));
  }
}

// ============================================================================
// Find Subcommand
// ============================================================================

/**
 * Handles /budget find <target_dye>
 */
async function handleFindSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  options: Array<{ name: string; value?: string | number | boolean }>,
  t: Translator,
  userId: string,
  logger?: ExtendedLogger
): Promise<Response> {
  // Check if Universalis is configured
  if (!isUniversalisEnabled(env)) {
    return ephemeralResponse(t.t('budget.errors.notConfigured'));
  }

  // Extract options
  const targetDyeInput = options.find((opt) => opt.name === 'target_dye')?.value as string | undefined;
  const maxPrice = options.find((opt) => opt.name === 'max_price')?.value as number | undefined;
  const maxDistance = options.find((opt) => opt.name === 'max_distance')?.value as number | undefined;
  const sortBy = (options.find((opt) => opt.name === 'sort_by')?.value as BudgetSortOption) || 'value_score';
  const worldOverride = options.find((opt) => opt.name === 'world')?.value as string | undefined;

  // Validate target dye
  if (!targetDyeInput) {
    return ephemeralResponse(t.t('budget.errors.missingDye'));
  }

  // Resolve target dye (could be ID or name)
  const targetDyeId = parseInt(targetDyeInput, 10);
  const targetDye = !isNaN(targetDyeId)
    ? getDyeById(targetDyeId)
    : getDyeByName(targetDyeInput);

  if (!targetDye) {
    return ephemeralResponse(t.t('budget.errors.dyeNotFound', { name: targetDyeInput }));
  }

  // Get world preference
  let world = worldOverride;
  if (!world) {
    const pref = await getUserWorld(env.KV, userId, logger);
    world = pref?.world;
  }

  if (!world) {
    // No world set - show error with instruction
    const svg = generateNoWorldSetSvg(IMAGE_WIDTH);
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [
          {
            title: t.t('budget.noWorldSet.title'),
            description: t.t('budget.noWorldSet.description'),
            color: 0xfee75c, // Warning yellow
            image: { url: 'attachment://budget.png' },
          },
        ],
        flags: 64, // Ephemeral
      },
    });
  }

  // Defer response (price fetching takes time)
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processFindCommand(
      interaction,
      env,
      targetDye.itemID,
      world,
      { maxPrice, maxDistance, sortBy, limit: 5 },
      t,
      logger
    )
  );

  return deferResponse;
}

/**
 * Background processing for find command
 */
async function processFindCommand(
  interaction: DiscordInteraction,
  env: Env,
  targetDyeId: number,
  world: string,
  searchOptions: BudgetSearchOptions,
  t: Translator,
  logger?: ExtendedLogger
): Promise<void> {
  try {
    // Find alternatives
    const result = await findCheaperAlternatives(env, targetDyeId, world, searchOptions, logger);

    // Generate SVG
    const svg = generateBudgetComparison({
      targetDye: result.targetDye,
      targetPrice: result.targetPrice,
      alternatives: result.alternatives,
      world: result.world,
      sortBy: searchOptions.sortBy || 'value_score',
      width: IMAGE_WIDTH,
    });

    // Render to PNG
    const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

    // Build description
    let description = '';

    if (result.targetPrice) {
      description += `**${t.t('budget.targetPrice')}:** ${formatGil(result.targetPrice.currentMinPrice)} Gil\n`;
    } else {
      description += `**${t.t('budget.targetPrice')}:** ${t.t('budget.noListings')}\n`;
    }

    description += `**${t.t('budget.world')}:** ${result.world}\n`;
    description += `**${t.t('budget.sortedBy')}:** ${SORT_DISPLAY[searchOptions.sortBy || 'value_score'].label}\n\n`;

    if (result.alternatives.length > 0) {
      description += `${t.t('budget.foundAlternatives', { count: result.alternatives.length })}`;
    } else {
      description += t.t('budget.noAlternatives');
    }

    // Get dye emoji for target
    const targetDye = result.targetDye;
    const emoji = getDyeEmoji(targetDye.id);
    const emojiPrefix = emoji ? `${emoji} ` : '';

    // Send response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: `${emojiPrefix}${t.t('budget.findTitle', { name: targetDye.name })}`,
          description,
          color: parseInt(targetDye.hex.replace('#', ''), 16),
          image: { url: 'attachment://budget.png' },
          footer: { text: t.t('common.footer') },
        },
      ],
      file: {
        name: 'budget.png',
        data: pngBuffer,
        contentType: 'image/png',
      },
    });
  } catch (error) {
    if (logger) {
      logger.error('Budget find error', error instanceof Error ? error : undefined);
    }

    // Handle specific errors
    let errorMessage = t.t('errors.generationFailed');

    if (error instanceof UniversalisError) {
      if (error.isRateLimited) {
        errorMessage = t.t('budget.errors.rateLimited');
      } else {
        errorMessage = t.t('budget.errors.apiError');
      }
    }

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), errorMessage)],
    });
  }
}

// ============================================================================
// Set World Subcommand
// ============================================================================

/**
 * Handles /budget set_world <world>
 */
async function handleSetWorldSubcommand(
  env: Env,
  options: Array<{ name: string; value?: string | number | boolean }>,
  t: Translator,
  userId: string,
  logger?: ExtendedLogger
): Promise<Response> {
  const worldInput = options.find((opt) => opt.name === 'world')?.value as string | undefined;

  if (!worldInput) {
    return ephemeralResponse(t.t('budget.errors.missingWorld'));
  }

  // Validate world exists
  const validatedWorld = await validateWorld(env, worldInput, logger);

  if (!validatedWorld) {
    return ephemeralResponse(t.t('budget.errors.worldNotFound', { name: worldInput }));
  }

  // Save preference
  const success = await setUserWorld(env.KV, userId, validatedWorld, logger);

  if (!success) {
    return ephemeralResponse(t.t('budget.errors.saveFailed'));
  }

  return ephemeralResponse(t.t('budget.worldSet', { world: validatedWorld }));
}

// ============================================================================
// Quick Subcommand
// ============================================================================

/**
 * Handles /budget quick <preset>
 */
async function handleQuickSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  options: Array<{ name: string; value?: string | number | boolean }>,
  t: Translator,
  userId: string,
  logger?: ExtendedLogger
): Promise<Response> {
  const presetId = options.find((opt) => opt.name === 'preset')?.value as string | undefined;
  const worldOverride = options.find((opt) => opt.name === 'world')?.value as string | undefined;

  if (!presetId) {
    return ephemeralResponse(t.t('budget.errors.missingPreset'));
  }

  // Get preset
  const preset = getQuickPickById(presetId);
  if (!preset) {
    return ephemeralResponse(t.t('budget.errors.presetNotFound'));
  }

  // Get world preference
  let world = worldOverride;
  if (!world) {
    const pref = await getUserWorld(env.KV, userId, logger);
    world = pref?.world;
  }

  if (!world) {
    return ephemeralResponse(t.t('budget.noWorldSet.description'));
  }

  // Defer response
  const deferResponse = deferredResponse();

  // Process in background
  ctx.waitUntil(
    processFindCommand(
      interaction,
      env,
      preset.targetDyeId,
      world,
      { sortBy: 'value_score', limit: 5 },
      t,
      logger
    )
  );

  return deferResponse;
}

// ============================================================================
// Autocomplete Handler
// ============================================================================

/**
 * Handles autocomplete for the /budget command
 */
export async function handleBudgetAutocomplete(
  interaction: DiscordInteraction,
  env: Env,
  logger?: ExtendedLogger
): Promise<Response> {
  const options = interaction.data?.options || [];
  const subcommand = options[0];

  if (!subcommand || !subcommand.options) {
    return Response.json({ type: 8, data: { choices: [] } });
  }

  // Find the focused option
  const focusedOption = subcommand.options.find(
    (opt: { focused?: boolean }) => opt.focused
  ) as { name: string; value?: string } | undefined;

  if (!focusedOption) {
    return Response.json({ type: 8, data: { choices: [] } });
  }

  const query = String(focusedOption.value || '');
  let choices: Array<{ name: string; value: string }> = [];

  switch (focusedOption.name) {
    case 'target_dye':
      choices = getDyeAutocomplete(query, 25);
      break;

    case 'world':
      choices = await getWorldAutocomplete(env, query, logger);
      break;

    default:
      break;
  }

  return Response.json({
    type: 8, // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
    data: { choices },
  });
}
