/**
 * Tests for /collection command handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCollectionCommand } from './collection.js';
import type { DiscordInteraction, Env } from '../../types/env.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dyeSnow = { id: 1, name: 'Snow White', hex: '#ffffff', category: 'General', itemID: 5001 };
const dyeBlack = { id: 2, name: 'Soot Black', hex: '#000000', category: 'General', itemID: 5002 };

vi.mock('xivdyetools-core', () => {
  class MockDyeService {
    searchByName(query: string) {
      if (query.toLowerCase().includes('snow')) return [dyeSnow];
      return [];
    }
    findClosestDye(hex: string) {
      return hex ? dyeBlack : null;
    }
    getDyeById(id: number) {
      if (id === dyeSnow.id) return dyeSnow;
      if (id === dyeBlack.id) return dyeBlack;
      return null;
    }
  }
  return { DyeService: MockDyeService, dyeDatabase: [] };
});

vi.mock('../../services/emoji.js', () => ({ getDyeEmoji: () => '🎨' }));
vi.mock('../../services/i18n.js', () => ({
  initializeLocale: vi.fn().mockResolvedValue(undefined),
  getLocalizedDyeName: (_id: number, name: string) => `${name}-loc`,
  discordLocaleToLocaleCode: () => 'en',
}));

// User storage functions to be controlled per test
const mockStorage = vi.hoisted(() => ({
  getCollections: vi.fn(),
  getCollection: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  renameCollection: vi.fn(),
  addDyeToCollection: vi.fn(),
  removeDyeFromCollection: vi.fn(),
}));

vi.mock('../../services/user-storage.js', () => ({
  ...mockStorage,
  MAX_COLLECTIONS: 5,
  MAX_DYES_PER_COLLECTION: 10,
  MAX_COLLECTION_NAME_LENGTH: 20,
}));

vi.mock('../../services/bot-i18n.js', () => ({
  createUserTranslator: vi.fn(async () => translator),
  createTranslator: () => translator,
}));

// ---------------------------------------------------------------------------
// Translator stub
// ---------------------------------------------------------------------------
const translator = {
  t: (key: string, vars?: Record<string, any>) => {
    const table: Record<string, string> = {
      'errors.userNotFound': 'user not found',
      'errors.missingSubcommand': 'missing subcommand',
      'errors.unknownSubcommand': `unknown subcommand: ${vars?.name}`,
      'errors.missingName': 'missing name',
      'errors.missingInput': 'missing input',
      'errors.dyeNotFound': `dye not found: ${vars?.name}`,
      'errors.failedToSave': 'failed to save',
      'common.error': 'Error',
      'common.success': 'Success',
      'common.dye': 'Dye',
      'common.dyes': 'dyes',
      'common.createdAt': 'Created',
      'collection.created': `created ${vars?.name}`,
      'collection.nameTooLong': `name too long (${vars?.max})`,
      'collection.alreadyExists': `collection exists: ${vars?.name}`,
      'collection.limitReached': `collection limit ${vars?.max}`,
      'collection.notFound': `collection not found: ${vars?.name}`,
      'collection.dyeAlreadyInCollection': `${vars?.dye} already in ${vars?.collection}`,
      'collection.dyeLimitReached': `dye limit ${vars?.max}`,
      'collection.dyeAdded': `${vars?.dye} added to ${vars?.collection}`,
      'collection.dyeRemoved': `${vars?.dye} removed from ${vars?.collection}`,
      'collection.dyeNotInCollection': `${vars?.dye} not in ${vars?.collection}`,
      'collection.collectionEmpty': 'collection empty',
      'collection.addDyeHint': `add more to ${vars?.name}`,
      'collection.title': 'Collections',
      'collection.empty': 'no collections',
      'collection.createHint': 'use /collection create',
      'collection.showHint': 'use /collection show',
      'collection.renamed': `${vars?.oldName} -> ${vars?.newName}`,
    };
    return table[key] ?? key;
  },
  getLocale: () => 'en',
};

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
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

const baseInteraction: DiscordInteraction = {
  type: 2,
  data: { name: 'collection', options: [] },
  locale: 'en-US',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/collection command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when user is missing', async () => {
    const res = await handleCollectionCommand({ ...baseInteraction }, env, ctx);
    const body = await res.json();
    expect(body.data.content).toBe('user not found');
  });

  it('returns error when subcommand missing', async () => {
    const interaction = { ...baseInteraction, member: { user: { id: 'u1', username: 't' } } };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.content).toBe('missing subcommand');
  });

  it('returns error for unknown subcommand', async () => {
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: { ...baseInteraction.data, options: [{ type: 1, name: 'mystery', options: [] }] },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.content).toContain('unknown subcommand');
  });

  it('creates a collection successfully', async () => {
    mockStorage.createCollection.mockResolvedValueOnce({ success: true });
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: { ...baseInteraction.data, options: [{ type: 1, name: 'create', options: [{ name: 'name', value: 'MyCol' }] }] },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.embeds[0].description).toContain('created MyCol');
  });

  it('adds dye and handles alreadyExists', async () => {
    mockStorage.addDyeToCollection.mockResolvedValueOnce({ success: false, reason: 'alreadyExists' });
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: {
        ...baseInteraction.data,
        options: [
          { type: 1, name: 'add', options: [{ name: 'name', value: 'MyCol' }, { name: 'dye', value: 'Snow White' }] },
        ],
      },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.embeds[0].description).toContain('already in MyCol');
  });

  it('shows empty collection info', async () => {
    mockStorage.getCollection.mockResolvedValueOnce({ name: 'MyCol', description: 'desc', dyes: [], createdAt: Date.now() });
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: { ...baseInteraction.data, options: [{ type: 1, name: 'show', options: [{ name: 'name', value: 'MyCol' }] }] },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.embeds[0].description).toContain('collection empty');
  });

  it('lists empty collections', async () => {
    mockStorage.getCollections.mockResolvedValueOnce([]);
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: { ...baseInteraction.data, options: [{ type: 1, name: 'list', options: [] }] },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.embeds[0].description).toContain('no collections');
  });

  it('renames collection not found', async () => {
    mockStorage.renameCollection.mockResolvedValueOnce({ success: false, reason: 'notFound' });
    const interaction: DiscordInteraction = {
      ...baseInteraction,
      member: { user: { id: 'u1', username: 't' } },
      data: {
        ...baseInteraction.data,
        options: [{ type: 1, name: 'rename', options: [{ name: 'name', value: 'Old' }, { name: 'new_name', value: 'New' }] }],
      },
    };
    const res = await handleCollectionCommand(interaction, env, ctx);
    const body = await res.json();
    expect(body.data.embeds[0].description).toContain('collection not found');
  });
});
