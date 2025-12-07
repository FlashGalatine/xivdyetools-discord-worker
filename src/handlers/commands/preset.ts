/**
 * /preset Command Handler
 *
 * Manages community preset palettes - browsing, submitting, voting, and moderation.
 * Interacts with the preset API worker for data persistence.
 *
 * Subcommands:
 * - list: Browse presets by category
 * - show: View a specific preset with color visualization
 * - random: Get random preset for inspiration
 * - submit: Create a new community preset
 * - vote: Toggle vote on a preset
 * - moderate: Moderator actions (pending, approve, reject, stats)
 */

import { DyeService, dyeDatabase, type Dye } from 'xivdyetools-core';
import {
  deferredResponse,
  errorEmbed,
  successEmbed,
  infoEmbed,
  messageResponse,
  ephemeralResponse,
} from '../../utils/response.js';
import { editOriginalResponse, sendMessage } from '../../utils/discord-api.js';
import { generatePresetSwatch } from '../../services/svg/preset-swatch.js';
import { renderSvgToPng } from '../../services/svg/renderer.js';
import { getDyeEmoji } from '../../services/emoji.js';
import { createUserTranslator, createTranslator, type Translator } from '../../services/bot-i18n.js';
import { resolveUserLocale, initializeLocale, getLocalizedDyeName, type LocaleCode } from '../../services/i18n.js';
import type { Env } from '../../types/env.js';
import {
  type CommunityPreset,
  type PresetCategory,
  CATEGORY_DISPLAY,
  STATUS_DISPLAY,
  PresetAPIError,
} from '../../types/preset.js';
import * as presetApi from '../../services/preset-api.js';

// Initialize DyeService
const dyeService = new DyeService(dyeDatabase);

// ============================================================================
// Types
// ============================================================================

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  locale?: string;
  member?: {
    user: {
      id: string;
      username: string;
      global_name?: string;
    };
  };
  user?: {
    id: string;
    username: string;
    global_name?: string;
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

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Handles the /preset command with all subcommands
 */
export async function handlePresetCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
  const userName =
    interaction.member?.user?.global_name ||
    interaction.member?.user?.username ||
    interaction.user?.global_name ||
    interaction.user?.username ||
    'Unknown';
  const t = await createUserTranslator(env.KV, userId, interaction.locale);

  // Check if API is enabled
  if (!presetApi.isApiEnabled(env)) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('preset.apiDisabled'))],
      flags: 64,
    });
  }

  // Find the subcommand (type 1 = SUB_COMMAND)
  const options = interaction.data?.options || [];
  const subcommand = options.find((opt) => opt.type === 1);

  if (!subcommand) {
    return ephemeralResponse('Invalid command structure');
  }

  // Route to subcommand handler
  switch (subcommand.name) {
    case 'list':
      return handleListSubcommand(interaction, env, ctx, t, subcommand.options);

    case 'show':
      return handleShowSubcommand(interaction, env, ctx, t, userId, subcommand.options);

    case 'random':
      return handleRandomSubcommand(interaction, env, ctx, t, userId, subcommand.options);

    case 'submit':
      return handleSubmitSubcommand(interaction, env, ctx, t, userId, userName, subcommand.options);

    case 'vote':
      return handleVoteSubcommand(interaction, env, ctx, t, userId, subcommand.options);

    case 'moderate':
      return handleModerateSubcommand(interaction, env, ctx, t, userId, subcommand.options);

    default:
      return ephemeralResponse(`Unknown subcommand: ${subcommand.name}`);
  }
}

// ============================================================================
// Subcommand Handlers
// ============================================================================

/**
 * /preset list - Browse presets by category
 */
async function handleListSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const categoryValue = options?.find((opt) => opt.name === 'category')?.value as string | undefined;
  const sortValue = (options?.find((opt) => opt.name === 'sort')?.value as string) || 'popular';

  // Defer response
  const deferResponse = deferredResponse();

  ctx.waitUntil(
    processListCommand(interaction, env, t, categoryValue, sortValue)
  );

  return deferResponse;
}

