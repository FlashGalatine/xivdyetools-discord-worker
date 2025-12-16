/**
 * Ban Service
 *
 * Functional module for managing user bans in the Preset Palettes feature.
 * Provides functions for checking ban status, searching users, and managing bans.
 *
 * All functions are stateless and take the D1 database binding as a parameter.
 *
 * @module services/ban-service
 */

import type {
  BannedUserRow,
  BannedUser,
  UserSearchResult,
  BannedUserSearchResult,
  BanConfirmationData,
  BanResult,
  UnbanResult,
  toBannedUser,
} from '../types/ban.js';

// ============================================================================
// Ban Status Checks
// ============================================================================

/**
 * Check if a user is currently banned by their Discord ID
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID to check
 * @returns True if user is banned
 */
export async function isUserBannedByDiscordId(
  db: D1Database,
  discordId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'SELECT 1 FROM banned_users WHERE discord_id = ? AND unbanned_at IS NULL LIMIT 1'
    )
    .bind(discordId)
    .first();
  return result !== null;
}

/**
 * Check if a user is currently banned by their XIVAuth ID
 *
 * @param db - D1 database binding
 * @param xivAuthId - XIVAuth user ID to check
 * @returns True if user is banned
 */
export async function isUserBannedByXivAuthId(
  db: D1Database,
  xivAuthId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'SELECT 1 FROM banned_users WHERE xivauth_id = ? AND unbanned_at IS NULL LIMIT 1'
    )
    .bind(xivAuthId)
    .first();
  return result !== null;
}

/**
 * Check if a user is currently banned (by either Discord ID or XIVAuth ID)
 *
 * @param db - D1 database binding
 * @param discordId - Optional Discord user ID
 * @param xivAuthId - Optional XIVAuth user ID
 * @returns True if user is banned
 */
export async function isUserBanned(
  db: D1Database,
  discordId?: string | null,
  xivAuthId?: string | null
): Promise<boolean> {
  if (discordId) {
    const banned = await isUserBannedByDiscordId(db, discordId);
    if (banned) return true;
  }
  if (xivAuthId) {
    const banned = await isUserBannedByXivAuthId(db, xivAuthId);
    if (banned) return true;
  }
  return false;
}

// ============================================================================
// User Search (for Autocomplete)
// ============================================================================

/**
 * Search for users who have submitted presets (for ban_user autocomplete)
 *
 * Searches by username in the presets table and groups by author to get
 * unique users with their preset counts.
 *
 * @param db - D1 database binding
 * @param query - Search query (partial username match)
 * @param limit - Maximum results to return (default: 25, Discord limit)
 * @returns Array of user search results
 */
export async function searchPresetAuthors(
  db: D1Database,
  query: string,
  limit: number = 25
): Promise<UserSearchResult[]> {
  // Escape special characters for LIKE query
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');

  // Try query with banned_users filter first
  // Falls back to simple query if banned_users table doesn't exist yet
  try {
    const results = await db
      .prepare(
        `
        SELECT
          p.author_discord_id as discord_id,
          p.author_name as username,
          COUNT(*) as preset_count
        FROM presets p
        LEFT JOIN banned_users b ON p.author_discord_id = b.discord_id AND b.unbanned_at IS NULL
        WHERE p.author_discord_id IS NOT NULL
          AND p.author_name LIKE ? ESCAPE '\\'
          AND b.id IS NULL
        GROUP BY p.author_discord_id
        ORDER BY preset_count DESC, p.author_name ASC
        LIMIT ?
        `
      )
      .bind(`%${escapedQuery}%`, limit)
      .all<{ discord_id: string; username: string; preset_count: number }>();

    return (results.results || []).map((row) => ({
      discordId: row.discord_id,
      username: row.username,
      presetCount: row.preset_count,
    }));
  } catch (error) {
    // Fallback: Query without banned_users filter (table may not exist yet)
    console.warn('searchPresetAuthors: Falling back to simple query (banned_users table may not exist)');

    const results = await db
      .prepare(
        `
        SELECT
          author_discord_id as discord_id,
          author_name as username,
          COUNT(*) as preset_count
        FROM presets
        WHERE author_discord_id IS NOT NULL
          AND author_name LIKE ? ESCAPE '\\'
        GROUP BY author_discord_id
        ORDER BY preset_count DESC, author_name ASC
        LIMIT ?
        `
      )
      .bind(`%${escapedQuery}%`, limit)
      .all<{ discord_id: string; username: string; preset_count: number }>();

    return (results.results || []).map((row) => ({
      discordId: row.discord_id,
      username: row.username,
      presetCount: row.preset_count,
    }));
  }
}

