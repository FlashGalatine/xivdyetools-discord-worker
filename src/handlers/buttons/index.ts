/**
 * Button Handlers Index
 *
 * Routes button interactions based on custom_id prefixes.
 */

import type { Env } from '../../types/env.js';
import type { ExtendedLogger } from '@xivdyetools/logger';
import { ephemeralResponse } from '../../utils/response.js';
import { handleCopyHex, handleCopyRgb, handleCopyHsv } from './copy.js';
import {
  handlePresetApproveButton,
  handlePresetRejectButton,
  handlePresetRevertButton,
} from './preset-moderation.js';
import {
  handleBanConfirmButton,
  handleBanCancelButton,
} from './ban-confirmation.js';

// Re-export button creation helpers
export { createCopyButtons, createHexButton } from './copy.js';

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

/**
 * Route button interactions to appropriate handlers
 */
export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';

  if (logger) {
    logger.info('Handling button', { customId });
  }

  // Copy buttons
  if (customId.startsWith('copy_hex_')) {
    return handleCopyHex(interaction);
  }

  if (customId.startsWith('copy_rgb_')) {
    return handleCopyRgb(interaction);
  }

  if (customId.startsWith('copy_hsv_')) {
    return handleCopyHsv(interaction);
  }

  // Preset moderation buttons
  if (customId.startsWith('preset_approve_')) {
    return handlePresetApproveButton(interaction, env, ctx, logger);
  }

  if (customId.startsWith('preset_reject_')) {
    return handlePresetRejectButton(interaction, env, ctx, logger);
  }

  if (customId.startsWith('preset_revert_')) {
    return handlePresetRevertButton(interaction, env, ctx, logger);
  }

  // Ban confirmation buttons
  if (customId.startsWith('ban_confirm_')) {
    return handleBanConfirmButton(interaction, env, ctx, logger);
  }

  if (customId.startsWith('ban_cancel_')) {
    return handleBanCancelButton(interaction, env, ctx, logger);
  }

  // Unknown button
  if (logger) {
    logger.warn(`Unknown button custom_id: ${customId}`);
  }
  return ephemeralResponse('This button is not recognized.');
}