async function processListCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  category: string | undefined,
  sort: string
): Promise<void> {
  try {
    const response = await presetApi.getPresets(env, {
      category: category as PresetCategory | undefined,
      sort: sort as 'popular' | 'recent' | 'name',
      status: 'approved',
      limit: 10,
    });

    if (response.presets.length === 0) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          infoEmbed(
            t.t('preset.title'),
            category
              ? t.t('preset.noneInCategory')
              : 'No presets found.'
          ),
        ],
      });
      return;
    }

    // Build preset list
    const categoryDisplay = category
      ? CATEGORY_DISPLAY[category as PresetCategory]
      : null;

    const title = categoryDisplay
      ? `${categoryDisplay.icon} ${categoryDisplay.name}`
      : t.t('preset.title');

    const presetLines = response.presets.map((preset, index) => {
      const catIcon = CATEGORY_DISPLAY[preset.category_id]?.icon || '🎨';
      const author = preset.author_name ? ` by ${preset.author_name}` : '';
      return `**${index + 1}.** ${catIcon} ${preset.name} (${preset.vote_count}★)${author}`;
    });

    const description = [
      presetLines.join('\n'),
      '',
      `📊 Showing ${response.presets.length} of ${response.total} presets`,
      '',
      t.t('preset.useShowTip'),
    ].join('\n');

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title,
          description,
          color: 0x5865f2,
          footer: { text: t.t('common.footer') },
        },
      ],
    });
  } catch (error) {
    console.error('List presets error:', error);
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), 'Failed to load presets.')],
    });
  }
}

/**
 * /preset show - View a specific preset
 */
async function handleShowSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const presetId = options?.find((opt) => opt.name === 'name')?.value as string | undefined;

  if (!presetId) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingInput'))],
      flags: 64,
    });
  }

  // Defer response
  const deferResponse = deferredResponse();
  const locale = await resolveUserLocale(env.KV, userId, interaction.locale);

  ctx.waitUntil(processShowCommand(interaction, env, t, presetId, locale));

  return deferResponse;
}

async function processShowCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  presetId: string,
  locale: LocaleCode
): Promise<void> {
  await initializeLocale(locale);

  try {
    // Get preset by ID
    const preset = await presetApi.getPreset(env, presetId);

    if (!preset) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [errorEmbed(t.t('common.error'), t.t('preset.notFound'))],
      });
      return;
    }

    await sendPresetEmbed(interaction, env, t, preset, locale);
  } catch (error) {
    console.error('Show preset error:', error);
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), 'Failed to load preset.')],
    });
  }
}

/**
 * /preset random - Get random preset
 */
async function handleRandomSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const category = options?.find((opt) => opt.name === 'category')?.value as string | undefined;

  // Defer response
  const deferResponse = deferredResponse();
  const locale = await resolveUserLocale(env.KV, userId, interaction.locale);

  ctx.waitUntil(processRandomCommand(interaction, env, t, category, locale));

  return deferResponse;
}

async function processRandomCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  category: string | undefined,
  locale: LocaleCode
): Promise<void> {
  await initializeLocale(locale);

  try {
    const preset = await presetApi.getRandomPreset(env, category);

    if (!preset) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          infoEmbed(
            t.t('preset.randomTitle'),
            category ? t.t('preset.noneInCategory') : 'No presets found.'
          ),
        ],
      });
      return;
    }

    await sendPresetEmbed(interaction, env, t, preset, locale);
  } catch (error) {
    console.error('Random preset error:', error);
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), 'Failed to load random preset.')],
    });
  }
}

/**
 * /preset submit - Create a new preset
 */
async function handleSubmitSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  userName: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  // Extract all options
  const presetName = options?.find((opt) => opt.name === 'preset_name')?.value as string;
  const description = options?.find((opt) => opt.name === 'description')?.value as string;
  const category = options?.find((opt) => opt.name === 'category')?.value as string;
  const tagsRaw = options?.find((opt) => opt.name === 'tags')?.value as string | undefined;

  // Collect dye names (dye1-dye5)
  const dyeNames: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const dyeValue = options?.find((opt) => opt.name === `dye${i}`)?.value as string | undefined;
    if (dyeValue) {
      dyeNames.push(dyeValue);
    }
  }

  // Validate required fields
  if (!presetName || !description || !category) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingInput'))],
      flags: 64,
    });
  }

  // Validate dye count
  if (dyeNames.length < 2) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('preset.notEnoughDyes'))],
      flags: 64,
    });
  }

  // Resolve dye names to IDs
  const dyeIds: number[] = [];
  for (const name of dyeNames) {
    const dyes = dyeService.searchByName(name);
    if (dyes.length > 0) {
      dyeIds.push(dyes[0].id);
    } else {
      return messageResponse({
        embeds: [errorEmbed(t.t('common.error'), t.t('preset.invalidDye'))],
        flags: 64,
      });
    }
  }

  // Parse tags
  const tags = tagsRaw
    ? tagsRaw.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0).slice(0, 10)
    : [];

  // Defer response
  const deferResponse = deferredResponse();

  ctx.waitUntil(
    processSubmitCommand(interaction, env, t, userId, userName, {
      name: presetName,
      description,
      category_id: category as PresetCategory,
      dyes: dyeIds,
      tags,
    })
  );

  return deferResponse;
}

