/**
 * Preset Types
 *
 * Type definitions for community presets and API interactions.
 * These types mirror the xivdyetools-worker API contract.
 *
 * @module types/preset
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Status of a community preset in the moderation workflow
 */
export type PresetStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

/**
 * Available preset categories
 */
export type PresetCategory =
  | 'jobs'
  | 'grand-companies'
  | 'seasons'
  | 'events'
  | 'aesthetics'
  | 'community';

/**
 * Sort options for preset listing
 */
export type PresetSortOption = 'popular' | 'recent' | 'name';

/**
 * A community preset palette
 */
export interface CommunityPreset {
  /** UUID v4 identifier */
  id: string;
  /** Preset name (2-50 characters) */
  name: string;
  /** Description (10-200 characters) */
  description: string;
  /** Category ID */
  category_id: PresetCategory;
  /** Array of dye IDs (2-5 dyes) */
  dyes: number[];
  /** Searchable tags (0-10 tags) */
  tags: string[];
  /** Discord user ID of creator (null for curated) */
  author_discord_id: string | null;
  /** Display name at submission time */
  author_name: string | null;
  /** Number of votes received */
  vote_count: number;
  /** Moderation status */
  status: PresetStatus;
  /** True for official/curated presets */
  is_curated: boolean;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last update timestamp */
  updated_at: string;
  /** Previous values stored when edit was flagged (for revert) */
  previous_values?: PresetPreviousValues | null;
}

/**
 * Previous values stored for revert capability
 */
export interface PresetPreviousValues {
  name: string;
  description: string;
  tags: string[];
  dyes: number[];
}

/**
 * Category metadata
 */
export interface CategoryMeta {
  /** Category identifier */
  id: PresetCategory;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Emoji icon */
  icon: string | null;
  /** True for official categories */
  is_curated: boolean;
  /** Display order for sorting */
  display_order: number;
  /** Number of approved presets (optional) */
  preset_count?: number;
}

// ============================================================================
// API Request Types
// ============================================================================

/**
 * Filters for listing presets
 */
export interface PresetFilters {
  /** Filter by category */
  category?: PresetCategory;
  /** Search query for name/description/tags */
  search?: string;
  /** Filter by status (default: 'approved') */
  status?: PresetStatus;
  /** Sort order (default: 'popular') */
  sort?: PresetSortOption;
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (max 100) */
  limit?: number;
}

/**
 * Payload for submitting a new preset
 */
export interface PresetSubmission {
  /** Preset name (2-50 chars) */
  name: string;
  /** Description (10-200 chars) */
  description: string;
  /** Category ID */
  category_id: PresetCategory;
  /** Array of dye IDs (2-5 dyes) */
  dyes: number[];
  /** Tags (0-10 tags, max 30 chars each) */
  tags: string[];
}

/**
 * Payload for editing an existing preset
 */
export interface PresetEditRequest {
  /** New preset name (2-50 chars) */
  name?: string;
  /** New description (10-200 chars) */
  description?: string;
  /** New dye IDs (2-5 dyes) */
  dyes?: number[];
  /** New tags (0-10 tags, max 30 chars each) */
  tags?: string[];
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from listing presets
 */
export interface PresetListResponse {
  /** Array of presets */
  presets: CommunityPreset[];
  /** Total number of matching presets */
  total: number;
  /** Current page number */
  page: number;
  /** Results per page */
  limit: number;
  /** True if more results available */
  has_more: boolean;
}

/**
 * Response from submitting a preset
 */
export interface PresetSubmitResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** The created preset (if new) */
  preset?: CommunityPreset;
  /** Existing preset (if duplicate detected) */
  duplicate?: CommunityPreset;
  /** Whether vote was added to duplicate */
  vote_added?: boolean;
  /** Moderation result */
  moderation_status?: 'approved' | 'pending';
  /** Remaining submissions today */
  remaining_submissions?: number;
}

/**
 * Response from editing a preset
 */
export interface PresetEditResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** The updated preset */
  preset?: CommunityPreset;
  /** Moderation result */
  moderation_status?: 'approved' | 'pending';
  /** Duplicate info if dye combination exists */
  duplicate?: {
    id: string;
    name: string;
    author_name: string | null;
  };
  /** Error type for specific handling */
  error?: string;
}

/**
 * Response from voting on a preset
 */
export interface VoteResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated vote count */
  new_vote_count: number;
  /** True if user already voted (for 409 responses) */
  already_voted?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Moderation statistics
 */
export interface ModerationStats {
  /** Presets awaiting review */
  pending: number;
  /** Approved presets */
  approved: number;
  /** Rejected presets */
  rejected: number;
  /** Flagged presets */
  flagged: number;
  /** Moderation actions in last 7 days */
  actions_last_week: number;
}

/**
 * Moderation log entry
 */
export interface ModerationLogEntry {
  /** Log entry ID */
  id: string;
  /** Preset ID */
  preset_id: string;
  /** Moderator's Discord ID */
  moderator_discord_id: string;
  /** Action taken */
  action: 'approve' | 'reject' | 'flag' | 'unflag' | 'revert';
  /** Optional reason */
  reason: string | null;
  /** ISO 8601 timestamp */
  created_at: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Payload received from preset API webhook notifications
 */
export interface PresetNotificationPayload {
  /** Notification type */
  type: 'submission';
  /** Preset data */
  preset: {
    id: string;
    name: string;
    description: string;
    category_id: PresetCategory;
    dyes: number[];
    tags: string[];
    author_name: string;
    author_discord_id: string;
    status: PresetStatus;
    /** Moderation result */
    moderation_status: 'clean' | 'flagged' | 'auto_approved';
    /** Submission source */
    source: 'bot' | 'web' | 'none';
    created_at: string;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for preset API errors
 */
export class PresetAPIError extends Error {
  /** HTTP status code */
  public readonly statusCode: number;
  /** Additional error details */
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'PresetAPIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================================
// UI Constants
// ============================================================================

/**
 * Category display metadata for embeds
 */
export const CATEGORY_DISPLAY: Record<PresetCategory, { icon: string; name: string }> = {
  jobs: { icon: '⚔️', name: 'FFXIV Jobs' },
  'grand-companies': { icon: '🏛️', name: 'Grand Companies' },
  seasons: { icon: '🍂', name: 'Seasons' },
  events: { icon: '🎉', name: 'FFXIV Events' },
  aesthetics: { icon: '🎨', name: 'Aesthetics' },
  community: { icon: '🌐', name: 'Community' },
};

/**
 * Status display metadata for embeds
 */
export const STATUS_DISPLAY: Record<PresetStatus, { icon: string; color: number }> = {
  pending: { icon: '🟡', color: 0xfee75c },
  approved: { icon: '🟢', color: 0x57f287 },
  rejected: { icon: '🔴', color: 0xed4245 },
  flagged: { icon: '🟠', color: 0xf5a623 },
};
