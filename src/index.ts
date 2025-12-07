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
  console.log(`Handling command: /${commandName}`);

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
            '[Web App](https://xiv-colorexplorer.pages.dev)',
            '[GitHub](https://github.com/your-repo)',
          ].join('\n'),
          color: 0x5865f2, // Discord Blurple
          footer: {
            text: 'Powered by Cloudflare Workers',
          },
        }],
      });

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
  // TODO: Implement autocomplete
  return Response.json({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices: [] },
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
