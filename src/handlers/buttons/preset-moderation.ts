/**
 * Preset Moderation Button Handlers
 *
 * Handles approve/reject buttons on moderation messages.
 * These buttons appear on preset notification messages in the moderation channel.
 *
 * Button custom_id patterns:
 * - preset_approve_{presetId} - Approve a pending preset
 * - preset_reject_{presetId} - Opens rejection reason modal
 */

import type { Env } from '../../types/env.js';
import { InteractionResponseType } from '../../types/env.js';
import { ephemeralResponse, successEmbed, errorEmbed } from '../../utils/response.js';
import { editMessage } from '../../utils/discord-api.js';
import * as presetApi from '../../services/preset-api.js';
import { STATUS_DISPLAY } from '../../types/preset.js';

// ============================================================================
// Types
// ============================================================================

interface ButtonInteraction {
  id: string;
  token: string;
  application_id: string;
  channel_id?: string;
  message?: {
    id: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text?: string };
      timestamp?: string;
    }>;
  };
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
    custom_id?: string;
    component_type?: number;
  };
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle the Approve button click
 */
export async function handlePresetApproveButton(
  interaction: ButtonInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  const presetId = customId.replace('preset_approve_', '');
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? 'Moderator';

  if (!presetId || !userId) {
    return ephemeralResponse('Invalid button interaction.');
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return ephemeralResponse('You do not have permission to approve presets.');
  }

  // Defer update (we'll edit the original message)
  ctx.waitUntil(processApproval(interaction, env, presetId, userId, userName));

  return Response.json({
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  });
}

async function processApproval(
  interaction: ButtonInteraction,
  env: Env,
  presetId: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const preset = await presetApi.approvePreset(env, presetId, userId);

    // Edit the original message to show approval status
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            ...originalEmbed,
            title: `✅ Preset Approved`,
            color: STATUS_DISPLAY.approved.color,
            fields: [
              ...(originalEmbed.fields || []),
              { name: 'Action', value: `Approved by ${userName}`, inline: false },
            ],
          },
        ],
        components: [], // Remove buttons
      });
    }

    // Also notify submission log channel
    if (env.SUBMISSION_LOG_CHANNEL_ID) {
      const { sendMessage } = await import('../../utils/discord-api.js');
      await sendMessage(env.DISCORD_TOKEN, env.SUBMISSION_LOG_CHANNEL_ID, {
        embeds: [
          {
            title: `✅ ${preset.name} - Approved`,
            description: `Preset approved by ${userName}`,
            color: STATUS_DISPLAY.approved.color,
            footer: { text: `ID: ${preset.id}` },
          },
        ],
      });
    }
  } catch (error) {
    console.error('Failed to approve preset:', error);

    // Try to update the message with error
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            ...originalEmbed,
            fields: [
              ...(originalEmbed.fields || []),
              { name: 'Error', value: `Failed to approve: ${error}`, inline: false },
            ],
          },
        ],
      });
    }
  }
}

/**
 * Handle the Reject button click - shows modal for reason
 */
export async function handlePresetRejectButton(
  interaction: ButtonInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  const presetId = customId.replace('preset_reject_', '');
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!presetId || !userId) {
    return ephemeralResponse('Invalid button interaction.');
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return ephemeralResponse('You do not have permission to reject presets.');
  }

  // Show modal for rejection reason
  return Response.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `preset_reject_modal_${presetId}`,
      title: 'Reject Preset',
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 4, // Text Input
              custom_id: 'rejection_reason',
              label: 'Reason for rejection',
              style: 2, // Paragraph (multiline)
              min_length: 10,
              max_length: 500,
              required: true,
              placeholder: 'Please provide a clear reason for rejecting this preset...',
            },
          ],
        },
      ],
    },
  });
}

/**
 * Check if a custom_id is a preset moderation button
 */
export function isPresetModerationButton(customId: string): boolean {
  return customId.startsWith('preset_approve_') || customId.startsWith('preset_reject_');
}
