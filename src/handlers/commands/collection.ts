/**
 * /collection Command Handler
 *
 * Manages user's dye collections using Cloudflare KV storage.
 * Subcommands: create, delete, add, remove, show, list, rename
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
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
import type { Env } from '../../types/env.js';

// Initialize DyeService
const dyeService = new DyeService(dyeDatabase);

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  user?: {
    id: string;
    username: string;
  };
  data?: {
    options?: Array<{
      name: string;
      type: number;
      value?: string | number | boolean;
      options?: Array<{
        name: string;
        type: number;
        value?: string | number | boolean;
      }>;
    }>;
  };
}

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
    return ephemeralResponse('Could not identify user.');
  }

  // Extract subcommand
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1);

  if (!subcommand) {
    return ephemeralResponse(
      'Please specify a subcommand: `create`, `delete`, `add`, `remove`, `show`, `list`, or `rename`.'
    );
  }

  switch (subcommand.name) {
    case 'create':
      return handleCreate(env, userId, subcommand.options);

    case 'delete':
      return handleDelete(env, userId, subcommand.options);

    case 'add':
      return handleAdd(env, userId, subcommand.options);

    case 'remove':
      return handleRemove(env, userId, subcommand.options);

    case 'show':
      return handleShow(env, userId, subcommand.options);

    case 'list':
      return handleList(env, userId);

    case 'rename':
      return handleRename(env, userId, subcommand.options);

    default:
      return ephemeralResponse(`Unknown subcommand: ${subcommand.name}`);
  }
}

/**
 * Handle /collection create <name> [description]
 */
async function handleCreate(
  env: Env,
  userId: string,
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
        embeds: [errorEmbed('Missing Name', 'Please specify a name for the collection.')],
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
                'Name Too Long',
                `Collection names must be ${MAX_COLLECTION_NAME_LENGTH} characters or less.`
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
              errorEmbed('Already Exists', `A collection named "${name}" already exists.`),
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
                'Collection Limit',
                `You've reached the maximum of ${MAX_COLLECTIONS} collections.\n\n` +
                  'Use `/collection delete` to remove one first.'
              ),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed('Error', 'Could not create collection. Please try again.')],
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
          'Collection Created',
          `Created new collection: **${name}**${descText}\n\n` +
            `Use \`/collection add ${name} <dye>\` to add dyes.`
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
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const name = nameOption?.value as string | undefined;

  if (!name) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed('Missing Name', 'Please specify the collection to delete.')],
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
          errorEmbed('Not Found', `Could not find a collection named "${name}".`),
        ],
        flags: 64,
      },
    });
  }

  return Response.json({
    type: 4,
    data: {
      embeds: [successEmbed('Collection Deleted', `Deleted collection: **${name}**`)],
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
          errorEmbed('Missing Input', 'Please specify both collection name and dye.'),
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
          errorEmbed('Dye Not Found', `Could not find a dye matching "${dyeInput}".`),
        ],
        flags: 64,
      },
    });
  }

  const result = await addDyeToCollection(env.KV, userId, name, dye.id);

  if (!result.success) {
    switch (result.reason) {
      case 'notFound':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed('Collection Not Found', `Could not find a collection named "${name}".`),
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
                'Already in Collection',
                `**${dye.name}** is already in the collection "${name}".`
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
                'Collection Full',
                `This collection has reached the maximum of ${MAX_DYES_PER_COLLECTION} dyes.`
              ),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed('Error', 'Could not add dye. Please try again.')],
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
          'Dye Added',
          `Added ${emojiStr}**${dye.name}** to collection "${name}".`
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
          errorEmbed('Missing Input', 'Please specify both collection name and dye.'),
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
          errorEmbed('Dye Not Found', `Could not find a dye matching "${dyeInput}".`),
        ],
        flags: 64,
      },
    });
  }

  const removed = await removeDyeFromCollection(env.KV, userId, name, dye.id);

  if (!removed) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            'Not in Collection',
            `**${dye.name}** is not in the collection "${name}" (or collection doesn't exist).`
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
          'Dye Removed',
          `Removed ${emojiStr}**${dye.name}** from collection "${name}".`
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
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const nameOption = options?.find((opt) => opt.name === 'name');
  const name = nameOption?.value as string | undefined;

  if (!name) {
    return Response.json({
      type: 4,
      data: {
        embeds: [errorEmbed('Missing Name', 'Please specify the collection to show.')],
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
          errorEmbed('Not Found', `Could not find a collection named "${name}".`),
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
              'This collection is empty.\n\n' +
              `Use \`/collection add ${collection.name} <dye>\` to add dyes.`
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

  // Build list
  const dyeList = dyes.map((dye, index) => {
    const emoji = getDyeEmoji(dye.id);
    const emojiStr = emoji ? `${emoji} ` : '';
    return `${index + 1}. ${emojiStr}**${dye.name}** (\`${dye.hex.toUpperCase()}\`)`;
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
            text: `Created: ${new Date(collection.createdAt).toLocaleDateString()}`,
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
async function handleList(env: Env, userId: string): Promise<Response> {
  const collections = await getCollections(env.KV, userId);

  if (collections.length === 0) {
    return Response.json({
      type: 4,
      data: {
        embeds: [
          infoEmbed(
            'No Collections',
            "You don't have any collections yet.\n\n" +
              'Use `/collection create <name>` to create one!'
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
    return `${index + 1}. **${c.name}** (${dyeCount} dye${dyeCount !== 1 ? 's' : ''})${desc}`;
  });

  return Response.json({
    type: 4,
    data: {
      embeds: [
        {
          title: `Your Collections (${collections.length}/${MAX_COLLECTIONS})`,
          description: collectionList.join('\n'),
          color: 0x5865f2,
          footer: {
            text: 'Use /collection show <name> to view a collection',
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
          errorEmbed('Missing Input', 'Please specify both current name and new name.'),
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
                'Name Too Long',
                `Collection names must be ${MAX_COLLECTION_NAME_LENGTH} characters or less.`
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
              errorEmbed('Not Found', `Could not find a collection named "${name}".`),
            ],
            flags: 64,
          },
        });

      case 'alreadyExists':
        return Response.json({
          type: 4,
          data: {
            embeds: [
              errorEmbed('Name Taken', `A collection named "${newName}" already exists.`),
            ],
            flags: 64,
          },
        });

      default:
        return Response.json({
          type: 4,
          data: {
            embeds: [errorEmbed('Error', 'Could not rename collection. Please try again.')],
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
          'Collection Renamed',
          `Renamed collection from **${name}** to **${newName}**.`
        ),
      ],
      flags: 64,
    },
  });
}
