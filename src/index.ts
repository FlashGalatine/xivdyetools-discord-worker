/**
 * XIV Dye Tools Discord Bot - Cloudflare Workers Edition
 *
 * This worker handles Discord interactions via HTTP instead of the Gateway WebSocket.
 * Discord sends POST requests to this endpoint for all slash commands, buttons, etc.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ExtendedLogger } from '@xivdyetools/logger';
import type { Env, InteractionType as IType } from './types/env.js';
import { InteractionType, InteractionResponseType } from './types/env.js';
import { verifyDiscordRequest, unauthorizedResponse, badRequestResponse, timingSafeEqual } from './utils/verify.js';
import { pongResponse, ephemeralResponse, messageResponse } from './utils/response.js';
import {
  handleAboutCommand,
  handleHarmonyCommand,
  handleDyeCommand,
  handleMixerCommand,
  handleMatchCommand,
  handleMatchImageCommand,
  handleAccessibilityCommand,
  handleManualCommand,
  handleComparisonCommand,
  handleLanguageCommand,
  handleFavoritesCommand,
  handleCollectionCommand,
  handlePresetCommand,
  handleStatsCommand,
} from './handlers/commands/index.js';
import { checkRateLimit, formatRateLimitMessage } from './services/rate-limiter.js';
import { trackCommandWithKV } from './services/analytics.js';
import { getCollections } from './services/user-storage.js';
import { handleButtonInteraction } from './handlers/buttons/index.js';
import {
  handlePresetRejectionModal,
  isPresetRejectionModal,
  handlePresetRevertModal,
  isPresetRevertModal,
} from './handlers/modals/index.js';
import { handleBanReasonModal, isBanReasonModal } from './handlers/modals/ban-reason.js';
import { DyeService, dyeDatabase } from '@xivdyetools/core';
import * as presetApi from './services/preset-api.js';
import * as banService from './services/ban-service.js';
import { sendMessage } from './utils/discord-api.js';
import { STATUS_DISPLAY, type PresetNotificationPayload } from './types/preset.js';
import { getLocalizedDyeName } from './services/i18n.js';
import { validateEnv, logValidationErrors } from './utils/env-validation.js';
import { requestIdMiddleware, getRequestId, type RequestIdVariables } from './middleware/request-id.js';
import { loggerMiddleware, getLogger } from './middleware/logger.js';

// Initialize DyeService for autocomplete
const dyeService = new DyeService(dyeDatabase);

function formatDyesForEmbed(dyeIds: number[]): string {
  return dyeIds
    .map((dyeId) => {
      const dye = dyeService.getDyeById(dyeId);
      if (!dye) return dyeId.toString();
      return getLocalizedDyeName(dye.itemID, dye.name);
    })
    .join(', ');
}

// Define context variables type
type Variables = RequestIdVariables & {
  logger: ExtendedLogger;
};

// Create Hono app with environment type
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Track if we've validated env in this isolate
let envValidated = false;

// Enable CORS for development
app.use('*', cors());

// Request ID middleware (must be early for tracing)
app.use('*', requestIdMiddleware);

// Structured request logger (after request ID for correlation)
app.use('*', loggerMiddleware);

// Environment validation middleware
// Validates required env vars once per isolate and caches result
// Note: Discord worker doesn't have an ENVIRONMENT var, so validation always logs warnings
app.use('*', async (c, next) => {
  if (!envValidated) {
    const result = validateEnv(c.env);
    envValidated = true;
    if (!result.valid) {
      logValidationErrors(result.errors);
      // Discord worker should still try to handle requests even with missing optional vars
      // Only fail hard if critical secrets (DISCORD_TOKEN, DISCORD_PUBLIC_KEY) are missing
      if (result.errors.some(e => e.includes('DISCORD_TOKEN') || e.includes('DISCORD_PUBLIC_KEY'))) {
        return c.json({ error: 'Service misconfigured' }, 500);
      }
    }
  }
  await next();
});

// Security headers middleware
// Applies to all responses (after handler execution)
app.use('*', async (c, next) => {
  await next();
  // Prevent MIME-type sniffing attacks
  c.header('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking by denying iframe embedding
  c.header('X-Frame-Options', 'DENY');
  // Enforce HTTPS (Discord bots always use HTTPS endpoints)
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'xivdyetools-discord-worker',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Webhook endpoint for preset submissions from web app
 *
 * Receives notifications when presets are submitted via the web app.
 * Posts to moderation channel (if pending) and submission log channel.
 *
 * @see PresetNotificationPayload for expected body format
 */
