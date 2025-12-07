/**
 * Preset API Client
 *
 * Functional module for communicating with the xivdyetools-worker preset API.
 * All functions are stateless and take environment as a parameter.
 *
 * Uses Cloudflare Service Bindings for Worker-to-Worker communication when available,
 * which avoids error 1042 (Worker fetch to different worker on same account).
 *
 * @module services/preset-api
 */

import type { Env } from '../types/env.js';
import {
  type CommunityPreset,
  type PresetListResponse,
  type PresetSubmitResponse,
  type PresetSubmission,
  type VoteResponse,
  type ModerationStats,
  type ModerationLogEntry,
  type PresetFilters,
  type CategoryMeta,
  PresetAPIError,
} from '../types/preset.js';

// ============================================================================
// Core Request Function
// ============================================================================

/**
 * Make an authenticated request to the preset API
 *
 * Uses Service Binding (env.PRESETS_API) when available for direct Worker-to-Worker
 * communication. Falls back to external URL (env.PRESETS_API_URL) if binding is not
 * configured (useful for local development).
 *
 * @param env - Environment bindings
 * @param method - HTTP method
 * @param path - API path (e.g., '/api/v1/presets')
 * @param options - Request options
 * @returns Parsed JSON response
 * @throws PresetAPIError on failure
 */
