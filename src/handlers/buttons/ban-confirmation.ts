/**
 * Ban Confirmation Button Handlers
 *
 * Handles Yes/No buttons on the ban confirmation message.
 *
 * Button custom_id patterns:
 * - ban_confirm_{discordId}_{username} - Confirm ban (opens reason modal)
 * - ban_cancel_{discordId} - Cancel ban
 */

import type { Env } from '../../types/env.js';
import { InteractionResponseType } from '../../types/env.js';
import { ephemeralResponse } from '../../utils/response.js';
import type { ExtendedLogger } from '@xivdyetools/logger';
import * as presetApi from '../../services/preset-api.js';

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
 * Handle the ban confirm button click
 *
 * Opens a modal to collect the ban reason.
 */
export async function handleBanConfirmButton(
  interaction: ButtonInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!userId) {
    return ephemeralResponse('Invalid button interaction.');
  }

  // Check moderator status
  if (!presetApi.isModerator(env, userId)) {
    return ephemeralResponse('You do not have permission to ban users.');
  }

  // Parse custom_id: ban_confirm_{discordId}_{username}
  // Remove 'ban_confirm_' prefix and split remaining
  const idPart = customId.replace('ban_confirm_', '');
  const underscoreIndex = idPart.indexOf('_');

  if (underscoreIndex === -1) {
    return ephemeralResponse('Invalid button data.');
  }

  const targetUserId = idPart.substring(0, underscoreIndex);
  const targetUsername = idPart.substring(underscoreIndex + 1);

  if (!targetUserId) {
    return ephemeralResponse('Invalid target user.');
  }

  // Show modal for ban reason
  return Response.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `ban_reason_modal_${targetUserId}_${targetUsername}`,
      title: 'Ban Reason',
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 4, // Text Input
              custom_id: 'ban_reason',
              label: 'Reason for banning this user',
              style: 2, // Paragraph (multiline)
              min_length: 10,
              max_length: 500,
              required: true,
              placeholder: 'Explain why this user is being banned from Preset Palettes...',
            },
          ],
        },
      ],
    },
  });
}

/**
 * Handle the ban cancel button click
 *
 * Updates the message to show cancellation.
 */
export async function handleBanCancelButton(
  interaction: ButtonInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  // Update the ephemeral message to show cancellation
  return Response.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [
        {
          title: '❌ Ban Cancelled',
          description: 'The ban action was cancelled.',
          color: 0x5865f2, // Discord Blurple
        },
      ],
      components: [], // Remove buttons
    },
  });
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Check if a custom_id is a ban confirmation button
 */
export function isBanConfirmButton(customId: string): boolean {
  return customId.startsWith('ban_confirm_');
}

/**
 * Check if a custom_id is a ban cancel button
 */
export function isBanCancelButton(customId: string): boolean {
  return customId.startsWith('ban_cancel_');
}