app.post('/webhooks/preset-submission', async (c) => {
  const env = c.env;

  // Verify webhook secret using constant-time comparison to prevent timing attacks
  const authHeader = c.req.header('Authorization') || '';
  const expectedAuth = `Bearer ${env.INTERNAL_WEBHOOK_SECRET}`;
  const logger = c.get('logger');

  // DISCORD-CRITICAL-003: Separate checks to prevent timing oracle attack
  // Check if secret is configured first (this is a configuration error, not an auth attempt)
  if (!env.INTERNAL_WEBHOOK_SECRET) {
    logger.error('Webhook secret not configured');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Always use timing-safe comparison for auth verification
  if (!(await timingSafeEqual(authHeader, expectedAuth))) {
    logger.error('Webhook authentication failed');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: PresetNotificationPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (payload.type !== 'submission' || !payload.preset) {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  const { preset } = payload;
  const logger = c.get('logger');
  logger.info('Received preset webhook', { presetName: preset.name, presetId: preset.id, source: preset.source });

  // Pending presets go to moderation channel with approve/reject buttons
  if (preset.status === 'pending' && env.MODERATION_CHANNEL_ID) {
    await sendMessage(env.DISCORD_TOKEN, env.MODERATION_CHANNEL_ID, {
      embeds: [
        {
          title: '🟡 Preset Awaiting Moderation',
          description: `**${preset.name}**\n\n${preset.description}`,
          color: STATUS_DISPLAY.pending.color,
          fields: [
            { name: 'Category', value: preset.category_id, inline: true },
            { name: 'Author', value: preset.author_name || 'Unknown', inline: true },
            { name: 'Source', value: preset.source === 'web' ? 'Web App' : 'Discord', inline: true },
            { name: 'Dyes', value: formatDyesForEmbed(preset.dyes), inline: false },
            ...(preset.tags.length > 0 ? [{ name: 'Tags', value: preset.tags.join(', '), inline: false }] : []),
          ],
          footer: { text: `ID: ${preset.id}` },
          timestamp: preset.created_at,
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
              emoji: { name: '✅' },
              custom_id: `preset_approve_${preset.id}`,
            },
            {
              type: 2, // Button
              style: 4, // Danger (red)
              label: 'Reject',
              emoji: { name: '❌' },
              custom_id: `preset_reject_${preset.id}`,
            },
          ],
        },
      ],
    });
  }

  // Auto-approved presets go directly to submission log channel
  if (preset.status === 'approved' && env.SUBMISSION_LOG_CHANNEL_ID) {
    await sendMessage(env.DISCORD_TOKEN, env.SUBMISSION_LOG_CHANNEL_ID, {
      embeds: [
        {
          title: '🟢 New Preset Published',
          description: `**${preset.name}**\n\n${preset.description}`,
          color: STATUS_DISPLAY.approved.color,
          fields: [
            { name: 'Category', value: preset.category_id, inline: true },
            { name: 'Author', value: preset.author_name || 'Unknown', inline: true },
            { name: 'Source', value: preset.source === 'web' ? 'Web App' : 'Discord', inline: true },
            { name: 'Dyes', value: formatDyesForEmbed(preset.dyes), inline: false },
            ...(preset.tags.length > 0 ? [{ name: 'Tags', value: preset.tags.join(', '), inline: false }] : []),
          ],
          footer: { text: `ID: ${preset.id} • Auto-approved` },
          timestamp: preset.created_at,
        },
      ],
    });
  }

  return c.json({ success: true });
});

/**
 * Main Discord interactions endpoint
 *
 * All Discord interactions (slash commands, buttons, etc.) are sent here as POST requests.
 * We must:
 * 1. Verify the request signature (Ed25519)
 * 2. Handle PING requests with PONG (required for endpoint validation)
 * 3. Route to appropriate command handlers
 */
app.post('/', async (c) => {
  const env = c.env;

  // Verify the request signature
  const { isValid, body, error } = await verifyDiscordRequest(
    c.req.raw,
    env.DISCORD_PUBLIC_KEY
  );

  const logger = c.get('logger');

  if (!isValid) {
    logger.error('Signature verification failed', undefined, { error: error || 'Unknown error' });
    return unauthorizedResponse(error);
  }

  // Parse the interaction
  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return badRequestResponse('Invalid JSON body');
  }

  // Handle PING (required for Discord endpoint verification)
  if (interaction.type === InteractionType.PING) {
    logger.info('Received PING, responding with PONG');
    return pongResponse();
  }

  // Handle Application Commands (slash commands)
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction, env, c.executionCtx, logger);
  }

  // Handle Autocomplete
  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    return handleAutocomplete(interaction, env, logger);
  }

  // Handle Message Components (buttons, select menus)
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction, env, c.executionCtx, logger);
  }

  // Handle Modal Submissions
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModal(interaction, env, c.executionCtx, logger);
  }

  // Unknown interaction type
  logger.warn('Unknown interaction type', { interactionType: interaction.type });
  return badRequestResponse(`Unknown interaction type: ${interaction.type}`);
});

