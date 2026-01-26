# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.9] - 2026-01-26

### Security

- Added pre-commit hooks for security scanning (detect-secrets, trivy)
  - Scans for accidentally committed secrets before push
  - Vulnerability scanning for dependencies and container images

### Changed

- Added Dependabot configuration for automated dependency updates
  - Weekly npm dependency updates
  - Weekly GitHub Actions updates

### Fixed

- Updated test suite for `@xivdyetools/auth` migration (REFACTOR-003 follow-up)
  - Fixed `verify.test.ts` to mock shared auth package instead of deprecated `discord-interactions`
  - Fixed `analytics.test.ts` mock to properly support OPT-002 list() optimization

---

## [2.3.8] - 2026-01-26

### Changed

- **REFACTOR-003**: Migrated authentication utilities to `@xivdyetools/auth` shared package
  - Discord signature verification now uses `verifyDiscordRequest()` from shared package
  - Timing-safe comparison now uses `timingSafeEqual()` from shared package
  - Reduces code duplication across Discord workers

---

## [2.3.7] - 2026-01-25

### Changed

- **REFACTOR-002**: Migrated KV-based rate limiting to `@xivdyetools/rate-limiter` shared package
  - Uses `KVRateLimiter` with `getDiscordCommandLimit()` for command-specific limits
  - Preserves per-user, per-command rate limiting pattern
  - Fail-open behavior maintained via shared package implementation

---

## [2.3.6] - 2026-01-25

### Performance

- **OPT-002**: Optimized analytics `getStats()` using KV list() with metadata
  - Stores counter values in KV metadata during `incrementCounter()`
  - `getStats()` now uses single `kv.list()` call instead of 14+ individual gets
  - Removes hardcoded command list - dynamically discovers all tracked commands
  - Includes backward compatibility fallback for counters without metadata
  - **Reference**: Security audit OPT-002 (2026-01-25)

---

## [2.3.5] - 2026-01-25

### Security

- **FINDING-004**: Updated `hono` to ^4.11.4 to fix JWT algorithm confusion vulnerability (CVSS 8.2)
- **FINDING-005**: Updated `wrangler` to ^4.59.1 to fix OS command injection in `wrangler pages deploy`

---

## [2.3.4] - 2026-01-19

### Fixed

- **DISCORD-BUG-001**: Fixed non-atomic counter increment in analytics. Added optimistic concurrency with retries and version tracking via KV metadata to prevent lost updates under concurrent load
- **DISCORD-BUG-002**: Verified Analytics.writeDataPoint already had try-catch error handling with logger support (no changes needed)

### Refactored

- **DISCORD-REF-001**: Extracted shared color utilities to `src/utils/color.ts`
  - `isValidHex()` - Supports both 6-digit and optional 3-digit shorthand validation
  - `normalizeHex()` - Ensures `#` prefix and expands 3-digit to 6-digit (`#F00` → `#FF0000`)
  - `resolveColorInput()` - Flexible options for different command needs
  - Reduced ~110 lines of duplicated functions across 5 command handlers

---

## [2.3.3] - 2026-01-07

### Added

- **Localization**: Added `matchImageHelp` section translations for all supported languages
  - German (de), French (fr), Japanese (ja), Korean (ko), Chinese (zh)
  - Ensures feature parity with English locale for `/match_image` help command

### Changed

- Updated @xivdyetools/core to 1.5.6 (fixes missing metallic dye IDs)

## [2.3.2] - 2026-01-05

### Added

- **Text Sanitization Utility**: New `src/utils/sanitize.ts` module for secure text handling
  - `sanitizeDisplayText()` - Removes control characters, zalgo text, invisible Unicode
  - `sanitizePresetName()` / `sanitizePresetDescription()` - Preset-specific sanitization
  - `sanitizeCollectionName()` / `sanitizeCollectionDescription()` - Collection-specific sanitization
  - `sanitizeErrorMessage()` - Converts HTTP status codes to safe user messages

### Security

#### Medium Priority Audit Fixes (2026-01-05 Security Audit)

- **M-001**: Sanitized preset names/descriptions before display in Discord embeds
  - Preset webhook embeds now use `sanitizePresetName()` and `sanitizePresetDescription()`
  - Prevents zalgo text, invisible characters, and display issues

- **M-002**: Added character validation for collection names
  - `createCollection()` now sanitizes names/descriptions before storage
  - Removes control characters, normalizes whitespace, enforces length limits

- **M-003**: Sanitized API error messages shown to users
  - Added `getSafeMessage()` method to `PresetAPIError` class
  - Error handlers now use safe messages instead of raw upstream errors
  - Prevents exposing internal API details to end users

---

## [2.3.1] - 2025-12-24

### Changed

- Updated `@xivdyetools/core` to ^1.5.3 for latest bug fixes and performance improvements
- Updated `@xivdyetools/logger` to ^1.0.2 for improved log redaction patterns
- Updated `@xivdyetools/types` to ^1.1.1 for new Dye fields and branded type documentation

---

## [2.3.0] - 2025-12-24

### Changed

#### Low Priority Audit Fixes

