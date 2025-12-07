/**
 * Environment bindings for Cloudflare Worker
 *
 * Secrets are set via: wrangler secret put <NAME>
 * Variables are set in wrangler.toml [vars]
 * Bindings (KV, R2, D1) are configured in wrangler.toml
 */
export interface Env {
  // =========================================================================
  // Secrets (set via wrangler secret put)
  // =========================================================================

  /** Discord Bot Token - for sending follow-up messages */
  DISCORD_TOKEN: string;

  /** Discord Application Public Key - for verifying interaction signatures */
  DISCORD_PUBLIC_KEY: string;

  /** Shared secret for authenticating with the Presets API */
  BOT_API_SECRET?: string;

  // =========================================================================
  // Variables (from wrangler.toml [vars])
  // =========================================================================

  /** Discord Application ID */
  DISCORD_CLIENT_ID: string;

  /** URL of the Presets API worker */
  PRESETS_API_URL: string;

  // =========================================================================
  // Bindings (configured in wrangler.toml)
  // =========================================================================

  /** KV Namespace for rate limiting and user preferences */
  KV: KVNamespace;

  /** R2 Bucket for generated images */
  IMAGES?: R2Bucket;

  /** R2 Bucket for static assets (fonts) */
  ASSETS?: R2Bucket;

  /** D1 Database for user data and presets */
  DB: D1Database;
}

/**
 * Discord Interaction Types
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding
 */
export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

/**
 * Discord Interaction Response Types
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
 */
export enum InteractionResponseType {
  /** ACK a Ping */
  PONG = 1,
  /** Respond to an interaction with a message */
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  /** ACK an interaction and edit a response later, the user sees a loading state */
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  /** For components, ACK an interaction and edit the original message later */
  DEFERRED_UPDATE_MESSAGE = 6,
  /** For components, edit the message the component was attached to */
  UPDATE_MESSAGE = 7,
  /** Respond to an autocomplete interaction with suggested choices */
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  /** Respond to an interaction with a popup modal */
  MODAL = 9,
}
