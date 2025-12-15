/**
 * /collection Command Handler
 *
 * Manages user's dye collections using Cloudflare KV storage.
 * Subcommands: create, delete, add, remove, show, list, rename
 */

import { DyeService, dyeDatabase, type Dye } from '@xivdyetools/core';
import { ephemeralResponse, successEmbed, errorEmbed, infoEmbed } from '../../utils/response.js';
import {
  getCollections,
  getCollection,
  createCollection,
  deleteCollection,
  renameCollection,
  addDyeToCollection,
  removeDyeFromCollection,
  MAX_COLLECTIONS,
  MAX_DYES_PER_COLLECTION,
  MAX_COLLECTION_NAME_LENGTH,
  type Collection,
} from '../../services/user-storage.js';
import { getDyeEmoji } from '../../services/emoji.js';
import { createUserTranslator, createTranslator, type Translator } from '../../services/bot-i18n.js';
import { discordLocaleToLocaleCode, initializeLocale, getLocalizedDyeName } from '../../services/i18n.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// Initialize DyeService
const dyeService = new DyeService(dyeDatabase);

/**
 * Resolve dye input to a Dye object
 */
function resolveDyeInput(input: string): Dye | null {
  // Try finding by name first
  const dyes = dyeService.searchByName(input);
  if (dyes.length > 0) {
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
 * Handles the /collection command
 */
export async function handleCollectionCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!userId) {
    const locale = discordLocaleToLocaleCode(interaction.locale ?? 'en') ?? 'en';
    const t = createTranslator(locale);
    return ephemeralResponse(t.t('errors.userNotFound'));
  }

  // Get translator for user's locale
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Initialize xivdyetools-core localization for dye names
  // Use translator's resolved locale instead of calling resolveUserLocale again
  const locale = t.getLocale();
  await initializeLocale(locale);

  // Extract subcommand
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1);

  if (!subcommand) {
    return ephemeralResponse(t.t('errors.missingSubcommand'));
  }

  switch (subcommand.name) {
    case 'create':
      return handleCreate(env, userId, t, subcommand.options);

    case 'delete':
      return handleDelete(env, userId, t, subcommand.options);

    case 'add':
      return handleAdd(env, userId, t, subcommand.options);

    case 'remove':
      return handleRemove(env, userId, t, subcommand.options);

    case 'show':
      return handleShow(env, userId, t, subcommand.options);

    case 'list':
      return handleList(env, userId, t);

    case 'rename':
      return handleRename(env, userId, t, subcommand.options);

    default:
      return ephemeralResponse(t.t('errors.unknownSubcommand', { name: subcommand.name }));
  }
}

/**
 * Handle /collection create <name> [description]
 */
async function handleCreate(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const descOption = options?.find((opt) => opt.name === 'description');

  const name = nameOption?.value as string | undefined;
  const description = descOption?.value as string | undefined;

  if (!name) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingName'))],
        flags: 64,
      },
    });
  }

  const result = await createCollection(env.KV, userId, name, description);

  if (!result.success) {
    switch (result.reason) {
      case 'nameTooLong':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(
                t.t('common.error'),
                t.t('collection.nameTooLong', { max: MAX_COLLECTION_NAME_LENGTH })
              ),
            ],
            flags: 64,
          },
        });

      case 'alreadyExists':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('collection.alreadyExists', { name })),
            ],
            flags: 64,
          },
        });

      case 'limitReached':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(
                t.t('common.error'),
                t.t('collection.limitReached', { max: MAX_COLLECTIONS })
              ),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed(t.t('common.error'), t.t('errors.failedToSave'))],
            flags: 64,
          },
        });
    }
  }

  const descText = description ? `\n\n*${description}*` : '';

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(
          t.t('common.success'),
          `${t.t('collection.created', { name })}${descText}\n\n` +
          t.t('collection.addDyeHint', { name })
        ),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /collection delete <name>
 */
async function handleDelete(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const name = nameOption?.value as string | undefined;

  if (!name) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingName'))],
        flags: 64,
      },
    });
  }

  const deleted = await deleteCollection(env.KV, userId, name);

  if (!deleted) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('collection.notFound', { name })),
        ],
        flags: 64,
      },
    });
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [successEmbed(t.t('common.success'), t.t('collection.deleted', { name }))],
      flags: 64,
    },
  });
}

/**
 * Handle /collection add <name> <dye>
 */
async function handleAdd(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const dyeOption = options?.find((opt) => opt.name === 'dye');

  const name = nameOption?.value as string | undefined;
  const dyeInput = dyeOption?.value as string | undefined;

  if (!name || !dyeInput) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.missingInput')),
        ],
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

  const result = await addDyeToCollection(env.KV, userId, name, dye.id);

  // Get localized dye name
  const localizedDyeName = getLocalizedDyeName(dye.itemID, dye.name);

  if (!result.success) {
    switch (result.reason) {
      case 'notFound':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('collection.notFound', { name })),
            ],
            flags: 64,
          },
        });

      case 'alreadyExists':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              infoEmbed(
                t.t('common.dye'),
                t.t('collection.dyeAlreadyInCollection', { dye: localizedDyeName, collection: name })
              ),
            ],
            flags: 64,
          },
        });

      case 'limitReached':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(
                t.t('common.error'),
                t.t('collection.dyeLimitReached', { max: MAX_DYES_PER_COLLECTION })
              ),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed(t.t('common.error'), t.t('errors.failedToSave'))],
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
        successEmbed(
          t.t('common.success'),
          `${emojiStr}${t.t('collection.dyeAdded', { dye: localizedDyeName, collection: name })}`
        ),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /collection remove <name> <dye>
 */
