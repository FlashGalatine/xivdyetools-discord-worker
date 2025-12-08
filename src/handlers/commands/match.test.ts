/**
 * Tests for /match command handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMatchCommand } from './match.js';
import type { DiscordInteraction, Env } from '../../types/env.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dyeA = { id: 101, name: 'Dye One', hex: '#101010', category: 'General', itemID: 1001 };
const dyeB = { id: 102, name: 'Dye Two', hex: '#202020', category: 'General', itemID: 1002 };
const dyeRose = { id: 103, name: 'Rose Pink', hex: '#ff6699', category: 'General', itemID: 1003 };

vi.mock('xivdyetools-core', () => {
  class MockDyeService {
    searchByName(query: string) {
      if (query.toLowerCase().includes('rose')) return [dyeRose];
      return [];
    }
    findClosestDye(_hex: string, excludeIds: number[] = []) {
      if (!excludeIds.includes(dyeA.id)) return dyeA;
      if (!excludeIds.includes(dyeB.id)) return dyeB;
      return null;
    }
  }

  const ColorService = {
    hexToRgb: (hex: string) => {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    },
    rgbToHsv: (r: number, g: number, b: number) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const s = max === 0 ? 0 : d / max;
      let h = 0;
      if (d !== 0) {
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          default:
            h = (r - g) / d + 4;
        }
        h /= 6;
      }
      return { h: h * 360, s: s * 100, v: (max / 255) * 100 };
    },
  };

  return { DyeService: MockDyeService, dyeDatabase: [], ColorService };
});

vi.mock('../../services/emoji.js', () => ({ getDyeEmoji: () => '🎨' }));
vi.mock('../../services/i18n.js', () => ({
  initializeLocale: vi.fn().mockResolvedValue(undefined),
  getLocalizedDyeName: (_id: number, name: string) => `${name}-localized`,
}));

vi.mock('../../services/bot-i18n.js', () => ({
  createUserTranslator: vi.fn(async () => translator),
}));

vi.mock('../buttons/index.js', () => ({
  createCopyButtons: vi.fn(() => ({ type: 1, components: [] })),
}));

// Use real response helpers

// ---------------------------------------------------------------------------
// Translator helper
// ---------------------------------------------------------------------------
const translator = {
  t: (key: string, vars?: Record<string, any>) => {
    const map: Record<string, string> = {
      'common.error': 'Error',
      'common.distance': 'Distance',
      'common.quality': 'Quality',
      'common.inputColor': 'Input Color',
      'common.closestDye': 'Closest Dye',
      'common.matchQuality': 'Match Quality',
      'common.footer': 'Footer',
      'common.rgb': 'RGB',
      'common.hsv': 'HSV',
      'common.category': 'Category',
      'common.useInfo': 'Use info',
      'errors.missingInput': 'Missing input',
      'errors.invalidColor': `Invalid color: ${vars?.input}`,
      'errors.noMatchFound': 'No matches found',
      'quality.perfect': 'Perfect',
      'quality.excellent': 'Excellent',
      'quality.good': 'Good',
      'quality.fair': 'Fair',
      'quality.approximate': 'Approximate',
      'match.useInfoHint': 'Use /info for details',
      'match.useInfoNameHint': 'Use /info <name>',
      'match.title': `Closest match: ${vars?.name ?? ''}`,
      'match.topMatches': `Top ${vars?.count} matches`,
      'match.findingMatches': `Finding matches for ${vars?.input}`,
      'common.qualityLabel': 'Quality label',
    };
    return map[key] ?? key;
  },
  getLocale: () => 'en',
};

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const baseInteraction: DiscordInteraction = {
  type: 2,
  data: {
    name: 'match',
    options: [],
  },
  locale: 'en-US',
  member: { user: { id: 'user-1', username: 'tester' } },
};

const env: Env = {
  KV: {} as KVNamespace,
  DISCORD_PUBLIC_KEY: 'pk',
  DISCORD_APPLICATION_ID: 'app',
  DISCORD_BOT_TOKEN: 'token',
  PRESET_WEBHOOK_SECRET: 'secret',
};

const ctx: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/match command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when color input missing', async () => {
    const interaction = { ...baseInteraction, data: { ...baseInteraction.data, options: [] } };

    const res = await handleMatchCommand(interaction, env, ctx);
    const body = await res.json();

    expect(body.data.embeds[0].description).toBe('Missing input');
    expect(body.data.flags).toBe(64);
  });

  it('returns error for invalid color input', async () => {
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      data: { ...baseInteraction.data, options: [{ name: 'color', value: 'not-a-color' }] },
    };

    const res = await handleMatchCommand(interaction, env, ctx);
    const body = await res.json();

    expect(body.data.embeds[0].description).toContain('Invalid color');
    expect(body.data.flags).toBe(64);
  });

  it('returns single match response with copy buttons', async () => {
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      data: { ...baseInteraction.data, options: [{ name: 'color', value: '#112233' }] },
    };

    const res = await handleMatchCommand(interaction, env, ctx);
    const body = await res.json();

    expect(body.data.embeds[0].title).toContain('Closest match');
    expect(body.data.embeds[0].fields).toHaveLength(3);
    expect(body.data.components).toHaveLength(1);
  });

  it('returns multiple matches when count > 1', async () => {
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      data: {
        ...baseInteraction.data,
        options: [
          { name: 'color', value: '#112233' },
          { name: 'count', value: 2 },
        ],
      },
    };

    const res = await handleMatchCommand(interaction, env, ctx);
    const body = await res.json();

    expect(body.data.embeds[0].title).toContain('Top 2 matches');
    expect(body.data.embeds[0].description).toContain('Dye One-localized');
    expect(body.data.embeds[0].description).toContain('Dye Two-localized');
  });
});
