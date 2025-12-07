/**
 * Preset Rejection Modal Handler
 *
 * Handles the modal submission when a moderator provides a rejection reason.
 *
 * Modal custom_id pattern: preset_reject_modal_{presetId}
 */

import type { Env } from '../../types/env.js';
import { InteractionResponseType } from '../../types/env.js';
import { successEmbed, errorEmbed } from '../../utils/response.js';
import { editMessage } from '../../utils/discord-api.js';
import * as presetApi from '../../services/preset-api.js';
import { STATUS_DISPLAY } from '../../types/preset.js';

// ============================================================================
// Types
// ============================================================================

interface ModalInteraction {
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
    components?: Array<{
      type: number;
      components: Array<{
        type: number;
        custom_id: string;
        value: string;
      }>;
    }>;
  };
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle the rejection reason modal submission
 */
export async function handlePresetRejectionModal(
  interaction: ModalInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  const presetId = customId.replace('preset_reject_modal_', '');
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? 'Moderator';

  if (!presetId || !userId) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'Invalid modal submission.')],
        flags: 64,
      },
    });
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'You do not have permission to reject presets.')],
        flags: 64,
      },
    });
  }

  // Extract rejection reason from modal components
  const reason = extractTextInputValue(interaction.data?.components, 'rejection_reason');

  if (!reason || reason.length < 10) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'Please provide a valid rejection reason (at least 10 characters).')],
        flags: 64,
      },
    });
  }

  // Defer update (we'll edit the original moderation message)
  ctx.waitUntil(processRejection(interaction, env, presetId, userId, userName, reason));

  return Response.json({
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  });
}

async function processRejection(
  interaction: ModalInteraction,
  env: Env,
  presetId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<void> {
  try {
    const preset = await presetApi.rejectPreset(env, presetId, userId, reason);

    // Edit the original moderation message to show rejection status
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            title: `❌ Preset Rejected`,
            description: originalEmbed.description,
            color: STATUS_DISPLAY.rejected.color,
            fields: [
              ...(originalEmbed.fields || []),
              { name: 'Action', value: `Rejected by ${userName}`, inline: true },
              { name: 'Reason', value: reason, inline: false },
            ],
            footer: originalEmbed.footer?.text ? { text: originalEmbed.footer.text } : undefined,
            timestamp: originalEmbed.timestamp,
          },
        ],
        components: [], // Remove buttons
      });
    }

    // Notify submission log channel
    if (env.SUBMISSION_LOG_CHANNEL_ID) {
      const { sendMessage } = await import('../../utils/discord-api.js');
      await sendMessage(env.DISCORD_TOKEN, env.SUBMISSION_LOG_CHANNEL_ID, {
        embeds: [
          {
            title: `❌ ${preset.name} - Rejected`,
            description: `Preset rejected by ${userName}`,
            color: STATUS_DISPLAY.rejected.color,
            fields: [{ name: 'Reason', value: reason }],
            footer: { text: `ID: ${preset.id}` },
          },
        ],
      });
    }
  } catch (error) {
    console.error('Failed to reject preset:', error);

    // Try to update the message with error
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            title: originalEmbed.title,
            description: originalEmbed.description,
            color: originalEmbed.color,
            fields: [
              ...(originalEmbed.fields || []),
              { name: 'Error', value: `Failed to reject: ${error}`, inline: false },
            ],
            footer: originalEmbed.footer?.text ? { text: originalEmbed.footer.text } : undefined,
            timestamp: originalEmbed.timestamp,
          },
        ],
      });
    }
  }
}

/**
 * Modal component structure for type safety
 */
type ModalComponents = Array<{
  type: number;
  components: Array<{
    type: number;
    custom_id: string;
    value: string;
  }>;
}>;

/**
 * Extract a text input value from modal components
 */
function extractTextInputValue(
  components: ModalComponents | undefined,
  customId: string
): string | undefined {
  if (!components) return undefined;

  for (const actionRow of components) {
    if (actionRow.type !== 1) continue; // Not an action row

    for (const component of actionRow.components) {
      if (component.type === 4 && component.custom_id === customId) {
        return component.value;
      }
    }
  }

  return undefined;
}

/**
 * Check if a custom_id is a preset rejection modal
 */
export function isPresetRejectionModal(customId: string): boolean {
  return customId.startsWith('preset_reject_modal_');
}

/**
 * Check if a custom_id is a preset revert modal
 */
export function isPresetRevertModal(customId: string): boolean {
  return customId.startsWith('preset_revert_modal_');
}

/**
 * Handle the revert reason modal submission
 */
export async function handlePresetRevertModal(
  interaction: ModalInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  const presetId = customId.replace('preset_revert_modal_', '');
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? 'Moderator';

  if (!presetId || !userId) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'Invalid modal submission.')],
        flags: 64,
      },
    });
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'You do not have permission to revert presets.')],
        flags: 64,
      },
    });
  }

  // Extract revert reason from modal components
  const reason = extractTextInputValue(interaction.data?.components, 'revert_reason');

  if (!reason || reason.length < 10) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [errorEmbed('Error', 'Please provide a valid revert reason (at least 10 characters).')],
        flags: 64,
      },
    });
  }

  // Defer update (we'll edit the original moderation message)
  ctx.waitUntil(processRevert(interaction, env, presetId, userId, userName, reason));

  return Response.json({
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  });
}

async function processRevert(
  interaction: ModalInteraction,
  env: Env,
  presetId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<void> {
  try {
    const preset = await presetApi.revertPreset(env, presetId, reason, userId);

    // Edit the original moderation message to show revert status
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            title: `↩️ Preset Edit Reverted`,
            description: `The preset has been restored to its previous state.`,
            color: 0x5865f2, // Discord blurple
            fields: [
              { name: 'Preset', value: preset.name, inline: true },
              { name: 'Action', value: `Reverted by ${userName}`, inline: true },
              { name: 'Reason', value: reason, inline: false },
            ],
            footer: { text: `ID: ${preset.id}` },
            timestamp: new Date().toISOString(),
          },
        ],
        components: [], // Remove buttons
      });
    }

    // Notify submission log channel
    if (env.SUBMISSION_LOG_CHANNEL_ID) {
      const { sendMessage } = await import('../../utils/discord-api.js');
      await sendMessage(env.DISCORD_TOKEN, env.SUBMISSION_LOG_CHANNEL_ID, {
        embeds: [
          {
            title: `↩️ ${preset.name} - Edit Reverted`,
            description: `Preset edit reverted by ${userName}`,
            color: 0x5865f2,
            fields: [{ name: 'Reason', value: reason }],
            footer: { text: `ID: ${preset.id}` },
          },
        ],
      });
    }
  } catch (error) {
    console.error('Failed to revert preset:', error);

    // Try to update the message with error
    if (interaction.channel_id && interaction.message?.id) {
      const originalEmbed = interaction.message.embeds?.[0] || {};

      await editMessage(env.DISCORD_TOKEN, interaction.channel_id, interaction.message.id, {
        embeds: [
          {
            title: originalEmbed.title,
            description: originalEmbed.description,
            color: originalEmbed.color,
            fields: [
              ...(originalEmbed.fields || []),
              { name: 'Error', value: `Failed to revert: ${error}`, inline: false },
            ],
            footer: originalEmbed.footer?.text ? { text: originalEmbed.footer.text } : undefined,
            timestamp: originalEmbed.timestamp,
          },
        ],
      });
    }
  }
}