async function request<T>(
  env: Env,
  method: string,
  path: string,
  options: {
    body?: unknown;
    userDiscordId?: string;
    userName?: string;
  } = {}
): Promise<T> {
  // Require either service binding or URL-based configuration
  if (!env.PRESETS_API && (!env.PRESETS_API_URL || !env.BOT_API_SECRET)) {
    throw new PresetAPIError(503, 'Preset API not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth header if using URL-based fetch (service binding uses internal auth)
  if (env.BOT_API_SECRET) {
    headers['Authorization'] = `Bearer ${env.BOT_API_SECRET}`;
  }

  // Add user context headers for authenticated operations
  if (options.userDiscordId) {
    headers['X-User-Discord-ID'] = options.userDiscordId;
  }
  if (options.userName) {
    headers['X-User-Discord-Name'] = options.userName;
  }

  try {
    let response: Response;

    if (env.PRESETS_API) {
      // Use Service Binding for Worker-to-Worker communication
      // This avoids Cloudflare error 1042
      response = await env.PRESETS_API.fetch(
        new Request(`https://internal${path}`, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        })
      );
    } else {
      // Fall back to external URL (for local dev or if service binding not configured)
      const url = `${env.PRESETS_API_URL}${path}`;
      response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }

    const data = (await response.json()) as T & { message?: string; error?: string };

    if (!response.ok) {
      throw new PresetAPIError(
        response.status,
        data.message || data.error || `API request failed with status ${response.status}`,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof PresetAPIError) {
      throw error;
    }
    // Network or parsing error
    console.error('Preset API request failed:', error);
    throw new PresetAPIError(500, 'Failed to communicate with preset API', error);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the preset API is configured and available
 *
 * Returns true if either:
 * - Service Binding (PRESETS_API) is configured (preferred)
 * - External URL (PRESETS_API_URL) and auth secret (BOT_API_SECRET) are set
 */
export function isApiEnabled(env: Env): boolean {
  return Boolean(env.PRESETS_API || (env.PRESETS_API_URL && env.BOT_API_SECRET));
}

/**
 * Check if a user is a moderator based on MODERATOR_IDS environment variable
 */
export function isModerator(env: Env, userId: string): boolean {
  if (!env.MODERATOR_IDS) return false;
  const moderatorIds = env.MODERATOR_IDS.split(',').map((id) => id.trim());
  return moderatorIds.includes(userId);
}

// ============================================================================
// Preset Functions
// ============================================================================

/**
 * Get a paginated list of presets with optional filtering
 */
export async function getPresets(
  env: Env,
  filters: PresetFilters = {}
): Promise<PresetListResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  return request<PresetListResponse>(env, 'GET', `/api/v1/presets${query ? `?${query}` : ''}`);
}

/**
 * Get featured presets (top voted)
 */
export async function getFeaturedPresets(env: Env): Promise<CommunityPreset[]> {
  const response = await request<{ presets: CommunityPreset[] }>(
    env,
    'GET',
    '/api/v1/presets/featured'
  );
  return response.presets;
}

/**
 * Get a single preset by ID
 *
 * @returns Preset or null if not found
 */
export async function getPreset(env: Env, id: string): Promise<CommunityPreset | null> {
  try {
    return await request<CommunityPreset>(env, 'GET', `/api/v1/presets/${id}`);
  } catch (error) {
    if (error instanceof PresetAPIError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Search for a preset by name
 *
 * @returns First matching preset or null if not found
 */
export async function getPresetByName(
  env: Env,
  name: string
): Promise<CommunityPreset | null> {
  const response = await getPresets(env, {
    search: name,
    status: 'approved',
    limit: 1,
  });

  // Find exact match first, then partial match
  const exactMatch = response.presets.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  return exactMatch || response.presets[0] || null;
}

/**
 * Get a random preset, optionally filtered by category
 */
export async function getRandomPreset(
  env: Env,
  category?: string
): Promise<CommunityPreset | null> {
  const filters: PresetFilters = {
    status: 'approved',
    limit: 50, // Get a pool of presets
  };

  if (category) {
    filters.category = category as PresetFilters['category'];
  }

  const response = await getPresets(env, filters);

  if (response.presets.length === 0) {
    return null;
  }

  // Pick a random one from the pool
  const randomIndex = Math.floor(Math.random() * response.presets.length);
  return response.presets[randomIndex];
}

/**
 * Submit a new preset
 */
export async function submitPreset(
  env: Env,
  submission: PresetSubmission,
  userDiscordId: string,
  userName: string
): Promise<PresetSubmitResponse> {
  return request<PresetSubmitResponse>(env, 'POST', '/api/v1/presets', {
    body: submission,
    userDiscordId,
    userName,
  });
}

/**
 * Delete a preset (owner or moderator only)
 */
export async function deletePreset(
  env: Env,
  presetId: string,
  userDiscordId: string
): Promise<boolean> {
  try {
    await request<{ success: boolean }>(env, 'DELETE', `/api/v1/presets/${presetId}`, {
      userDiscordId,
    });
    return true;
  } catch (error) {
    if (error instanceof PresetAPIError && error.statusCode === 403) {
      return false;
    }
    throw error;
  }
}

// ============================================================================
// Vote Functions
// ============================================================================

/**
 * Add a vote to a preset
 */
export async function voteForPreset(
  env: Env,
  presetId: string,
  userDiscordId: string
): Promise<VoteResponse> {
  return request<VoteResponse>(env, 'POST', `/api/v1/votes/${presetId}`, {
    userDiscordId,
  });
}

/**
 * Remove a vote from a preset
 */
export async function removeVote(
  env: Env,
  presetId: string,
  userDiscordId: string
): Promise<VoteResponse> {
  return request<VoteResponse>(env, 'DELETE', `/api/v1/votes/${presetId}`, {
    userDiscordId,
  });
}

/**
 * Check if a user has voted for a preset
 */
export async function hasVoted(
  env: Env,
  presetId: string,
  userDiscordId: string
): Promise<boolean> {
  try {
    const response = await request<{ has_voted: boolean }>(
      env,
      'GET',
      `/api/v1/votes/${presetId}/check`,
      { userDiscordId }
    );
    return response.has_voted;
  } catch (error) {
    // If check fails, assume not voted
    console.error('Failed to check vote status:', error);
    return false;
  }
}

// ============================================================================
// Category Functions
// ============================================================================

/**
 * Get all preset categories with counts
 */
export async function getCategories(env: Env): Promise<CategoryMeta[]> {
  const response = await request<{ categories: CategoryMeta[] }>(
    env,
    'GET',
    '/api/v1/categories'
  );
  return response.categories;
}

// ============================================================================
// Moderation Functions
// ============================================================================

/**
 * Get presets pending moderation
 */
export async function getPendingPresets(
  env: Env,
  moderatorId: string
): Promise<CommunityPreset[]> {
  const response = await request<{ presets: CommunityPreset[] }>(
    env,
    'GET',
    '/api/v1/moderation/pending',
    { userDiscordId: moderatorId }
  );
  return response.presets;
}

/**
 * Approve a preset
 */
export async function approvePreset(
  env: Env,
  presetId: string,
  moderatorId: string,
  reason?: string
): Promise<CommunityPreset> {
  const response = await request<{ preset: CommunityPreset }>(
    env,
    'PATCH',
    `/api/v1/moderation/${presetId}/status`,
    {
      body: { status: 'approved', reason },
      userDiscordId: moderatorId,
    }
  );
  return response.preset;
}

/**
 * Reject a preset
 */
export async function rejectPreset(
  env: Env,
  presetId: string,
  moderatorId: string,
  reason: string
): Promise<CommunityPreset> {
  const response = await request<{ preset: CommunityPreset }>(
    env,
    'PATCH',
    `/api/v1/moderation/${presetId}/status`,
    {
      body: { status: 'rejected', reason },
      userDiscordId: moderatorId,
    }
  );
  return response.preset;
}

/**
 * Flag a preset for review
 */
export async function flagPreset(
  env: Env,
  presetId: string,
  moderatorId: string,
  reason: string
): Promise<CommunityPreset> {
  const response = await request<{ preset: CommunityPreset }>(
    env,
    'PATCH',
    `/api/v1/moderation/${presetId}/status`,
    {
      body: { status: 'flagged', reason },
      userDiscordId: moderatorId,
    }
  );
  return response.preset;
}

/**
 * Get moderation statistics
 */
export async function getModerationStats(
  env: Env,
  moderatorId: string
): Promise<ModerationStats> {
  const response = await request<{ stats: ModerationStats }>(
    env,
    'GET',
    '/api/v1/moderation/stats',
    { userDiscordId: moderatorId }
  );
  return response.stats;
}

/**
 * Get moderation history for a preset
 */
export async function getModerationHistory(
  env: Env,
  presetId: string,
  moderatorId: string
): Promise<ModerationLogEntry[]> {
  const response = await request<{ history: ModerationLogEntry[] }>(
    env,
    'GET',
    `/api/v1/moderation/${presetId}/history`,
    { userDiscordId: moderatorId }
  );
  return response.history;
}

// ============================================================================
// Autocomplete Helpers
// ============================================================================

/**
 * Search presets for autocomplete suggestions
 *
 * @param env - Environment bindings
 * @param query - Search query
 * @param options - Additional options
 * @returns Array of autocomplete choices
 */
export async function searchPresetsForAutocomplete(
  env: Env,
  query: string,
  options: {
    status?: 'approved' | 'pending';
    limit?: number;
  } = {}
): Promise<Array<{ name: string; value: string }>> {
  try {
    const filters: PresetFilters = {
      status: options.status || 'approved',
      limit: options.limit || 25,
    };

    if (query.length > 0) {
      filters.search = query;
    } else {
      // Show popular presets when no query
      filters.sort = 'popular';
    }

    const response = await getPresets(env, filters);

    return response.presets.map((preset) => ({
      // Format: "Name (X★)" or "Name (X★) by Author"
      name: preset.author_name
        ? `${preset.name} (${preset.vote_count}★) by ${preset.author_name}`
        : `${preset.name} (${preset.vote_count}★)`,
      value: preset.id,
    }));
  } catch (error) {
    console.error('Preset autocomplete search failed:', error);
    return [];
  }
}
