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
} from './handlers/commands/index.js';
import { checkRateLimit, formatRateLimitMessage } from './services/rate-limiter.js';
import { DyeService, dyeDatabase } from 'xivdyetools-core';

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
  const options = interaction.data?.options || [];

  // Find the focused option (the one the user is currently typing in)
  let focusedOption: { name: string; value?: string | number | boolean; focused?: boolean } | undefined;

  // Check top-level options first
  focusedOption = options.find((opt) => opt.focused);

  // If not found, check nested options (for subcommands)
  if (!focusedOption) {
    for (const opt of options) {
      if (opt.options) {
        focusedOption = opt.options.find((subOpt) => subOpt.focused);
        if (focusedOption) break;
      }
    }
  }

  const query = (focusedOption?.value as string) || '';

  // Search for dyes matching the query (excluding Facewear)
  let choices: Array<{ name: string; value: string }> = [];

  if (query.length >= 1) {
    const matchingDyes = dyeService.searchByName(query);

    // Filter out Facewear dyes and limit to 25 (Discord's maximum)
    choices = matchingDyes
      .filter((dye) => dye.category !== 'Facewear')
      .slice(0, 25)
      .map((dye) => ({
        name: `${dye.name} (${dye.hex.toUpperCase()})`,
        value: dye.name,
      }));
  } else {
    // Show popular/common dyes when no query (excluding Facewear)
    const allDyes = dyeService.getAllDyes();
    choices = allDyes
      .filter((dye) => dye.category !== 'Facewear')
      .slice(0, 25)
      .map((dye) => ({
        name: `${dye.name} (${dye.hex.toUpperCase()})`,
        value: dye.name,
      }));
  }

  return Response.json({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices },
  });
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
  console.log(`Handling component: ${customId}`);

  // TODO: Implement component handlers
  return ephemeralResponse('Component interactions coming soon!');
}

/**
 * Handle modal submissions
 */
async function handleModal(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const customId = interaction.data?.custom_id;
  console.log(`Handling modal: ${customId}`);

  // TODO: Implement modal handlers
  return ephemeralResponse('Modal submissions coming soon!');
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