async function processSubmitCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  userId: string,
  userName: string,
  submission: {
    name: string;
    description: string;
    category_id: PresetCategory;
    dyes: number[];
    tags: string[];
  }
): Promise<void> {
  try {
    const response = await presetApi.submitPreset(env, submission, userId, userName);

    // Handle duplicate
    if (response.duplicate) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [
          {
            title: `⚠️ ${t.t('preset.duplicateExists')}`,
            description: [
              `A preset with the same dyes already exists:`,
              `**"${response.duplicate.name}"** by ${response.duplicate.author_name || 'Official'}`,
              `(${response.duplicate.vote_count}★)`,
              '',
              response.vote_added ? `✅ ${t.t('preset.duplicateVoted')}` : '',
            ].join('\n'),
            color: 0xf5a623,
          },
        ],
      });
      return;
    }

    // Handle success
    const preset = response.preset!;
    const isApproved = response.moderation_status === 'approved';

    const embed = {
      title: isApproved
        ? `✅ ${t.t('preset.submitted')}`
        : `⏳ ${t.t('preset.submitted')}`,
      description: isApproved
        ? t.t('preset.submittedApproved')
        : t.t('preset.submittedPending'),
      color: isApproved ? 0x57f287 : 0xfee75c,
      fields: [
        { name: 'Name', value: preset.name, inline: true },
        { name: 'Category', value: CATEGORY_DISPLAY[preset.category_id]?.name || preset.category_id, inline: true },
        { name: 'Dyes', value: `${preset.dyes.length} colors`, inline: true },
      ],
      footer: { text: t.t('common.footer') },
    };

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [embed],
    });

    // Log to submission channel if approved
    if (isApproved && env.SUBMISSION_LOG_CHANNEL_ID) {
      await notifySubmissionChannel(env, preset, 'approved');
    }

    // Notify moderation channel if pending
    if (!isApproved && env.MODERATION_CHANNEL_ID) {
      await notifyModerationChannel(env, preset);
    }
  } catch (error) {
    console.error('Submit preset error:', error);
    const message = error instanceof PresetAPIError
      ? error.message
      : 'Failed to submit preset.';

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), message)],
    });
  }
}

/**
 * /preset vote - Toggle vote on a preset
 */
async function handleVoteSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  const presetId = options?.find((opt) => opt.name === 'preset')?.value as string | undefined;

  if (!presetId) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('errors.missingInput'))],
      flags: 64,
    });
  }

  // Defer response
  const deferResponse = deferredResponse();

  ctx.waitUntil(processVoteCommand(interaction, env, t, userId, presetId));

  return deferResponse;
}

async function processVoteCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  userId: string,
  presetId: string
): Promise<void> {
  try {
    // Check if already voted
    const alreadyVoted = await presetApi.hasVoted(env, presetId, userId);

    let response;
    let actionMessage: string;

    if (alreadyVoted) {
      // Remove vote
      response = await presetApi.removeVote(env, presetId, userId);
      actionMessage = t.t('preset.voteRemoved');
    } else {
      // Add vote
      response = await presetApi.voteForPreset(env, presetId, userId);
      actionMessage = t.t('preset.voteAdded');
    }

    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        successEmbed(
          actionMessage,
          t.t('preset.currentVotes', { count: response.new_vote_count })
        ),
      ],
    });
  } catch (error) {
    console.error('Vote error:', error);
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), 'Failed to process vote.')],
    });
  }
}

/**
 * /preset moderate - Moderator actions
 */
