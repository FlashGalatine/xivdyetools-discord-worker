# What's New in v4.0.1

*Released: February 9, 2026*

---

## Bug Fixes

### Localization Race Condition
Fixed an issue where the bot's language could get confused under heavy load. If multiple users with different language settings used the bot at the same time, one user might briefly see responses in another user's language. Each language now has its own isolated instance, so this can no longer happen.

### Budget Command Fixes
- The "no world set" error in `/budget` no longer shows a broken image — it now displays a clean text message instead
- Fixed a missing input check when renaming collections, closing a gap that could allow unusual characters

### Discord API Reliability
- Bot responses now have proper timeouts (5s for text, 10s for images) so they won't hang indefinitely if Discord is slow
- If the bot takes too long to process a command, it now gracefully skips the response instead of sending an error after Discord's deadline has passed

### Webhook Security
- The GitHub webhook endpoint now rejects oversized payloads before reading them, rather than buffering the entire body first

### User Tracking
- Fixed a race condition where rapid concurrent requests could lose unique user counts in analytics

---

## Performance Improvements

- **Faster autocomplete**: World and datacenter lists are now cached for 1 hour, eliminating a network request on every keystroke
- **Smarter budget searches**: `/budget find` now pre-filters dyes by color similarity before checking market prices, reducing API calls by 70-85%
- **Less wasted work**: Removed an unnecessary image render that was being generated but never shown in the budget "no world set" response

---

## Code Quality

- Consolidated duplicated code for dye input resolution and DyeService creation across the codebase
- Localized all `/preferences` command strings across all 6 supported languages

---

## Dependencies Updated

- `@cloudflare/workers-types` 4.20260131.0 → 4.20260207.0
- `hono` 4.11.7 → 4.11.9
- `@types/node` 25.2.0 → 25.2.2

---

For the full technical changelog, see [CHANGELOG.md](./CHANGELOG.md).
