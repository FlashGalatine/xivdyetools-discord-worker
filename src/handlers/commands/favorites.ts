/**
 * /favorites Command Handler
 *
 * Manages user's favorite dyes using Cloudflare KV storage.
 * Subcommands: add, remove, list, clear
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import { ephemeralResponse, successEmbed, errorEmbed, infoEmbed } from '../../utils/response.js';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  clearFavorites,
  MAX_FAVORITES,
} from '../../services/user-storage.js';
import { getDyeEmoji } from '../../services/emoji.js';
import { createUserTranslator, type Translator } from '../../services/bot-i18n.js';
import { initializeLocale, getLocalizedDyeName, getLocalizedCategory } from '../../services/i18n.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// Initialize DyeService
const dyeService = new DyeService(dyeDatabase);

/**
 * Resolve dye input to a Dye object
 * Accepts dye name or hex color
 */
function resolveDyeInput(input: string): Dye | null {
  // Try finding by name first
  const dyes = dyeService.searchByName(input);
  if (dyes.length > 0) {
    // Filter out Facewear and return first match
    const nonFacewear = dyes.filter((d) => d.category !== 'Facewear');
    return nonFacewear[0] || dyes[0];
  }

  // Try as hex color - find closest dye
  if (/^#?[0-9A-Fa-f]{6}$/.test(input)) {
    const hex = input.startsWith('#') ? input : `#${input}`;
    return dyeService.findClosestDye(hex);
  }

  return null;
}

/**
 * Handles the /favorites command
 */
export async function handleFavoritesCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!userId) {
    return ephemeralResponse('Could not identify user.');
  }

  // Get translator for user's locale
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Initialize xivdyetools-core localization for dye names using translator's resolved locale
  await initializeLocale(t.getLocale());

  // Extract subcommand
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1); // SUB_COMMAND type

  if (!subcommand) {
    return ephemeralResponse(t.t('errors.missingSubcommand'));
  }

  switch (subcommand.name) {
    case 'add':
      return handleAddFavorite(env, userId, t, subcommand.options);

    case 'remove':
      return handleRemoveFavorite(env, userId, t, subcommand.options);

    case 'list':
      return handleListFavorites(env, userId, t);

    case 'clear':
      return handleClearFavorites(env, userId, t);

    default:
      return ephemeralResponse(t.t('errors.unknownSubcommand', { name: subcommand.name }));
  }
}

/**
 * Handle /favorites add <dye>
 */
async function handleAddFavorite(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const dyeOption = options?.find((opt) => opt.name === 'dye');
  const dyeInput = dyeOption?.value as string | undefined;

  if (!dyeInput) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingName'))],
        flags: 64,
      },
    });
  }

  // Resolve the dye
  const dye = resolveDyeInput(dyeInput);
  if (!dye) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.dyeNotFound', { name: dyeInput })),
        ],
        flags: 64,
      },
    });
  }

  // Add to favorites
  const result = await addFavorite(env.KV, userId, dye.id);

  // Get localized dye name
  const localizedName = getLocalizedDyeName(dye.itemID, dye.name);

  if (!result.success) {
    switch (result.reason) {
      case 'alreadyExists':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              infoEmbed(t.t('common.error'), t.t('favorites.alreadyFavorite', { name: localizedName })),
            ],
            flags: 64,
          },
        });

      case 'limitReached':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('favorites.limitReached', { max: MAX_FAVORITES })),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('errors.failedToSave')),
            ],
            flags: 64,
          },
        });
    }
  }

  const emoji = getDyeEmoji(dye.id);
  const emojiStr = emoji ? `${emoji} ` : '';

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(t.t('common.success'), `${emojiStr}${t.t('favorites.added', { name: localizedName })}`),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /favorites remove <dye>
 */
async function handleRemoveFavorite(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const dyeOption = options?.find((opt) => opt.name === 'dye');
  const dyeInput = dyeOption?.value as string | undefined;

  if (!dyeInput) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingName'))],
        flags: 64,
      },
    });
  }

  // Resolve the dye
  const dye = resolveDyeInput(dyeInput);
  if (!dye) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.dyeNotFound', { name: dyeInput })),
        ],
        flags: 64,
      },
    });
  }

  // Remove from favorites
  const removed = await removeFavorite(env.KV, userId, dye.id);

  // Get localized dye name
  const localizedName = getLocalizedDyeName(dye.itemID, dye.name);

  if (!removed) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(t.t('common.error'), t.t('favorites.notInFavorites', { name: localizedName })),
        ],
        flags: 64,
      },
    });
  }

  const emoji = getDyeEmoji(dye.id);
  const emojiStr = emoji ? `${emoji} ` : '';

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(t.t('common.success'), `${emojiStr}${t.t('favorites.removed', { name: localizedName })}`),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /favorites list
 */
async function handleListFavorites(env: Env, userId: string, t: Translator): Promise<Response> {
  const favoriteIds = await getFavorites(env.KV, userId);

  if (favoriteIds.length === 0) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            t.t('favorites.title'),
            `${t.t('favorites.empty')}\n\n${t.t('favorites.addHint')}`
          ),
        ],
        flags: 64,
      },
    });
  }

  // Get dye details for each favorite
  const dyes = favoriteIds
    .map((id) => dyeService.getDyeById(id))
    .filter((dye): dye is Dye => dye !== null);

  // Build list with emojis and localized names
  const dyeList = dyes.map((dye, index) => {
    const emoji = getDyeEmoji(dye.id);
    const emojiStr = emoji ? `${emoji} ` : '';
    const localizedName = getLocalizedDyeName(dye.itemID, dye.name);
    const localizedCategory = getLocalizedCategory(dye.category);
    return `${index + 1}. ${emojiStr}**${localizedName}** (\`${dye.hex.toUpperCase()}\`) - ${localizedCategory}`;
  });

  // Group by category for summary with localized names
  const categoryCount = dyes.reduce((acc, dye) => {
    acc[dye.category] = (acc[dye.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categorySummary = Object.entries(categoryCount)
    .map(([cat, count]) => `${getLocalizedCategory(cat)}: ${count}`)
    .join(' • ');

  return Response.json({
    type: 4,
    data: {
      embeds: [
        {
          title: `${t.t('favorites.title')} (${t.t('favorites.count', { count: dyes.length, max: MAX_FAVORITES })})`,
          description: dyeList.join('\n'),
          color: 0x5865f2,
          footer: {
            text: categorySummary,
          },
        },
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /favorites clear
 */
async function handleClearFavorites(env: Env, userId: string, t: Translator): Promise<Response> {
  // Get current count for confirmation message
  const favorites = await getFavorites(env.KV, userId);
  const count = favorites.length;

  if (count === 0) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(t.t('favorites.title'), t.t('favorites.empty')),
        ],
        flags: 64,
      },
    });
  }

  const success = await clearFavorites(env.KV, userId);

  if (!success) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.failedToReset')),
        ],
        flags: 64,
      },
    });
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(t.t('common.success'), t.t('favorites.cleared')),
      ],
      flags: 64,
    },
  });
}
