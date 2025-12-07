/**
 * Discord REST API Utilities
 *
 * Helpers for sending follow-up messages with attachments,
 * editing deferred responses, and other Discord API operations.
 */

import type { DiscordEmbed, DiscordActionRow } from './response.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface FollowUpOptions {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  /** File attachment */
  file?: {
    name: string;
    data: Uint8Array;
    contentType: string;
  };
  /** Make the message ephemeral (only visible to user) */
  ephemeral?: boolean;
}

/**
 * Sends a follow-up message to a deferred interaction.
 * Use this after responding with DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE.
 *
 * @param applicationId - Your Discord application ID
 * @param interactionToken - The interaction token from the original request
 * @param options - Message content and options
 */
export async function sendFollowUp(
  applicationId: string,
  interactionToken: string,
  options: FollowUpOptions
): Promise<Response> {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}`;

  // If there's a file, use multipart form data
  if (options.file) {
    return sendFollowUpWithFile(url, options);
  }

  // Otherwise, send JSON
  const body: Record<string, unknown> = {};
  if (options.content) body.content = options.content;
  if (options.embeds) body.embeds = options.embeds;
  if (options.components) body.components = options.components;
  if (options.ephemeral) body.flags = 64;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Sends a follow-up message with a file attachment using multipart form data.
 */
async function sendFollowUpWithFile(
  url: string,
  options: FollowUpOptions
): Promise<Response> {
  const formData = new FormData();

  // Build the payload_json part
  const payload: Record<string, unknown> = {};

  if (options.content) payload.content = options.content;
  if (options.ephemeral) payload.flags = 64;

  // If we have embeds with image references, we need to reference the attachment
  if (options.embeds && options.file) {
    payload.embeds = options.embeds.map((embed) => {
      // If the embed has an image placeholder, replace with attachment reference
      if (embed.image?.url === 'attachment://image.png') {
        return {
          ...embed,
          image: { url: `attachment://${options.file!.name}` },
        };
      }
      return embed;
    });
  } else if (options.embeds) {
    payload.embeds = options.embeds;
  }

  if (options.components) payload.components = options.components;

  // Add attachments metadata
  if (options.file) {
    payload.attachments = [
      {
        id: 0,
        filename: options.file.name,
      },
    ];
  }

  formData.append('payload_json', JSON.stringify(payload));

  // Add the file
  if (options.file) {
    const blob = new Blob([options.file.data], { type: options.file.contentType });
    formData.append('files[0]', blob, options.file.name);
  }

  return fetch(url, {
    method: 'POST',
    body: formData,
  });
}

/**
 * Edits the original deferred response.
 * Use this to update the "thinking..." message with actual content.
 */
export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  options: FollowUpOptions
): Promise<Response> {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  // If there's a file, use multipart form data
  if (options.file) {
    return editResponseWithFile(url, options);
  }

  // Otherwise, send JSON
  const body: Record<string, unknown> = {};
  if (options.content) body.content = options.content;
  if (options.embeds) body.embeds = options.embeds;
  if (options.components) body.components = options.components;

  return fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Edits the original response with a file attachment.
 */
async function editResponseWithFile(
  url: string,
  options: FollowUpOptions
): Promise<Response> {
  const formData = new FormData();

  // Build the payload_json part
  const payload: Record<string, unknown> = {};

  if (options.content) payload.content = options.content;

  // Handle embeds with image attachments
  if (options.embeds && options.file) {
    payload.embeds = options.embeds.map((embed) => {
      if (embed.image?.url === 'attachment://image.png') {
        return {
          ...embed,
          image: { url: `attachment://${options.file!.name}` },
        };
      }
      return embed;
    });
  } else if (options.embeds) {
    payload.embeds = options.embeds;
  }

  if (options.components) payload.components = options.components;

  // Add attachments metadata
  if (options.file) {
    payload.attachments = [
      {
        id: 0,
        filename: options.file.name,
      },
    ];
  }

  formData.append('payload_json', JSON.stringify(payload));

  // Add the file
  if (options.file) {
    const blob = new Blob([options.file.data], { type: options.file.contentType });
    formData.append('files[0]', blob, options.file.name);
  }

  return fetch(url, {
    method: 'PATCH',
    body: formData,
  });
}

/**
 * Deletes the original interaction response.
 */
export async function deleteOriginalResponse(
  applicationId: string,
  interactionToken: string
): Promise<Response> {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  return fetch(url, {
    method: 'DELETE',
  });
}