/**
 * Handle slash commands
 */
async function handleCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger: ExtendedLogger
): Promise<Response> {
  const commandName = interaction.data?.name;
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  logger.info('Handling command', { command: commandName, userId });

  // Check rate limit (skip for utility commands)
  if (userId && commandName && !['about', 'manual', 'stats'].includes(commandName)) {
    const rateLimitResult = await checkRateLimit(env.KV, userId, commandName);
    if (!rateLimitResult.allowed) {
      logger.info('User rate limited', { userId, command: commandName });
      return ephemeralResponse(formatRateLimitMessage(rateLimitResult));
    }
  }

  // DISCORD-CRITICAL-001: Track analytics AFTER command execution with actual success status
  let success = true;
  let response: Response;

  try {
    // Route to specific command handlers
    switch (commandName) {
      case 'about':
        response = await handleAboutCommand(interaction, env, ctx);
        break;

      case 'harmony':
        response = await handleHarmonyCommand(interaction, env, ctx, logger);
        break;

      case 'dye':
        response = await handleDyeCommand(interaction, env, ctx);
        break;

      case 'mixer':
        response = await handleMixerCommand(interaction, env, ctx, logger);
        break;

      case 'match':
        response = await handleMatchCommand(interaction, env, ctx);
        break;

      case 'match_image':
        response = await handleMatchImageCommand(interaction, env, ctx, logger);
        break;

      case 'accessibility':
        response = await handleAccessibilityCommand(interaction, env, ctx, logger);
        break;

      case 'manual':
        response = await handleManualCommand(interaction, env, ctx);
        break;

      case 'comparison':
        response = await handleComparisonCommand(interaction, env, ctx, logger);
        break;

      case 'language':
        response = await handleLanguageCommand(interaction, env, ctx);
        break;

      case 'favorites':
        response = await handleFavoritesCommand(interaction, env, ctx);
        break;

      case 'collection':
        response = await handleCollectionCommand(interaction, env, ctx);
        break;

      case 'preset':
        response = await handlePresetCommand(interaction, env, ctx, logger);
        break;

      case 'stats':
        response = await handleStatsCommand(interaction, env, ctx, logger);
        break;

      default:
        // Command not yet implemented
        response = ephemeralResponse(
          `The \`/${commandName}\` command is not yet implemented in the Workers version.`
        );
        break;
    }
  } catch (error) {
    success = false;
    logger.error('Command execution failed', error instanceof Error ? error : undefined, { command: commandName });
    response = ephemeralResponse('An error occurred while processing your command.');
  } finally {
    // Track command usage with actual success status (fire-and-forget)
    if (userId && commandName) {
      ctx.waitUntil(
        trackCommandWithKV(env, {
          commandName,
          userId,
          guildId: interaction.guild_id,
          success,
        }).catch((error) => {
          logger.error('Analytics tracking failed', error instanceof Error ? error : undefined, { error: String(error) });
        })
      );
    }
  }

  return response;
}

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(
  interaction: DiscordInteraction,
  env: Env,
  logger: ExtendedLogger
): Promise<Response> {
  const commandName = interaction.data?.name;
  const options = interaction.data?.options || [];

  // Find the focused option (the one the user is currently typing in)
  let focusedOption: { name: string; value?: string | number | boolean; focused?: boolean } | undefined;
  let subcommandName: string | undefined;

  // Check top-level options first
  focusedOption = options.find((opt) => opt.focused);

  // If not found, check nested options (for subcommands)
  if (!focusedOption) {
    for (const opt of options) {
      if (opt.options) {
        subcommandName = opt.name;
        focusedOption = opt.options.find((subOpt) => subOpt.focused);
        if (focusedOption) break;
      }
    }
  }

  const query = (focusedOption?.value as string) || '';
  let choices: Array<{ name: string; value: string }> = [];

  // Handle collection command autocomplete
  if (commandName === 'collection') {
    const focusedName = focusedOption?.name;

    // Collection name autocomplete (for add, remove, show, delete, rename subcommands)
    if (focusedName === 'name') {
      choices = await getCollectionAutocompleteChoices(interaction, env, query, logger);
    }
    // Dye autocomplete (for add/remove subcommands)
    else if (focusedName === 'dye') {
      choices = getDyeAutocompleteChoices(query);
    }
  }
  // Handle preset command autocomplete
  else if (commandName === 'preset') {
    const focusedName = focusedOption?.name;

    // Preset name autocomplete (for show, vote, moderate, edit subcommands)
    if (focusedName === 'name' || focusedName === 'preset' || focusedName === 'preset_id') {
      // For edit subcommand, show only user's own presets
      if (subcommandName === 'edit') {
        const userId = interaction.member?.user?.id ?? interaction.user?.id;
        if (userId) {
          choices = await getMyPresetsAutocompleteChoices(env, userId, query, logger);
        }
      }
      // For moderate subcommand, search pending presets
      else if (subcommandName === 'moderate') {
        choices = await presetApi.searchPresetsForAutocomplete(env, query, { status: 'pending' });
      }
      // For other subcommands (show, vote), search approved presets
      else {
        choices = await presetApi.searchPresetsForAutocomplete(env, query, { status: 'approved' });
      }
    }
    // Dye autocomplete (for submit and edit subcommands)
    else if (focusedName?.startsWith('dye')) {
      choices = getDyeAutocompleteChoices(query);
    }
    // User autocomplete for ban_user/unban_user subcommands
    else if (focusedName === 'user') {
      if (subcommandName === 'ban_user') {
        choices = await getBanUserAutocompleteChoices(env, query, logger);
      } else if (subcommandName === 'unban_user') {
        choices = await getUnbanUserAutocompleteChoices(env, query, logger);
      }
    }
  }
  // Default: Dye autocomplete for other commands
  else {
    choices = getDyeAutocompleteChoices(query);
  }

  return Response.json({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices },
  });
}