async function handleModerateSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>
): Promise<Response> {
  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return messageResponse({
      embeds: [errorEmbed(t.t('common.error'), t.t('preset.moderation.accessDenied'))],
      flags: 64,
    });
  }

  const action = options?.find((opt) => opt.name === 'action')?.value as string;
  const presetId = options?.find((opt) => opt.name === 'preset_id')?.value as string | undefined;
  const reason = options?.find((opt) => opt.name === 'reason')?.value as string | undefined;

  if (!action) {
    return ephemeralResponse('Missing action');
  }

  // Defer response
  const deferResponse = deferredResponse();

  ctx.waitUntil(
    processModerateCommand(interaction, env, t, userId, action, presetId, reason)
  );

  return deferResponse;
}

async function processModerateCommand(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  userId: string,
  action: string,
  presetId?: string,
  reason?: string
): Promise<void> {
  try {
    switch (action) {
      case 'pending': {
        const presets = await presetApi.getPendingPresets(env, userId);

        if (presets.length === 0) {
          await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
            embeds: [
              successEmbed(
                t.t('preset.moderation.pendingQueue'),
                t.t('preset.moderation.noPending')
              ),
            ],
          });
          return;
        }

        const presetLines = presets.slice(0, 10).map((preset, i) => {
          return `**${i + 1}.** ${preset.name} by ${preset.author_name || 'Unknown'}\n   ID: \`${preset.id}\``;
        });

        await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
          embeds: [
            {
              title: `📋 ${t.t('preset.moderation.pendingQueue')}`,
              description: [
                t.t('preset.moderation.pendingCount', { count: presets.length }),
                '',
                presetLines.join('\n\n'),
              ].join('\n'),
              color: 0xfee75c,
              footer: { text: 'Use /preset moderate approve <id> or reject <id> <reason>' },
            },
          ],
        });
        break;
      }

      case 'approve': {
        if (!presetId) {
          await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
            embeds: [errorEmbed(t.t('common.error'), t.t('preset.moderation.missingId'))],
          });
          return;
        }

        const preset = await presetApi.approvePreset(env, presetId, userId, reason);

        await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
          embeds: [
            successEmbed(
              t.t('preset.moderation.approved'),
              t.t('preset.moderation.approvedDesc', { name: preset.name })
            ),
          ],
        });

        // Notify submission log
        if (env.SUBMISSION_LOG_CHANNEL_ID) {
          await notifySubmissionChannel(env, preset, 'approved');
        }
        break;
      }

      case 'reject': {
        if (!presetId) {
          await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
            embeds: [errorEmbed(t.t('common.error'), t.t('preset.moderation.missingId'))],
          });
          return;
        }

        if (!reason) {
          await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
            embeds: [errorEmbed(t.t('common.error'), t.t('preset.moderation.missingReason'))],
          });
          return;
        }

        const preset = await presetApi.rejectPreset(env, presetId, userId, reason);

        await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
          embeds: [
            {
              title: `❌ ${t.t('preset.moderation.rejected')}`,
              description: t.t('preset.moderation.rejectedDesc', { name: preset.name }),
              color: 0xed4245,
              fields: [{ name: 'Reason', value: reason }],
            },
          ],
        });
        break;
      }

      case 'stats': {
        const stats = await presetApi.getModerationStats(env, userId);

        await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
          embeds: [
            {
              title: `📊 ${t.t('preset.moderation.stats')}`,
              color: 0x5865f2,
              fields: [
                { name: '🟡 Pending', value: String(stats.pending), inline: true },
                { name: '🟢 Approved', value: String(stats.approved), inline: true },
                { name: '🔴 Rejected', value: String(stats.rejected), inline: true },
                { name: '🟠 Flagged', value: String(stats.flagged), inline: true },
                { name: '📈 Actions (7d)', value: String(stats.actions_last_week), inline: true },
              ],
            },
          ],
        });
        break;
      }

      default:
        await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
          embeds: [errorEmbed(t.t('common.error'), `Unknown action: ${action}`)],
        });
    }
  } catch (error) {
    console.error('Moderate error:', error);
    const message = error instanceof PresetAPIError ? error.message : 'Moderation action failed.';
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed(t.t('common.error'), message)],
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send a preset embed with color swatch image
 */
