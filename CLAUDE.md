# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Version 2.0.0** - The primary Discord bot for FFXIV dye color tools. Uses HTTP Interactions (not Gateway WebSocket) for serverless operation on the edge network.

This bot replaces the deprecated `xivdyetools-discord-bot` (traditional Node.js/Discord.js bot).

## Quick Commands

```bash
npm run dev                  # Start local dev server (wrangler)
npm run deploy               # Deploy to staging
npm run deploy:production    # Deploy to production
npm run test                 # Run vitest tests
npm run type-check           # TypeScript checking only
npm run lint                 # ESLint
npm run register-commands    # Register slash commands with Discord
npm run upload-emojis        # Upload emoji mappings to Discord
```

### Registering Commands (PowerShell)

```powershell
$env:DISCORD_TOKEN = "your-token"
$env:DISCORD_CLIENT_ID = "your-client-id"
$env:DISCORD_GUILD_ID = "test-server-id"  # Optional, for faster testing
npm run register-commands
```

### Setting Secrets

```bash
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put BOT_API_SECRET
wrangler secret put INTERNAL_WEBHOOK_SECRET
wrangler secret put STATS_AUTHORIZED_USERS    # Comma-separated user IDs for /stats
wrangler secret put MODERATOR_IDS             # Comma-separated user IDs for moderation
```

## Architecture

### HTTP Interactions Flow

```
Discord → POST / → Ed25519 Signature Verification → Hono Router → Handler
```

Unlike traditional Gateway bots, this bot receives all interactions as HTTP POST requests. The main entry point (`src/index.ts`) routes interactions by type:
- `PING` → Endpoint verification
- `APPLICATION_COMMAND` → Slash commands
- `APPLICATION_COMMAND_AUTOCOMPLETE` → Autocomplete handlers
- `MESSAGE_COMPONENT` → Button clicks
- `MODAL_SUBMIT` → Modal form submissions

### Key Directories

```
src/
├── handlers/
│   ├── commands/        # Slash command handlers (harmony, dye, match, mixer, etc.)
│   ├── buttons/         # Button interaction handlers
│   └── modals/          # Modal submission handlers
├── services/
│   ├── svg/             # SVG generation + PNG rendering via resvg-wasm
│   ├── image/           # Image processing via Photon WASM
│   ├── analytics.ts     # Analytics Engine + KV-based stats tracking
│   ├── rate-limiter.ts  # Per-user sliding window (KV-backed)
│   ├── user-storage.ts  # Favorites & collections (KV-backed)
│   ├── preset-api.ts    # Preset API client (Service Binding preferred)
│   └── bot-i18n.ts      # Bot UI translations (6 languages)
├── utils/
│   ├── verify.ts        # Ed25519 signature verification
│   ├── response.ts      # Discord response builders
│   └── discord-api.ts   # REST API utilities (follow-ups, edits)
└── types/
    └── env.ts           # Environment bindings, Discord enums
```

### Environment Bindings (wrangler.toml)

| Binding | Type | Purpose |
|---------|------|---------|
| `KV` | KV Namespace | Rate limiting, user preferences, analytics counters |
| `DB` | D1 Database | Preset storage |
| `ANALYTICS` | Analytics Engine | Command usage tracking (long-term storage) |
| `PRESETS_API` | Service Binding | Worker-to-Worker preset API |

### Required Secrets

- `DISCORD_TOKEN` - Bot token
- `DISCORD_PUBLIC_KEY` - For request signature verification

### Optional Secrets

- `BOT_API_SECRET` - Auth for preset API calls
- `INTERNAL_WEBHOOK_SECRET` - Webhook authentication
- `STATS_AUTHORIZED_USERS` - Comma-separated user IDs for /stats command
- `MODERATOR_IDS` - Comma-separated user IDs for moderation
- `MODERATION_CHANNEL_ID` - Channel for pending presets
- `SUBMISSION_LOG_CHANNEL_ID` - Channel for all preset submissions

## Key Patterns

### Command Handler Pattern

Each command is a separate function in `src/handlers/commands/`:

```typescript
export async function handleMyCommand(
  interaction: DiscordInteraction,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // For long operations, defer first
  await sendDeferredResponse(interaction, env);

  // Process and send follow-up
  await sendFollowup(interaction, env, { embeds: [...] });
  return new Response(null, { status: 202 });
}
```

### Rate Limiting

Commands have specific limits in `COMMAND_LIMITS` map:
- Image processing commands: 5 req/min
- Standard commands: 15 req/min
- Uses 60-second sliding window with KV storage

### User Storage Limits

- Max 20 favorites
- Max 50 collections
- Max 20 dyes per collection
- Keys prefixed: `xivdye:favorites:${userId}`, `xivdye:collections:${userId}`

### SVG to PNG Rendering

1. Build SVG as string (see `src/services/svg/*.ts`)
2. Convert via resvg-wasm: `renderSvgToPng(svgString)`
3. Return as Discord attachment

### Preset API Client

Uses Service Binding (`env.PRESETS_API`) when available, falls back to HTTP URL:

```typescript
// Prefer Service Binding (no HTTP overhead)
if (env.PRESETS_API) {
  return env.PRESETS_API.fetch(request);
}
// Fallback to external URL
return fetch(`${env.PRESETS_API_URL}/presets`, { ... });
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework |
| `xivdyetools-core` | Dye database, color algorithms |
| `@resvg/resvg-wasm` | SVG to PNG rendering |
| `@cf-wasm/photon` | Image processing (dominant color extraction) |
| `discord-interactions` | Ed25519 signature verification |

## Localization

- 6 languages: `en`, `ja`, `de`, `fr`, `ko`, `zh`
- Bot UI translations in `src/locales/` (static JSON imports)
- Dye names from xivdyetools-core
- Auto-detects from `interaction.locale`

## Available Commands

| Command | Description |
|---------|-------------|
| `/harmony` | Generate harmonious dye combinations (complementary, triadic, etc.) |
| `/match` | Find closest FFXIV dye to a hex color |
| `/match_image` | Extract colors from image and match to dyes |
| `/mixer` | Create color gradient between two colors |
| `/dye search` | Search dyes by name |
| `/dye info` | Get detailed dye information |
| `/dye list` | List dyes by category |
| `/dye random` | Get random dye suggestions |
| `/comparison` | Compare 2-4 dyes side by side |
| `/accessibility` | Colorblindness simulation and contrast analysis |
| `/favorites` | Manage favorite dyes (add/remove/list/clear) |
| `/collection` | Manage custom dye collections |
| `/preset` | Browse/submit/vote on community presets |
| `/language` | Set preferred bot language |
| `/manual` | Show help guide (optional: `topic:match_image`) |
| `/about` | Bot information |
| `/stats` | Usage statistics (authorized users only) |

## Webhook Endpoints

- `POST /webhooks/preset-submission` - Receives preset submissions from web app
- `GET /health` - Health check endpoint

## Analytics

Commands are automatically tracked via:
1. **Analytics Engine** - Long-term storage with aggregation (if configured)
2. **KV Counters** - Real-time stats accessible via `/stats` command

Stats available:
- Total commands executed
- Success rate
- Top 5 most used commands
- Unique users per day