- **DISCORD-MED-003**: Added KV schema versioning for future data migrations
  - Added `KV_SCHEMA_VERSION` constant (`v1`) to key prefixes in `user-storage.ts`
  - Keys now follow pattern: `xivdye:favorites:v1:userId`
  - Enables non-breaking schema evolution when data format changes
  - **Note**: Existing user favorites/collections reset (users can rebuild)

### Fixed

#### Security Audit - Critical Issues Resolved

- **DISCORD-CRITICAL-001**: Fixed analytics tracking to use actual command success status
  - Analytics now tracks after command execution, not before
  - Wraps command execution in try-catch to capture failures
  - Provides accurate success/failure metrics for monitoring
- **DISCORD-CRITICAL-002**: Documented race condition in collection autocomplete
  - Added explanatory comment about stale dye counts during concurrent modification
  - Full fix would require schema changes (version/etag on collections)
- **DISCORD-CRITICAL-003**: Fixed timing-safe comparison bypass in webhook auth
  - Separated secret configuration check from auth verification
  - Prevents timing oracle attack to detect configured vs unconfigured secrets

---

## [2.2.0] - 2025-12-15

### Added

#### User Ban System
- `/preset ban_user` - Ban a user from Preset Palettes (moderators only)
  - Autocomplete searches preset authors by username
  - Shows confirmation embed with user details and last 3 presets
  - Modal for entering ban reason
  - Hides all user's presets on ban
- `/preset unban_user` - Unban a user (moderators only)
  - Autocomplete searches currently banned users
  - Restores hidden presets on unban

#### New Files
- `src/types/ban.ts` - Type definitions for ban system
- `src/services/ban-service.ts` - Core ban operations (check, search, ban, unban)
- `src/handlers/commands/preset-ban.ts` - Subcommand handlers
- `src/handlers/buttons/ban-confirmation.ts` - Confirmation button handlers
- `src/handlers/modals/ban-reason.ts` - Ban reason modal handler

### Changed

- Updated `/preset` command registration with ban_user and unban_user subcommands
- Added `hidden` status to STATUS_DISPLAY for banned user presets
- Added autocomplete routing for ban/unban user searches
- Added modal routing for ban reason input

---

## [2.1.1] - 2025-12-15

### Fixed

- **Authentication**: HMAC signatures now sent with Service Binding requests, not just URL fallback
  - Previously, HMAC signing code was inside the `else` block for URL-based requests
  - Service Binding requests were missing signatures, causing "Valid authentication required" errors
  - Voting and other authenticated operations now work correctly via Service Binding
- **Production Config**: Added missing bindings to `[env.production]` in `wrangler.toml`
  - KV namespace, D1 database, Service Binding, and Analytics Engine were not inherited
  - Preset autocomplete and other features now work in production

### Changed

- Updated `wrangler.toml` documentation to clarify `BOT_SIGNING_SECRET` is required

---

## [2.1.0] - 2025-12-14

### Added

- **Structured Logging**: Complete migration to `@xivdyetools/logger/worker` for structured request logging
- **Request Logger Middleware**: New middleware for consistent request/response logging
- **Deadline Tracking**: Added 3-second deadline tracking for Discord interaction timeout handling (DISCORD-PERF-001)

### Changed

- **Dependency Migration**: Migrated from `xivdyetools-core` to `@xivdyetools/core`
- **Types Migration**: Migrated `types/preset.ts` to use `@xivdyetools/types`
- **Logging Refactor**: Replaced all `console` calls with structured logger

### Fixed

- **Security**: Added HMAC signature to preset API fallback requests
- **Security**: Strengthened SSRF protection with redirect validation
- **Security**: Added cross-cutting security improvements
- **Rate Limiter**: Addressed HIGH severity rate limiter audit findings
- **Medium Severity**: Addressed MEDIUM severity audit findings
- **Tests**: Updated test mocks and expectations for logger migration

### Deprecated

#### Type Re-exports
The following re-exports from `src/types/preset.ts` are deprecated and will be removed in the next major version:

- **Preset Types** (PresetStatus, PresetCategory, CommunityPreset, etc.): Import from `@xivdyetools/types` instead
- **Request Types** (PresetFilters, PresetSubmission, etc.): Import from `@xivdyetools/types` instead
- **Response Types** (PresetListResponse, VoteResponse, etc.): Import from `@xivdyetools/types` instead
- **Moderation Types** (ModerationLogEntry, ModerationStats): Import from `@xivdyetools/types` instead

**Note:** Project-specific types (PresetNotificationPayload, PresetAPIError, CATEGORY_DISPLAY, STATUS_DISPLAY) remain unchanged.

**Migration Guide:**
```typescript
// Before (deprecated)
import { PresetStatus, CommunityPreset } from '@/types/preset';

// After (recommended)
import type { PresetStatus, CommunityPreset } from '@xivdyetools/types';
```

---

## [2.0.1] - 2025-12-08

### Changed

#### About Command Enhancement
- `/about` now displays all 17 available commands organized by category
- Version number is dynamically imported from `package.json`
- Commands grouped: Color Tools, Dye Database, Analysis, Your Data, Community, Utility
- Added invite bot link and timestamp
- Added Patreon link to support resources

