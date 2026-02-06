# XIV Dye Tools Discord Worker

**v4.0.0** | Discord bot for FFXIV dye color exploration, running on Cloudflare Workers using HTTP Interactions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020)](https://workers.cloudflare.com/)

## Features

🎨 **Color Harmony Generation** - Create complementary, triadic, analogous, and more color schemes across multiple color spaces
🎯 **Color Extraction & Matching** - Find closest FFXIV dyes to any hex color, dye name, or uploaded image
🧪 **Dye Blending** - Blend two dyes with 6 color algorithms (RGB, LAB, OKLAB, RYB, HSL, Spectral)
🌈 **Color Gradients** - Generate gradients between colors with 5 color space interpolations
👤 **Character Swatch Matching** - Match dyes to skin, hair, eyes, and more across all 16 FFXIV clans
♿ **Accessibility** - Colorblindness simulation for protan, deutan, tritan vision types
📊 **Dye Comparison** - Side-by-side comparison of up to 4 dyes with LAB color values
💰 **Budget Planning** - Market board prices and affordable dye alternatives via Universalis API
🗳️ **Community Presets** - Browse, submit, vote on, and moderate user-created color palettes
🌐 **Multi-Language** - Full localization for EN, JA, DE, FR, KO, ZH with bundled CJK fonts
⚡ **Serverless** - Runs on Cloudflare Workers edge network with auto-scaling
🛡️ **Text Sanitization** - Protection against zalgo text, control characters, and display issues

## Commands (15 Total)

### Color Tools
| Command | Description |
|---------|-------------|
| `/extractor color <color>` | Find closest dye(s) to a hex color or dye name |
| `/extractor image` | Upload an image to extract and match colors (1-5 colors) |
| `/harmony <color>` | Generate color harmonies with color wheel visualization (HSV, OKLCH, LCH, HSL) |
| `/gradient <start> <end>` | Create color gradients between two colors with dye matches (5 color spaces, 5 matching algorithms) |
| `/mixer <dye1> <dye2>` | Blend two dyes with 6 color algorithms (RGB, LAB, OKLAB, RYB, HSL, Spectral) |

### Dye Database
| Command | Description |
|---------|-------------|
| `/dye search <name>` | Search the 136-dye database by name |
| `/dye info <dye>` | Visual info card with color swatch, name, category, HEX/RGB/HSV/LAB values |
| `/dye list [category]` | List dyes by category |
| `/dye random` | Infographic grid of 5 random dyes |

### Analysis Tools
| Command | Description |
|---------|-------------|
| `/comparison <dye1> <dye2> [dye3] [dye4]` | Compare multiple dyes side-by-side with LAB color values |
| `/accessibility <dye>` | Simulate colorblindness for dye colors |
| `/swatch` | Match dyes to character colors (skin, hair, eyes, etc.) across all 16 FFXIV clans |
| `/budget` | Find affordable dye alternatives with live market board pricing |

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
| `/preferences` | Manage all bot settings (language, blending, matching, count, clan, gender, world, market) |
| `/language <locale>` | Change bot UI language *(deprecated — use `/preferences set language`)* |
| `/manual` | Help and documentation |
| `/about` | Bot information and credits |
| `/stats` | Usage statistics with 5 views: summary (public), overview/commands/preferences/health (admin) |

## Privacy & Terms

🔒 **Privacy Policy**: See [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) for information about data collection, storage, and usage.

📜 **Terms of Service**: See [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) for usage terms.

**Summary:**
- We collect Discord user IDs for preferences, presets, and rate limiting
- Images uploaded via `/extractor image` are processed in-memory and **not stored**
- We do not share or sell your data
- Full details in the linked documents

## Tech Stack

- **Cloudflare Workers** - Serverless edge deployment
- **HTTP Interactions** - No WebSocket, Discord's HTTP-based interaction model
- **@xivdyetools/core** - Shared color algorithms, dye database, and localization
- **resvg-wasm** - SVG to PNG rendering with bundled CJK font subsets
- **Hono** - Lightweight web framework
- **Cloudflare KV** - User preferences and presets
- **Cloudflare Cache API** - Image caching and component context storage
- **Cloudflare D1** - Preset storage (via presets-api)
- **Upstash Redis** - Atomic rate limiting (with KV fallback)
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

### CJK Font Support (Japanese/Korean/Chinese)

The bot generates PNG images for Discord responses using resvg-wasm. CJK font support is **bundled by default** using subsetted versions of Noto Sans:

- **Noto Sans SC** (~222 KiB) - Covers Chinese and Japanese katakana
- **Noto Sans KR** (~155 KiB) - Covers Korean Hangul

These subsets contain only the characters needed for FFXIV dye names, keeping the bundle small (~377 KiB total vs ~20 MiB for full fonts).

**Re-subsetting fonts** (only needed if new dyes are added with new CJK characters):
```bash
python scripts/subset-cjk-fonts.py
```

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
│  • Cloudflare KV (preferences)  │
│  • Cloudflare Cache API         │
│  • Upstash Redis (rate limits)  │
│  • Cloudflare R2 (images)       │
└─────────────────────────────────┘
```

## Related Projects

- **[xivdyetools-core](https://github.com/FlashGalatine/xivdyetools-core)** - Core color algorithms (npm package)
- **[XIV Dye Tools Web App](https://github.com/FlashGalatine/xivdyetools-web-app)** - Interactive web tools
- **[xivdyetools-presets-api](https://github.com/FlashGalatine/xivdyetools-presets-api)** - Community presets API
- **[xivdyetools-oauth](https://github.com/FlashGalatine/xivdyetools-oauth)** - OAuth authentication worker

## License

MIT © 2025-2026 Flash Galatine

See [LICENSE](./LICENSE) for full details.

## Legal Notice

**This is a fan-made tool and is not affiliated with or endorsed by Square Enix Co., Ltd. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.**

## Connect With Me

**Flash Galatine** | Balmung (Crystal)

🎮 **FFXIV**: [Lodestone Character](https://na.finalfantasyxiv.com/lodestone/character/7677106/)
📝 **Blog**: [Project Galatine](https://blog.projectgalatine.com/)
💻 **GitHub**: [@FlashGalatine](https://github.com/FlashGalatine)
🐦 **X / Twitter**: [@AsheJunius](https://x.com/AsheJunius)
📺 **Twitch**: [flashgalatine](https://www.twitch.tv/flashgalatine)
🌐 **BlueSky**: [projectgalatine.com](https://bsky.app/profile/projectgalatine.com)
❤️ **Patreon**: [ProjectGalatine](https://patreon.com/ProjectGalatine)
☕ **Ko-Fi**: [flashgalatine](https://ko-fi.com/flashgalatine)
💬 **Discord**: [Join Server](https://discord.gg/5VUSKTZCe5)

## Support

- **Issues**: [GitHub Issues](https://github.com/FlashGalatine/xivdyetools-discord-worker/issues)
- **Discord**: [Join Server](https://discord.gg/5VUSKTZCe5)

---

**Made with ❤️ for the FFXIV community**