async function sendPresetEmbed(
  interaction: DiscordInteraction,
  env: Env,
  t: Translator,
  preset: CommunityPreset,
  locale: LocaleCode
): Promise<void> {
  // Resolve dye IDs to Dye objects
  const dyes: (Dye | null)[] = preset.dyes.map((dyeId) => {
    return dyeService.getDyeById(dyeId) || null;
  });

  // Generate SVG swatch
  const svg = generatePresetSwatch({
    name: preset.name,
    description: preset.description,
    category: preset.category_id,
    dyes,
    authorName: preset.author_name,
    voteCount: preset.vote_count,
  });

  // Render to PNG
  const pngBuffer = await renderSvgToPng(svg, { scale: 2 });

  // Build dye list with emojis
  const dyeList = dyes
    .filter((d): d is Dye => d !== null)
    .map((dye) => {
      const emoji = getDyeEmoji(dye.id);
      const emojiPrefix = emoji ? `${emoji} ` : '';
      const localizedName = getLocalizedDyeName(dye.itemID, dye.name);
      return `${emojiPrefix}${localizedName} (\`${dye.hex.toUpperCase()}\`)`;
    })
    .join('\n');

  const categoryDisplay = CATEGORY_DISPLAY[preset.category_id];
  const author = preset.author_name ? `by ${preset.author_name}` : 'Official';

  await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
    embeds: [
      {
        title: `${categoryDisplay?.icon || '🎨'} ${preset.name}`,
        description: [
          preset.description,
          '',
          `**${t.t('preset.colors')}:**`,
          dyeList,
          '',
          preset.tags.length > 0 ? `**${t.t('preset.tags')}:** ${preset.tags.join(', ')}` : '',
        ].filter(Boolean).join('\n'),
        color: 0x5865f2,
        image: { url: 'attachment://preset.png' },
        fields: [
          { name: t.t('preset.author'), value: author, inline: true },
          { name: t.t('preset.votes'), value: `${preset.vote_count}★`, inline: true },
        ],
        footer: { text: t.t('common.footer') },
      },
    ],
    file: {
      name: 'preset.png',
      data: pngBuffer,
      contentType: 'image/png',
    },
  });
}

/**
 * Notify submission log channel about a new/approved preset
 */
async function notifySubmissionChannel(
  env: Env,
  preset: CommunityPreset,
  status: 'approved' | 'pending'
): Promise<void> {
  if (!env.SUBMISSION_LOG_CHANNEL_ID) return;

  const categoryDisplay = CATEGORY_DISPLAY[preset.category_id];
  const statusDisplay = STATUS_DISPLAY[status];

  try {
    await sendMessage(env.DISCORD_TOKEN, env.SUBMISSION_LOG_CHANNEL_ID, {
      embeds: [
        {
          title: `${statusDisplay.icon} New Preset: ${preset.name}`,
          description: preset.description,
          color: statusDisplay.color,
          fields: [
            { name: 'Category', value: categoryDisplay?.name || preset.category_id, inline: true },
            { name: 'Author', value: preset.author_name || 'Unknown', inline: true },
            { name: 'Dyes', value: `${preset.dyes.length} colors`, inline: true },
          ],
          footer: { text: `ID: ${preset.id}` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    console.error('Failed to notify submission channel:', error);
  }
}

/**
 * Notify moderation channel about a pending preset
 */
async function notifyModerationChannel(
  env: Env,
  preset: CommunityPreset
): Promise<void> {
  if (!env.MODERATION_CHANNEL_ID) return;

  const categoryDisplay = CATEGORY_DISPLAY[preset.category_id];

  try {
    await sendMessage(env.DISCORD_TOKEN, env.MODERATION_CHANNEL_ID, {
      embeds: [
        {
          title: `🟡 Preset Pending Review`,
          description: [
            `**Name:** ${preset.name}`,
            `**Description:** ${preset.description}`,
            `**Author:** ${preset.author_name} (<@${preset.author_discord_id}>)`,
            `**Category:** ${categoryDisplay?.name || preset.category_id}`,
            `**Dyes:** ${preset.dyes.length} colors`,
          ].join('\n'),
          color: 0xfee75c,
          footer: { text: `ID: ${preset.id}` },
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 3, // Success (green)
              label: 'Approve',
              custom_id: `preset_approve_${preset.id}`,
              emoji: { name: '✅' },
            },
            {
              type: 2, // Button
              style: 4, // Danger (red)
              label: 'Reject',
              custom_id: `preset_reject_${preset.id}`,
              emoji: { name: '❌' },
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('Failed to notify moderation channel:', error);
  }
}