async function handleRemove(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const dyeOption = options?.find((opt) => opt.name === 'dye');

  const name = nameOption?.value as string | undefined;
  const dyeInput = dyeOption?.value as string | undefined;

  if (!name || !dyeInput) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.missingInput')),
        ],
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

  const removed = await removeDyeFromCollection(env.KV, userId, name, dye.id);

  // Get localized dye name
  const localizedDyeName = getLocalizedDyeName(dye.itemID, dye.name);

  if (!removed) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            t.t('common.dye'),
            t.t('collection.dyeNotInCollection', { dye: localizedDyeName, collection: name })
          ),
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
        successEmbed(
          t.t('common.success'),
          `${emojiStr}${t.t('collection.dyeRemoved', { dye: localizedDyeName, collection: name })}`
        ),
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /collection show <name>
 */
async function handleShow(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const name = nameOption?.value as string | undefined;

  if (!name) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingName'))],
        flags: 64,
      },
    });
  }

  const collection = await getCollection(env.KV, userId, name);

  if (!collection) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('collection.notFound', { name })),
        ],
        flags: 64,
      },
    });
  }

  if (collection.dyes.length === 0) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            collection.name,
            `${collection.description ? `*${collection.description}*\n\n` : ''}` +
            `${t.t('collection.collectionEmpty')}\n\n` +
            t.t('collection.addDyeHint', { name: collection.name })
          ),
        ],
        flags: 64,
      },
    });
  }

  // Get dye details
  const dyes = collection.dyes
    .map((id) => dyeService.getDyeById(id))
    .filter((dye): dye is Dye => dye !== null);

  // Build list with localized names
  const dyeList = dyes.map((dye, index) => {
    const emoji = getDyeEmoji(dye.id);
    const emojiStr = emoji ? `${emoji} ` : '';
    const localizedName = getLocalizedDyeName(dye.itemID, dye.name);
    return `${index + 1}. ${emojiStr}**${localizedName}** (\`${dye.hex.toUpperCase()}\`)`;
  });

  const description =
    (collection.description ? `*${collection.description}*\n\n` : '') +
    dyeList.join('\n');

  return Response.json({
    type: 4,
    data: {
      embeds: [
        {
          title: `${collection.name} (${dyes.length}/${MAX_DYES_PER_COLLECTION})`,
          description,
          color: dyes.length > 0 ? parseInt(dyes[0].hex.replace('#', ''), 16) : 0x5865f2,
          footer: {
            text: `${t.t('common.createdAt')}: ${new Date(collection.createdAt).toLocaleDateString()}`,
          },
        },
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /collection list
 */
async function handleList(env: Env, userId: string, t: Translator): Promise<Response> {
  const collections = await getCollections(env.KV, userId);

  if (collections.length === 0) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            t.t('collection.title'),
            `${t.t('collection.empty')}\n\n${t.t('collection.createHint')}`
          ),
        ],
        flags: 64,
      },
    });
  }

  // Build list
  const collectionList = collections.map((c, index) => {
    const dyeCount = c.dyes.length;
    const desc = c.description ? ` - *${c.description.substring(0, 30)}${c.description.length > 30 ? '...' : ''}*` : '';
    const dyeWord = dyeCount === 1 ? t.t('common.dye') : t.t('common.dyes');
    return `${index + 1}. **${c.name}** (${dyeCount} ${dyeWord})${desc}`;
  });

  return Response.json({
    type: 4,
    data: {
      embeds: [
        {
          title: `${t.t('collection.title')} (${collections.length}/${MAX_COLLECTIONS})`,
          description: collectionList.join('\n'),
          color: 0x5865f2,
          footer: {
            text: t.t('collection.showHint'),
          },
        },
      ],
      flags: 64,
    },
  });
}

/**
 * Handle /collection rename <name> <new_name>
 */
async function handleRename(
  env: Env,
  userId: string,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const newNameOption = options?.find((opt) => opt.name === 'new_name');

  const name = nameOption?.value as string | undefined;
  const newName = newNameOption?.value as string | undefined;

  if (!name || !newName) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          errorEmbed(t.t('common.error'), t.t('errors.missingInput')),
        ],
        flags: 64,
      },
    });
  }

  const result = await renameCollection(env.KV, userId, name, newName);

  if (!result.success) {
    switch (result.reason) {
      case 'nameTooLong':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(
                t.t('common.error'),
                t.t('collection.nameTooLong', { max: MAX_COLLECTION_NAME_LENGTH })
              ),
            ],
            flags: 64,
          },
        });

      case 'notFound':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('collection.notFound', { name })),
            ],
            flags: 64,
          },
        });

      case 'alreadyExists':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed(t.t('common.error'), t.t('collection.alreadyExists', { name: newName })),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed(t.t('common.error'), t.t('errors.failedToSave'))],
            flags: 64,
          },
        });
    }
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [
        successEmbed(
          t.t('common.success'),
          t.t('collection.renamed', { oldName: name, newName })
        ),
      ],
      flags: 64,
    },
  });
}
