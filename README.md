# XIV Dye Tools Discord Worker

**v2.0.1** | Discord bot for FFXIV dye color exploration, running on Cloudflare Workers using HTTP Interactions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020)](https://workers.cloudflare.com/)

## Features

🎨 **Color Harmony Generation** - Create complementary, triadic, analogous, and more color schemes
🎯 **Dye Matching** - Find closest FFXIV dyes to any color (hex or image upload)
♿ **Accessibility** - Colorblindness simulation for protan, deutan, tritan vision types
📊 **Dye Comparison** - Side-by-side comparison of up to 4 dyes with visualizations
🌈 **Color Mixing** - Find intermediate dyes for smooth color gradients
⭐ **Favorites** - Save up to 20 favorite dyes per user
📁 **Collections** - Create up to 50 custom dye collections
🗳️ **Community Presets** - Browse, submit, and vote on user-created color palettes
💰 **Live Pricing** - Market board prices via Universalis API
🌐 **Multi-Language** - Full localization for EN, JA, DE, FR, KO, ZH
⚡ **Serverless** - Runs on Cloudflare Workers edge network with auto-scaling

## Commands (17 Total)

### Color Tools
| Command | Description |
|---------|-------------|
| `/harmony <color>` | Generate color harmonies with color wheel visualization |
| `/match <color>` | Find closest dye to a hex color |
| `/match_image` | Upload an image to extract and match colors (1-5 colors) |
| `/mixer <start> <end>` | Create color gradients between two dyes |

### Dye Database
| Command | Description |
|---------|-------------|
| `/dye search <name>` | Search the 136-dye database by name |
| `/dye info <dye>` | Get detailed information about a specific dye |
| `/dye list [category]` | List dyes by category |
| `/dye random` | Show a random dye |

### Analysis Tools
| Command | Description |
|---------|-------------|
| `/comparison <dye1> <dye2> [dye3] [dye4]` | Compare multiple dyes side-by-side |
| `/accessibility <dye>` | Simulate colorblindness for dye colors |

### User Data
| Command | Description |
|---------|-------------|
| `/favorites` | View, add, or remove favorite dyes |
| `/collection` | Create and manage custom dye collections |

### Community Presets
| Command | Description |
|---------|-------------|
| `/preset list [category]` | Browse curated and community color palettes |
| `/preset show <name>` | Display a preset's colors with swatch visualization |
| `/preset random` | Show a random preset |
| `/preset submit` | Submit your own color palette to the community |
| `/preset vote <preset>` | Vote for a community preset |
| `/preset edit <preset>` | Edit your submitted preset |
| `/preset moderate <preset>` | Moderation actions (moderators only) |

### Utility
| Command | Description |
|---------|-------------|
| `/language <locale>` | Change bot UI language |
| `/manual` | Help and documentation |
| `/about` | Bot information and credits |
| `/stats` | Usage statistics (authorized users only) |

## Privacy & Terms

🔒 **Privacy Policy**: See [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) for information about data collection, storage, and usage.

📜 **Terms of Service**: See [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) for usage terms.

**Summary:**
- We collect Discord user IDs for favorites, collections, and rate limiting
- Images uploaded via `/match_image` are processed in-memory and **not stored**
- We do not share or sell your data
- Full details in the linked documents

## Tech Stack

- **Cloudflare Workers** - Serverless edge deployment
- **HTTP Interactions** - No WebSocket, Discord's HTTP-based interaction model
- **xivdyetools-core** - Shared color algorithms and dye database
- **resvg-wasm** - SVG to PNG rendering
- **Hono** - Lightweight web framework
- **Cloudflare KV** - User preferences, favorites, collections
- **Cloudflare D1** - Preset storage (via presets-api)
- **TypeScript** - Type-safe development

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

   # Create R2 bucket (optional, for image caching)
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
│  │  Ed25519 Verification    │   │
│  └─────────────────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │  Hono Router             │   │
│  └─────────────────────────┘   │
│              │                  │
│    ┌─────────┼─────────┐       │
│    ▼         ▼         ▼       │
│  Commands  Buttons  Autocomplete│
│                                 │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Service Bindings               │
│  • xivdyetools-presets-api      │
│  • Cloudflare KV (favorites)    │
│  • Cloudflare R2 (images)       │
└─────────────────────────────────┘
```

## Coming Soon

**Budget-Aware Dye Suggestions** - Find affordable alternatives to expensive dyes with `/match --max_price` and `/dye alternatives`. See [specification](../xivdyetools-docs/BUDGET_AWARE_SUGGESTIONS.md) for details.

## Related Projects

- **[xivdyetools-core](https://github.com/FlashGalatine/xivdyetools-core)** - Core color algorithms (npm package)
- **[XIV Dye Tools Web App](https://github.com/FlashGalatine/xivdyetools-web-app)** - Interactive web tools
- **[xivdyetools-presets-api](https://github.com/FlashGalatine/xivdyetools-presets-api)** - Community presets API
- **[xivdyetools-oauth](https://github.com/FlashGalatine/xivdyetools-oauth)** - OAuth authentication worker

## License

MIT © 2025 Flash Galatine

See [LICENSE](./LICENSE) for full details.

## Legal Notice

**This is a fan-made tool and is not affiliated with or endorsed by Square Enix Co., Ltd. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.**

## Support

- **Issues**: [GitHub Issues](https://github.com/FlashGalatine/xivdyetools-discord-worker/issues)
- **Discord**: [Join Server](https://discord.gg/rzxDHNr6Wv)

---

**Made with ❤️ for the FFXIV community**
