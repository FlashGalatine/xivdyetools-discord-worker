# What's New in v4.0.0

*Released: February 5, 2026*

---

## Overview

This is a **major update** that brings new commands, better visuals, full localization, and smarter performance. Whether you're a glamour enthusiast matching dyes to your character or a market board shopper budgeting your dye purchases, v4 has something for you.

---

## New Commands

### /extractor - One-Stop Color Matching

Replaces the old `/match` and `/match_image` commands with a single, unified command:
- **`/extractor color`** - Paste a hex code or dye name and find the closest FFXIV dyes
- **`/extractor image`** - Upload a screenshot and let the bot extract and match colors automatically

### /gradient - Color Gradients (Renamed from /mixer)

The old `/mixer` is now `/gradient` with powerful new options:
- Choose from **5 color spaces** (HSV, OKLCH, LAB, LCH, RGB) to control how colors blend
- Pick your preferred **matching algorithm** (OKLAB, CIEDE2000, and more)

### /mixer - Dye Blending

A brand-new command for blending two dyes together using real color science:
- **6 blending algorithms**: RGB, LAB, OKLAB, RYB, HSL, and Spectral (Kubelka-Munk)
- Finds the closest FFXIV dye to the blended result

### /swatch - Character Color Matching

Match dyes to your character's natural colors:
- Supports skin, hair, eyes, highlights, lips, tattoos, and facepaint
- Covers all **16 FFXIV clans** with gender variants
- Great for finding dyes that complement your character

### /preferences - Unified Settings

Manage all your bot preferences in one place:
- Set language, blending mode, matching algorithm, result count, and more
- Change multiple settings at once with a single command
- Replaces the old `/language` command

### /stats - Expanded Bot Statistics

Now with 5 focused views:
- **summary** (everyone) - Quick bot overview
- **overview**, **commands**, **preferences**, **health** (admins) - Detailed analytics

---

## Improved Commands

### /harmony
- New **color space** parameter lets you choose how hue rotations are calculated (HSV, OKLCH, LCH, HSL) for perceptually different results

### /dye info
- Beautiful new **visual card** showing a large color swatch with the dye name, category, and all color values (HEX, RGB, HSV, LAB)

### /dye random
- Eye-catching **infographic grid** displaying 5 random dyes in a polished card layout

### /comparison
- Now shows **LAB color values** alongside existing hex/RGB data for better perceptual comparison

---

## Better Language Support

- **Korean, Japanese, and Chinese dye names** now render properly in all generated images
- We bundled optimized CJK fonts (only ~377 KiB total) so text always looks crisp
- All new v4 commands are fully translated into all 6 supported languages (English, Japanese, German, French, Korean, Chinese)
- The `/about` command is now fully localized too

---

## /budget Fixes

Fixed several issues that were preventing the `/budget` command from working:
- Now handles the full dye catalog correctly (was failing with more than 100 dyes)
- Fixed market price data parsing
- Facewear dyes (which can't be traded) are now properly excluded from market lookups
- Added full language support to the budget comparison graphic

---

## Deprecation Notices

The following commands still work but now show a deprecation notice:
- **`/language`** → Use `/preferences set language` instead
- **`/favorites`** → Use `/preset` instead
- **`/collection`** → Use `/preset` instead

These will be removed in a future update, so please start using the new commands.

---

## Behind the Scenes

- **Faster & cheaper**: Moved temporary data from KV storage to the Cache API, saving hundreds of write operations per command
- **Better rate limiting**: Switched to Upstash Redis for atomic rate limit counters, fixing edge cases where rapid requests could bypass limits
- **Security audit**: Comprehensive review of all internal libraries, hardening authentication, logging, and rate limiting
- **Auto-announcements**: The bot can now automatically post release notes to Discord when we publish updates
- **CI/CD pipeline**: Automated deployment to Cloudflare Workers

---

## For Developers

If you're interested in the technical details, check out [CHANGELOG.md](./CHANGELOG.md) for the full breakdown including commit references.

---

*Enjoy the new features! If you run into any issues, let us know.*