### Files Added
- `src/handlers/commands/about.ts` - Dedicated about command handler

### Files Modified
- `src/handlers/commands/index.ts` - Export about handler
- `src/index.ts` - Route to about handler instead of inline response

---

## [2.0.0] - 2025-12-08

### Added

#### Stats Command
- `/stats` - Display bot usage statistics (authorized users only)
- KV-based counters for real-time stats (total commands, success rate, top commands)
- Analytics Engine integration for long-term storage
- Access controlled via `STATS_AUTHORIZED_USERS` secret

#### Manual Command Enhancement
- `/manual topic:match_image` - Dedicated help for image matching
- Three comprehensive embeds: How It Works, Examples, Technical Details
- Full localization support in `matchImageHelp` namespace

#### Analytics Service
- New `src/services/analytics.ts` for command tracking
- Automatic tracking of all command executions
- Unique user counting per day
- Command breakdown statistics

### Changed

- **Version bump to 2.0.0** - This release marks full feature parity with the deprecated traditional bot
- Updated `wrangler.toml` with Analytics Engine binding
- Updated `src/types/env.ts` with `ANALYTICS` and `STATS_AUTHORIZED_USERS`
- Enhanced `src/handlers/commands/manual.ts` with topic parameter support

### Deprecated

- The traditional `xivdyetools-discord-bot` (Node.js/Discord.js) is now fully deprecated
- Moved to `_deprecated/` folder in the monorepo
- This worker is now the sole Discord bot for XIV Dye Tools

### Files Added
- `src/services/analytics.ts` - Analytics tracking service
- `src/handlers/commands/stats.ts` - Stats command handler

### Files Modified
- `wrangler.toml` - Added Analytics Engine binding
- `src/types/env.ts` - Added new environment types
- `src/handlers/commands/manual.ts` - Added topic parameter
- `src/handlers/commands/index.ts` - Export stats handler
- `src/index.ts` - Route stats command, add analytics tracking
- `src/locales/en.json` - Added matchImageHelp translations
- `scripts/register-commands.ts` - Added stats command and manual topic option
- `package.json` - Version 2.0.0
- `CLAUDE.md` - Updated documentation

---

## [1.1.0] - 2025-12-07

### Added

#### Preset Editing
- `/preset edit` - Edit your own presets (name, description, dyes, tags)
- Autocomplete for user's own presets
- Duplicate dye combination detection
- Content moderation for edited text

#### Moderation
- **Revert Button**: New moderation button to revert flagged edits
- Modal for revert reason input
- Logs revert actions in moderation log

### Changed

- Updated `/preset` command registration with edit subcommand
- Added `preset_revert_` button handler

### Files Modified
- `src/handlers/commands/preset.ts` - Edit subcommand
- `src/handlers/buttons/preset-moderation.ts` - Revert button handler
- `src/services/preset-api.ts` - Edit and revert API methods
- `scripts/register-commands.ts` - Updated command definitions

---

## [1.0.0] - 2025-12-07

### Added

#### Architecture
- **HTTP Interactions**: Discord bot using HTTP Interactions instead of Gateway WebSocket
- **Cloudflare Workers**: Serverless deployment on Cloudflare edge network
- **Ed25519 Verification**: Request signature verification for Discord interactions

#### Commands
- `/harmony` - Generate color harmony wheels (complementary, triadic, analogous, split-complementary, tetradic, square)
- `/match <color>` - Find closest FFXIV dye to a hex color
- `/match_image` - Extract and match colors from uploaded images (1-5 colors with K-means++ clustering)
- `/dye <name>` - Search the 136-dye database by name
- `/mixer <start> <end>` - Create color gradients between two dyes
- `/accessibility <dye>` - Simulate colorblindness for dye colors
- `/comparison` - Compare multiple dyes side-by-side
- `/manual` - Help and documentation
- `/language` - Change bot UI language (6 languages supported)
- `/favorites` - Manage favorite dyes (add, remove, list)
- `/collection` - Create and manage custom dye collections
- `/preset` - Browse, submit, and vote on community presets
- `/about` - Bot information and credits

#### Features
- **SVG→PNG Rendering**: High-quality image generation via resvg-wasm
- **Rate Limiting**: Per-user, per-command sliding window rate limiter (KV-backed)
- **Favorites System**: Save up to 20 favorite dyes per user
- **Collections System**: Create up to 50 custom collections with up to 20 dyes each
- **Community Presets**: Browse, submit, and vote on user-created color palettes
- **Multi-Language Support**: Full localization for EN, JA, DE, FR, KO, ZH

#### Integrations
- **Service Binding**: Direct connection to xivdyetools-presets-api for preset operations
- **xivdyetools-core**: Shared color algorithms, dye database, and type definitions
- **Universalis API**: Real-time market board pricing (optional)

#### Storage
- **Cloudflare KV**: User preferences, favorites, collections, rate limit counters
- **Cloudflare R2**: Generated images with automatic expiration (optional)
