# XIV Dye Tools Discord Worker

Discord bot for FFXIV dye color exploration, running on Cloudflare Workers using HTTP Interactions.

## Overview

This is the Cloudflare Workers version of the XIV Dye Tools Discord bot, migrated from the traditional Discord.js Gateway model to Discord's HTTP Interactions model.

### Key Features

- **Serverless**: Runs on Cloudflare Workers edge network
- **No WebSocket**: Uses HTTP Interactions instead of Gateway
- **Auto-scaling**: Handles traffic spikes automatically
- **Low latency**: Global edge deployment

## Development

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Discord application with bot

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in your Discord credentials:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Start local development server:
   ```bash
   npm run dev
   ```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run type-check` | Run TypeScript type checking |
| `npm run register-commands` | Register slash commands with Discord |

### Registering Commands

Set environment variables and run:

```powershell
# PowerShell
$env:DISCORD_TOKEN = "your-bot-token"
$env:DISCORD_CLIENT_ID = "your-client-id"
$env:DISCORD_GUILD_ID = "your-test-server-id"  # Optional, for faster testing
npm run register-commands
```

## Deployment

### First-time Setup

1. Create Cloudflare resources:
   ```bash
   # Create KV namespace
   wrangler kv namespace create "DISCORD_BOT_KV"

   # Create R2 bucket
   wrangler r2 bucket create xivdyetools-bot-images
   ```

2. Update `wrangler.toml` with the created resource IDs

3. Set secrets:
   ```bash
   wrangler secret put DISCORD_TOKEN
   wrangler secret put DISCORD_PUBLIC_KEY
   wrangler secret put BOT_API_SECRET
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```

5. Configure Discord:
   - Go to Discord Developer Portal
   - Set "Interactions Endpoint URL" to your Worker URL

## Architecture

```
Discord API
     │
     ▼ HTTP POST (Interactions)
┌─────────────────────────────────┐
│   Cloudflare Worker             │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Signature Verification  │   │
│  └─────────────────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │  Interaction Router      │   │
│  └─────────────────────────┘   │
│              │                  │
│    ┌─────────┼─────────┐       │
│    ▼         ▼         ▼       │
│  Commands  Buttons  Autocomplete│
│                                 │
└─────────────────────────────────┘
```

## License

ISC