/**
 * Search for currently banned users (for unban_user autocomplete)
 *
 * @param db - D1 database binding
 * @param query - Search query (partial username or ID match)
 * @param limit - Maximum results to return (default: 25)
 * @returns Array of banned user search results
 */
export async function searchBannedUsers(
  db: D1Database,
  query: string,
  limit: number = 25
): Promise<BannedUserSearchResult[]> {
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');

  try {
    const results = await db
      .prepare(
        `
        SELECT
          discord_id,
          xivauth_id,
          username,
          banned_at
        FROM banned_users
        WHERE unbanned_at IS NULL
          AND (username LIKE ? ESCAPE '\\' OR discord_id LIKE ? ESCAPE '\\')
        ORDER BY username ASC
        LIMIT ?
        `
      )
      .bind(`%${escapedQuery}%`, `%${escapedQuery}%`, limit)
      .all<{
        discord_id: string | null;
        xivauth_id: string | null;
        username: string;
        banned_at: string;
      }>();

    return (results.results || []).map((row) => ({
      discordId: row.discord_id,
      xivAuthId: row.xivauth_id,
      username: row.username,
      bannedAt: row.banned_at,
    }));
  } catch (error) {
    // Table may not exist yet - return empty array
    console.warn('searchBannedUsers: banned_users table may not exist');
    return [];
  }
}

// ============================================================================
// Ban Confirmation Data
// ============================================================================

/**
 * Get user details and recent presets for the ban confirmation embed
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID
 * @param baseUrl - Base URL for share links (e.g., 'https://xivdyetools.com')
 * @returns User details with recent presets, or null if not found
 */
export async function getUserForBanConfirmation(
  db: D1Database,
  discordId: string,
  baseUrl: string
): Promise<BanConfirmationData | null> {
  // Get user info from presets
  const userResult = await db
    .prepare(
      `
      SELECT
        author_discord_id as discord_id,
        author_name as username,
        COUNT(*) as preset_count
      FROM presets
      WHERE author_discord_id = ?
      GROUP BY author_discord_id
      `
    )
    .bind(discordId)
    .first<{ discord_id: string; username: string; preset_count: number }>();

  if (!userResult) {
    return null;
  }

  // Get last 3 presets
  const presetsResult = await db
    .prepare(
      `
      SELECT id, name
      FROM presets
      WHERE author_discord_id = ?
      ORDER BY created_at DESC
      LIMIT 3
      `
    )
    .bind(discordId)
    .all<{ id: string; name: string }>();

  return {
    user: {
      discordId: userResult.discord_id,
      username: userResult.username,
      presetCount: userResult.preset_count,
    },
    recentPresets: (presetsResult.results || []).map((p) => ({
      id: p.id,
      name: p.name,
      shareUrl: `${baseUrl}/presets/${p.id}`,
    })),
  };
}

// ============================================================================
// Ban Operations
// ============================================================================

/**
 * Ban a user from the Preset Palettes feature
 *
 * Creates a ban record and hides all their presets.
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID to ban
 * @param username - Username at time of ban
 * @param moderatorDiscordId - Discord ID of the moderator issuing the ban
 * @param reason - Reason for the ban
 * @returns Result with success status and number of presets hidden
 */
