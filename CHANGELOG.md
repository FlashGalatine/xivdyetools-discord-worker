# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