/**
 * Get collection autocomplete choices for the given query
 *
 * DISCORD-CRITICAL-002: Note on race conditions
 * This function reads collections without a locking mechanism. If a user modifies
 * their collection while autocomplete is running, they may see slightly stale dye counts.
 * This is acceptable for autocomplete UX - the user can refresh to see updated counts.
 * A full fix would require adding version/etag to collection metadata for optimistic
 * concurrency, which is beyond the scope of a quick fix.
 */
async function getCollectionAutocompleteChoices(
  interaction: DiscordInteraction,
  env: Env,
  query: string,
  logger: ExtendedLogger
): Promise<Array<{ name: string; value: string }>> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!userId) {
    return [];
  }

  try {
    const collections = await getCollections(env.KV, userId);

    if (collections.length === 0) {
      return [];
    }

    // Filter collections by query (case-insensitive)
    const lowerQuery = query.toLowerCase();
    const filtered = query.length > 0
      ? collections.filter((c) => c.name.toLowerCase().includes(lowerQuery))
      : collections;

    // Return up to 25 choices (Discord's maximum)
    return filtered.slice(0, 25).map((c) => ({
      name: `${c.name} (${c.dyes.length} dyes)`,
      value: c.name,
    }));
  } catch (error) {
    logger.error('Failed to get collection autocomplete choices', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get dye autocomplete choices for the given query
 */
function getDyeAutocompleteChoices(query: string): Array<{ name: string; value: string }> {
  if (query.length >= 1) {
    const matchingDyes = dyeService.searchByName(query);

    // Filter out Facewear dyes and limit to 25 (Discord's maximum)
    return matchingDyes
      .filter((dye) => dye.category !== 'Facewear')
      .slice(0, 25)
      .map((dye) => ({
        name: `${dye.name} (${dye.hex.toUpperCase()})`,
        value: dye.name,
      }));
  } else {
    // Show popular/common dyes when no query (excluding Facewear)
    const allDyes = dyeService.getAllDyes();
    return allDyes
      .filter((dye) => dye.category !== 'Facewear')
      .slice(0, 25)
      .map((dye) => ({
        name: `${dye.name} (${dye.hex.toUpperCase()})`,
        value: dye.name,
      }));
  }
}

/**
 * Get user's own presets for autocomplete (for edit subcommand)
 */
async function getMyPresetsAutocompleteChoices(
  env: Env,
  userId: string,
  query: string,
  logger: ExtendedLogger
): Promise<Array<{ name: string; value: string }>> {
  try {
    const presets = await presetApi.getMyPresets(env, userId);

    if (presets.length === 0) {
      return [];
    }

    // Filter by query (case-insensitive)
    const lowerQuery = query.toLowerCase();
    const filtered = query.length > 0
      ? presets.filter((p) => p.name.toLowerCase().includes(lowerQuery))
      : presets;

    // Return up to 25 choices (Discord's maximum)
    return filtered.slice(0, 25).map((preset) => ({
      // Format: "Name (status)" to help user identify pending edits
      name: preset.status === 'approved'
        ? preset.name
        : `${preset.name} (${preset.status})`,
      value: preset.id,
    }));
  } catch (error) {
    logger.error('Failed to get user presets for autocomplete', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get users for ban_user autocomplete (search preset authors)
 */
async function getBanUserAutocompleteChoices(
  env: Env,
  query: string,
  logger: ExtendedLogger
): Promise<Array<{ name: string; value: string }>> {
  try {
    const users = await banService.searchPresetAuthors(env.DB, query);

    return users.map((user) => ({
      // Format: "Username (discord:123456789) - 5 presets"
      name: `${user.username} (discord:${user.discordId}) - ${user.presetCount} presets`,
      value: user.discordId,
    }));
  } catch (error) {
    logger.error('Failed to get ban user autocomplete', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get banned users for unban_user autocomplete
 */
async function getUnbanUserAutocompleteChoices(
  env: Env,
  query: string,
  logger: ExtendedLogger
): Promise<Array<{ name: string; value: string }>> {
  try {
    const users = await banService.searchBannedUsers(env.DB, query);

    return users.map((user) => {
      const idSuffix = user.discordId
        ? `discord:${user.discordId}`
        : `xivauth:${user.xivAuthId}`;
      return {
        name: `${user.username} (${idSuffix})`,
        value: user.discordId || user.xivAuthId || '',
      };
    });
  } catch (error) {
    logger.error('Failed to get unban user autocomplete', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Handle button/select menu interactions
 */
async function handleComponent(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger: ExtendedLogger
): Promise<Response> {
  const customId = interaction.data?.custom_id;
  const componentType = interaction.data?.component_type;

  logger.info('Handling component', { customId, componentType });

  // Buttons have component_type 2
  if (componentType === 2) {
    return handleButtonInteraction(interaction, env, ctx, logger);
  }

  // Select menus and other components
  return ephemeralResponse('This component type is not yet supported.');
}

/**
 * Handle modal submissions
 */
async function handleModal(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext,
  logger: ExtendedLogger
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  logger.info('Handling modal', { customId });

  // Route preset rejection modal
  if (isPresetRejectionModal(customId)) {
    return handlePresetRejectionModal(interaction, env, ctx, logger);
  }

  // Route preset revert modal
  if (isPresetRevertModal(customId)) {
    return handlePresetRevertModal(interaction, env, ctx, logger);
  }

  // Route ban reason modal
  if (isBanReasonModal(customId)) {
    return handleBanReasonModal(interaction, env, ctx, logger);
  }

  // Unknown modal
  return ephemeralResponse('Unknown modal submission.');
}

/**
 * Discord Interaction type (simplified)
 * Full types would come from a Discord types package
 */
interface DiscordInteraction {
  id: string;
  type: number;
  application_id: string;
  token: string;
  locale?: string; // User's locale (e.g., "en-US", "ja")
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
    };
  };
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  };
  data?: {
    id: string;
    name: string;
    type?: number;
    options?: Array<{
      name: string;
      type: number;
      value?: string | number | boolean;
      focused?: boolean;
      options?: Array<{
        name: string;
        type: number;
        value?: string | number | boolean;
        focused?: boolean;
      }>;
    }>;
    resolved?: {
      attachments?: Record<string, {
        id: string;
        filename: string;
        size: number;
        url: string;
        proxy_url: string;
        content_type?: string;
        width?: number;
        height?: number;
      }>;
    };
    custom_id?: string;
    component_type?: number;
    values?: string[];
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

// Export the Hono app as the default export for Cloudflare Workers
export default app;
