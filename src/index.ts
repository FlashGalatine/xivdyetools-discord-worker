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
import type { Env, InteractionType as IType } from './types/env.js';
import { InteractionType, InteractionResponseType } from './types/env.js';
import { verifyDiscordRequest, unauthorizedResponse, badRequestResponse } from './utils/verify.js';
import { pongResponse, ephemeralResponse, messageResponse } from './utils/response.js';
import {
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
} from './handlers/commands/index.js';
import { checkRateLimit, formatRateLimitMessage } from './services/rate-limiter.js';
import { getCollections } from './services/user-storage.js';
import { handleButtonInteraction } from './handlers/buttons/index.js';
import { handlePresetRejectionModal, isPresetRejectionModal } from './handlers/modals/index.js';
import { DyeService, dyeDatabase } from 'xivdyetools-core';
import * as presetApi from './services/preset-api.js';
import { sendMessage } from './utils/discord-api.js';
import { STATUS_DISPLAY, type PresetNotificationPayload } from './types/preset.js';

// Initialize DyeService for autocomplete
const dyeService = new DyeService(dyeDatabase);

// Create Hono app with environment type
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for development
app.use('*', cors());

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

  // Verify webhook secret
  const authHeader = c.req.header('Authorization');
  const expectedAuth = `Bearer ${env.INTERNAL_WEBHOOK_SECRET}`;

  if (!env.INTERNAL_WEBHOOK_SECRET || authHeader !== expectedAuth) {
    console.error('Webhook authentication failed');
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
  console.log(`Received preset webhook: ${preset.name} (${preset.id}) from ${preset.source}`);

  // Only pending presets go to moderation channel
  // Approved/rejected notifications are sent by the moderation button handlers after action is taken
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
            { name: 'Dyes', value: preset.dyes.join(', '), inline: false },
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

  if (!isValid) {
    console.error('Signature verification failed:', error);
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
    console.log('Received PING, responding with PONG');
    return pongResponse();
  }

  // Handle Application Commands (slash commands)
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction, env, c.executionCtx);
  }

  // Handle Autocomplete
  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    return handleAutocomplete(interaction, env);
  }

  // Handle Message Components (buttons, select menus)
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction, env, c.executionCtx);
  }

  // Handle Modal Submissions
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModal(interaction, env, c.executionCtx);
  }

  // Unknown interaction type
  console.warn('Unknown interaction type:', interaction.type);
  return badRequestResponse(`Unknown interaction type: ${interaction.type}`);
});

/**
 * Handle slash commands
 */
async function handleCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const commandName = interaction.data?.name;
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  console.log(`Handling command: /${commandName} from user ${userId}`);

  // Check rate limit (skip for utility commands)
  if (userId && commandName && !['about', 'manual'].includes(commandName)) {
    const rateLimitResult = await checkRateLimit(env.KV, userId, commandName);
    if (!rateLimitResult.allowed) {
      console.log(`User ${userId} rate limited for /${commandName}`);
      return ephemeralResponse(formatRateLimitMessage(rateLimitResult));
    }
  }

  // TODO: Route to specific command handlers
  // For now, respond with a placeholder message
  switch (commandName) {
    case 'about':
      return messageResponse({
        embeds: [{
          title: 'XIV Dye Tools Bot',
          description: [
            '**Version:** 2.0.0 (Cloudflare Workers Edition)',
            '',
            'A Discord bot for FFXIV dye color exploration and matching.',
            '',
            '**Commands:**',
            '`/harmony` - Generate color harmonies',
            '`/match` - Find closest dye to a color',
            '`/dye` - Search the dye database',
            '`/mixer` - Create color gradients',
            '',
            '**Links:**',
            '[Web App](https://xivdyetools.projectgalatine.com/)',
            '[GitHub](https://github.com/FlashGalatine/xivdyetools-discord-worker)',
          ].join('\n'),
          color: 0x5865f2, // Discord Blurple
          footer: {
            text: 'Powered by Cloudflare Workers',
          },
        }],
      });

    case 'harmony':
      return handleHarmonyCommand(interaction, env, ctx);

    case 'dye':
      return handleDyeCommand(interaction, env, ctx);

    case 'mixer':
      return handleMixerCommand(interaction, env, ctx);

    case 'match':
      return handleMatchCommand(interaction, env, ctx);

    case 'match_image':
      return handleMatchImageCommand(interaction, env, ctx);

    case 'accessibility':
      return handleAccessibilityCommand(interaction, env, ctx);

    case 'manual':
      return handleManualCommand(interaction, env, ctx);

    case 'comparison':
      return handleComparisonCommand(interaction, env, ctx);

    case 'language':
      return handleLanguageCommand(interaction, env, ctx);

    case 'favorites':
      return handleFavoritesCommand(interaction, env, ctx);

    case 'collection':
      return handleCollectionCommand(interaction, env, ctx);

    case 'preset':
      return handlePresetCommand(interaction, env, ctx);

    default:
      // Command not yet implemented
      return ephemeralResponse(
        `The \`/${commandName}\` command is not yet implemented in the Workers version.`
      );
  }
}

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(
  interaction: DiscordInteraction,
  env: Env
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
      choices = await getCollectionAutocompleteChoices(interaction, env, query);
    }
    // Dye autocomplete (for add/remove subcommands)
    else if (focusedName === 'dye') {
      choices = getDyeAutocompleteChoices(query);
    }
  }
  // Handle preset command autocomplete
  else if (commandName === 'preset') {
    const focusedName = focusedOption?.name;

    // Preset name autocomplete (for show, vote, moderate subcommands)
    if (focusedName === 'name' || focusedName === 'preset' || focusedName === 'preset_id') {
      // For moderate subcommand, search pending presets
      const status = subcommandName === 'moderate' ? 'pending' : 'approved';
      choices = await presetApi.searchPresetsForAutocomplete(env, query, { status });
    }
    // Dye autocomplete (for submit subcommand) - falls through to default dye search
    else if (focusedName?.startsWith('dye')) {
      choices = getDyeAutocompleteChoices(query);
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
 */
async function getCollectionAutocompleteChoices(
  interaction: DiscordInteraction,
  env: Env,
  query: string
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
    console.error('Failed to get collection autocomplete choices:', error);
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
 * Handle button/select menu interactions
 */
async function handleComponent(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id;
  const componentType = interaction.data?.component_type;

  console.log(`Handling component: ${customId} (type: ${componentType})`);

  // Buttons have component_type 2
  if (componentType === 2) {
    return handleButtonInteraction(interaction, env, ctx);
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
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id || '';
  console.log(`Handling modal: ${customId}`);

  // Route preset rejection modal
  if (isPresetRejectionModal(customId)) {
    return handlePresetRejectionModal(interaction, env, ctx);
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