export async function banUser(
  db: D1Database,
  discordId: string,
  username: string,
  moderatorDiscordId: string,
  reason: string
): Promise<BanResult> {
  try {
    // Check if already banned
    const existingBan = await isUserBannedByDiscordId(db, discordId);
    if (existingBan) {
      return {
        success: false,
        presetsHidden: 0,
        error: 'User is already banned.',
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create ban record
    await db
      .prepare(
        `
        INSERT INTO banned_users (id, discord_id, username, moderator_discord_id, reason, banned_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(id, discordId, username, moderatorDiscordId, reason, now)
      .run();

    // Hide user's presets
    const presetsHidden = await hideUserPresets(db, discordId);

    return {
      success: true,
      presetsHidden,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for missing table error
    if (errorMessage.includes('no such table: banned_users')) {
      return {
        success: false,
        presetsHidden: 0,
        error: 'Ban system not configured. Please run the database migration first.',
      };
    }

    return {
      success: false,
      presetsHidden: 0,
      error: errorMessage,
    };
  }
}

/**
 * Unban a user from the Preset Palettes feature
 *
 * Marks the ban record as unbanned and restores their hidden presets.
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID to unban
 * @param moderatorDiscordId - Discord ID of the moderator issuing the unban
 * @returns Result with success status and number of presets restored
 */
export async function unbanUser(
  db: D1Database,
  discordId: string,
  moderatorDiscordId: string
): Promise<UnbanResult> {
  try {
    // Check if currently banned
    const isBanned = await isUserBannedByDiscordId(db, discordId);
    if (!isBanned) {
      return {
        success: false,
        presetsRestored: 0,
        error: 'User is not currently banned.',
      };
    }

    const now = new Date().toISOString();

    // Update ban record
    const updateResult = await db
      .prepare(
        `
        UPDATE banned_users
        SET unbanned_at = ?, unban_moderator_discord_id = ?
        WHERE discord_id = ? AND unbanned_at IS NULL
        `
      )
      .bind(now, moderatorDiscordId, discordId)
      .run();

    if ((updateResult.meta.changes || 0) === 0) {
      return {
        success: false,
        presetsRestored: 0,
        error: 'Failed to update ban record.',
      };
    }

    // Restore user's presets
    const presetsRestored = await restoreUserPresets(db, discordId);

    return {
      success: true,
      presetsRestored,
    };
  } catch (error) {
    return {
      success: false,
      presetsRestored: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Preset Visibility
// ============================================================================

/**
 * Hide all presets by a banned user
 *
 * Sets status to 'hidden' for all approved presets by the user.
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID
 * @returns Number of presets hidden
 */
export async function hideUserPresets(
  db: D1Database,
  discordId: string
): Promise<number> {
  const result = await db
    .prepare(
      `
      UPDATE presets
      SET status = 'hidden'
      WHERE author_discord_id = ? AND status = 'approved'
      `
    )
    .bind(discordId)
    .run();

  return result.meta.changes || 0;
}

/**
 * Restore presets for an unbanned user
 *
 * Sets status back to 'approved' for all hidden presets by the user.
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID
 * @returns Number of presets restored
 */
export async function restoreUserPresets(
  db: D1Database,
  discordId: string
): Promise<number> {
  const result = await db
    .prepare(
      `
      UPDATE presets
      SET status = 'approved'
      WHERE author_discord_id = ? AND status = 'hidden'
      `
    )
    .bind(discordId)
    .run();

  return result.meta.changes || 0;
}

// ============================================================================
// Ban Record Retrieval
// ============================================================================

/**
 * Get the active ban record for a user
 *
 * @param db - D1 database binding
 * @param discordId - Discord user ID
 * @returns Ban record or null if not banned
 */
export async function getActiveBan(
  db: D1Database,
  discordId: string
): Promise<BannedUser | null> {
  const row = await db
    .prepare(
      `
      SELECT *
      FROM banned_users
      WHERE discord_id = ? AND unbanned_at IS NULL
      LIMIT 1
      `
    )
    .bind(discordId)
    .first<BannedUserRow>();

  if (!row) return null;

  return {
    id: row.id,
    discordId: row.discord_id,
    xivAuthId: row.xivauth_id,
    username: row.username,
    moderatorDiscordId: row.moderator_discord_id,
    reason: row.reason,
    bannedAt: row.banned_at,
    unbannedAt: row.unbanned_at,
    unbanModeratorDiscordId: row.unban_moderator_discord_id,
  };
}
