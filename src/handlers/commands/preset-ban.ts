/**
 * Preset Ban/Unban Command Handlers
 *
 * Handles /preset ban_user and /preset unban_user subcommands.
 * Restricted to MODERATION_CHANNEL_ID for security.
 *
 * @module handlers/commands/preset-ban
 */

import type { ExtendedLogger } from '@xivdyetools/logger';
import type { Env, DiscordInteraction, InteractionResponseType } from '../../types/env.js';
import { InteractionResponseType as ResponseType } from '../../types/env.js';
import type { Translator } from '../../services/bot-i18n.js';
import {
  deferredResponse,
  ephemeralResponse,
  errorEmbed,
  successEmbed,
  messageResponse,
} from '../../utils/response.js';
import { editOriginalResponse } from '../../utils/discord-api.js';
import * as presetApi from '../../services/preset-api.js';
import * as banService from '../../services/ban-service.js';

// ============================================================================
// Constants
// ============================================================================

/** Base URL for preset share links */
const PRESETS_WEB_URL = 'https://xivdyetools.com';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if command is being used in the moderation channel
 */
function isInModerationChannel(interaction: DiscordInteraction, env: Env): boolean {
  if (!env.MODERATION_CHANNEL_ID) {
    return false;
  }
  return interaction.channel_id === env.MODERATION_CHANNEL_ID;
}

// ============================================================================
// Ban User Subcommand
// ============================================================================

/**
 * Handle /preset ban_user subcommand
 *
 * Shows a confirmation embed with user details and Yes/No buttons.
 * Only works in the moderation channel for moderators.
 */
export async function handleBanUserSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>,
  logger?: ExtendedLogger
): Promise<Response> {
  // Check channel restriction
  if (!isInModerationChannel(interaction, env)) {
    return ephemeralResponse('This command can only be used in the moderation channel.');
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return ephemeralResponse('You do not have permission to ban users.');
  }

  // Get target user from options
  const targetUserId = options?.find((opt) => opt.name === 'user')?.value as string | undefined;
  if (!targetUserId) {
    return ephemeralResponse('Please specify a user to ban.');
  }

  // Get user details for confirmation
  const confirmationData = await banService.getUserForBanConfirmation(
    env.DB,
    targetUserId,
    PRESETS_WEB_URL
  );

  if (!confirmationData) {
    return ephemeralResponse('User not found or has no presets.');
  }

  const { user, recentPresets } = confirmationData;

  // Build preset links (or "None" if no presets)
  const presetLinks =
    recentPresets.length > 0
      ? recentPresets.map((p) => `• [${p.name}](${p.shareUrl})`).join('\n')
      : '_No presets found_';

  // Return confirmation embed with buttons
  return Response.json({
    type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: '⚠️ Confirm User Ban',
          description:
            'Are you sure you want to ban this user from Preset Palettes?\n\n' +
            'This will **hide all their presets** and prevent them from submitting, voting, or editing presets.',
          color: 0xed4245, // Red
          fields: [
            { name: 'Username', value: user.username, inline: true },
            { name: 'Discord ID', value: user.discordId || 'N/A', inline: true },
            { name: 'Total Presets', value: String(user.presetCount), inline: true },
            { name: 'Recent Presets', value: presetLinks, inline: false },
          ],
          footer: {
            text: 'Click "Yes" to proceed with the ban, or "No" to cancel.',
          },
        },
      ],
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 4, // Danger (red)
              label: 'Yes, Ban User',
              emoji: { name: '🔨' },
              custom_id: `ban_confirm_${targetUserId}_${user.username}`,
            },
            {
              type: 2, // Button
              style: 2, // Secondary (gray)
              label: 'Cancel',
              emoji: { name: '❌' },
              custom_id: `ban_cancel_${targetUserId}`,
            },
          ],
        },
      ],
      flags: 64, // Ephemeral
    },
  });
}

// ============================================================================
// Unban User Subcommand
// ============================================================================

/**
 * Handle /preset unban_user subcommand
 *
 * Immediately unbans the user and restores their presets.
 * Only works in the moderation channel for moderators.
 */
export async function handleUnbanUserSubcommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  t: Translator,
  userId: string,
  options?: Array<{ name: string; value?: string | number | boolean }>,
  logger?: ExtendedLogger
): Promise<Response> {
  // Check channel restriction
  if (!isInModerationChannel(interaction, env)) {
    return ephemeralResponse('This command can only be used in the moderation channel.');
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return ephemeralResponse('You do not have permission to unban users.');
  }

  // Get target user from options
  const targetUserId = options?.find((opt) => opt.name === 'user')?.value as string | undefined;
  if (!targetUserId) {
    return ephemeralResponse('Please specify a user to unban.');
  }

  // Defer response for async processing
  const deferResponse = deferredResponse(true); // Ephemeral

  ctx.waitUntil(processUnban(interaction, env, userId, targetUserId, logger));

  return deferResponse;
}

/**
 * Process the unban operation in the background
 */
async function processUnban(
  interaction: DiscordInteraction,
  env: Env,
  moderatorId: string,
  targetUserId: string,
  logger?: ExtendedLogger
): Promise<void> {
  try {
    // Get ban info before unbanning (for username in response)
    const activeBan = await banService.getActiveBan(env.DB, targetUserId);

    if (!activeBan) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [errorEmbed('Error', 'User is not currently banned.')],
      });
      return;
    }

    // Unban the user
    const result = await banService.unbanUser(env.DB, targetUserId, moderatorId);

    if (!result.success) {
      await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
        embeds: [errorEmbed('Error', result.error || 'Failed to unban user.')],
      });
      return;
    }

    // Success response
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [
        {
          title: '✅ User Unbanned',
          description: `Successfully unbanned **${activeBan.username}**.`,
          color: 0x57f287, // Green
          fields: [
            { name: 'User ID', value: targetUserId, inline: true },
            { name: 'Presets Restored', value: String(result.presetsRestored), inline: true },
          ],
          footer: { text: `Unbanned by moderator` },
          timestamp: new Date().toISOString(),
        },
      ],
    });

    if (logger) {
      logger.info('User unbanned', {
        targetUserId,
        moderatorId,
        presetsRestored: result.presetsRestored,
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Failed to unban user', error instanceof Error ? error : undefined);
    }
    await editOriginalResponse(env.DISCORD_CLIENT_ID, interaction.token, {
      embeds: [errorEmbed('Error', 'An unexpected error occurred while unbanning the user.')],
    });
  }
}
