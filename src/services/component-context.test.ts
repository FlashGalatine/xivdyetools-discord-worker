/**
 * Tests for Component Context Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildCustomId,
  parseCustomId,
  storeContext,
  getContext,
  deleteContext,
  updateContext,
  isAuthorized,
  buildBlendingModeSelect,
  buildMatchingMethodSelect,
  buildMarketToggleButton,
  buildRefreshButton,
  CONTEXT_TTL,
} from './component-context.js';
import type { ComponentContext } from './component-context.js';

// Mock KV namespace
function createMockKV() {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, { value: string; expiresAt?: number }> };
}

// Mock logger
const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as never;

describe('Component Context Service', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.clearAllMocks();
  });

  describe('buildCustomId', () => {
    it('builds custom_id without value', () => {
      const id = buildCustomId('algo', 'mixer', 'abc12345');
      expect(id).toBe('algo_mixer_abc12345');
    });

    it('builds custom_id with value', () => {
      const id = buildCustomId('algo', 'mixer', 'abc12345', 'spectral');
      expect(id).toBe('algo_mixer_abc12345_spectral');
    });

    it('throws for custom_id exceeding 100 characters', () => {
      const longValue = 'x'.repeat(100);
      expect(() => buildCustomId('algo', 'mixer', 'abc12345', longValue)).toThrow('exceeds 100 characters');
    });
  });

  describe('parseCustomId', () => {
    it('parses custom_id without value', () => {
      const result = parseCustomId('algo_mixer_abc12345');

      expect(result).toEqual({
        action: 'algo',
        command: 'mixer',
        hash: 'abc12345',
        value: undefined,
      });
    });

    it('parses custom_id with value', () => {
      const result = parseCustomId('market_toggle_xyz789_on');

      expect(result).toEqual({
        action: 'market',
        command: 'toggle',
        hash: 'xyz789',
        value: 'on',
      });
    });

    it('parses custom_id with value containing underscores', () => {
      const result = parseCustomId('page_list_hash123_some_complex_value');

      expect(result).toEqual({
        action: 'page',
        command: 'list',
        hash: 'hash123',
        value: 'some_complex_value',
      });
    });

    it('returns null for invalid format (too few parts)', () => {
      expect(parseCustomId('algo_mixer')).toBeNull();
      expect(parseCustomId('algo')).toBeNull();
      expect(parseCustomId('')).toBeNull();
    });

    it('returns null for invalid action', () => {
      expect(parseCustomId('invalid_mixer_hash')).toBeNull();
    });

    it('parses all valid actions', () => {
      const actions = ['algo', 'market', 'page', 'refresh', 'copy', 'vote', 'moderate'];

      for (const action of actions) {
        const result = parseCustomId(`${action}_cmd_hash`);
        expect(result?.action).toBe(action);
      }
    });
  });

  describe('storeContext', () => {
    it('stores context and returns hash', async () => {
      const context = {
        command: 'mixer',
        userId: 'user123',
        interactionToken: 'token456',
        applicationId: 'app789',
        data: { color1: '#FF0000' },
      };

      const hash = await storeContext(mockKV, context, CONTEXT_TTL.STANDARD, mockLogger);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(8); // 4 bytes = 8 hex chars
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('stores with correct TTL', async () => {
      const context = {
        command: 'test',
        userId: 'user',
        interactionToken: 'token',
        applicationId: 'app',
        data: {},
      };

      await storeContext(mockKV, context, CONTEXT_TTL.PAGINATION, mockLogger);

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^ctx:v1:/),
        expect.any(String),
        { expirationTtl: CONTEXT_TTL.PAGINATION }
      );
    });
  });

  describe('getContext', () => {
    it('returns null when context not found', async () => {
      const result = await getContext(mockKV, 'nonexistent', mockLogger);
      expect(result).toBeNull();
    });

    it('returns stored context', async () => {
      const context = {
        command: 'mixer',
        userId: 'user123',
        interactionToken: 'token',
        applicationId: 'app',
        data: { test: true },
      };

      const hash = await storeContext(mockKV, context, CONTEXT_TTL.STANDARD, mockLogger);
      const result = await getContext(mockKV, hash, mockLogger);

      expect(result).toBeDefined();
      expect(result?.command).toBe('mixer');
      expect(result?.userId).toBe('user123');
      expect(result?.data.test).toBe(true);
    });

    it('returns null for expired context', async () => {
      // Manually insert an expired context
      const expiredContext: ComponentContext = {
        command: 'test',
        userId: 'user',
        interactionToken: 'token',
        applicationId: 'app',
        data: {},
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      mockKV._store.set('ctx:v1:expired', { value: JSON.stringify(expiredContext) });

      const result = await getContext(mockKV, 'expired', mockLogger);
      expect(result).toBeNull();
    });
  });

  describe('deleteContext', () => {
    it('deletes context from KV', async () => {
      const context = {
        command: 'test',
        userId: 'user',
        interactionToken: 'token',
        applicationId: 'app',
        data: {},
      };

      const hash = await storeContext(mockKV, context, CONTEXT_TTL.STANDARD, mockLogger);
      await deleteContext(mockKV, hash, mockLogger);

      const result = await getContext(mockKV, hash, mockLogger);
      expect(result).toBeNull();
    });
  });

  describe('updateContext', () => {
    it('updates context data', async () => {
      const context = {
        command: 'mixer',
        userId: 'user',
        interactionToken: 'token',
        applicationId: 'app',
        data: { mode: 'rgb' },
      };

      const hash = await storeContext(mockKV, context, CONTEXT_TTL.STANDARD, mockLogger);

      const updated = await updateContext(
        mockKV,
        hash,
        { data: { mode: 'spectral' } },
        CONTEXT_TTL.STANDARD,
        mockLogger
      );

      expect(updated).toBeDefined();
      expect(updated?.data.mode).toBe('spectral');
    });

    it('returns null for non-existent context', async () => {
      const result = await updateContext(
        mockKV,
        'nonexistent',
        { data: { test: true } },
        CONTEXT_TTL.STANDARD,
        mockLogger
      );

      expect(result).toBeNull();
    });
  });

  describe('isAuthorized', () => {
    const context: ComponentContext = {
      command: 'mixer',
      userId: 'owner123',
      interactionToken: 'token',
      applicationId: 'app',
      data: {},
      expiresAt: Date.now() + 3600000,
    };

    it('allows original user for any action', () => {
      expect(isAuthorized(context, 'owner123', 'algo')).toBe(true);
      expect(isAuthorized(context, 'owner123', 'market')).toBe(true);
      expect(isAuthorized(context, 'owner123', 'page')).toBe(true);
      expect(isAuthorized(context, 'owner123', 'refresh')).toBe(true);
    });

    it('denies other users for protected actions', () => {
      expect(isAuthorized(context, 'other456', 'algo')).toBe(false);
      expect(isAuthorized(context, 'other456', 'market')).toBe(false);
      expect(isAuthorized(context, 'other456', 'refresh')).toBe(false);
    });

    it('allows any user for public actions (vote)', () => {
      expect(isAuthorized(context, 'other456', 'vote')).toBe(true);
    });
  });

  describe('Component Builders', () => {
    describe('buildBlendingModeSelect', () => {
      it('builds select menu with correct structure', () => {
        const select = buildBlendingModeSelect('hash123', 'spectral');

        expect(select.type).toBe(3); // Select menu
        expect(select.custom_id).toBe('algo_blending_hash123');
        expect(select.options).toHaveLength(6);
        expect(select.placeholder).toBe('Select blending mode');
      });

      it('marks current mode as default', () => {
        const select = buildBlendingModeSelect('hash', 'oklab');

        const oklabOption = select.options.find((o) => o.value === 'oklab');
        expect(oklabOption?.default).toBe(true);

        const rgbOption = select.options.find((o) => o.value === 'rgb');
        expect(rgbOption?.default).toBe(false);
      });
    });

    describe('buildMatchingMethodSelect', () => {
      it('builds select menu with correct structure', () => {
        const select = buildMatchingMethodSelect('hash456', 'ciede2000');

        expect(select.type).toBe(3);
        expect(select.custom_id).toBe('algo_matching_hash456');
        expect(select.options).toHaveLength(6);
      });

      it('marks current method as default', () => {
        const select = buildMatchingMethodSelect('hash', 'hyab');

        const hyabOption = select.options.find((o) => o.value === 'hyab');
        expect(hyabOption?.default).toBe(true);
      });
    });

    describe('buildMarketToggleButton', () => {
      it('builds button to hide prices when showing', () => {
        const button = buildMarketToggleButton('hash', true);

        expect(button.type).toBe(2);
        expect(button.style).toBe(1); // Primary when active
        expect(button.label).toBe('Hide Prices');
        expect(button.custom_id).toContain('off');
      });

      it('builds button to show prices when hidden', () => {
        const button = buildMarketToggleButton('hash', false);

        expect(button.type).toBe(2);
        expect(button.style).toBe(2); // Secondary when inactive
        expect(button.label).toBe('Show Prices');
        expect(button.custom_id).toContain('on');
      });
    });

    describe('buildRefreshButton', () => {
      it('builds refresh button', () => {
        const button = buildRefreshButton('hash789');

        expect(button.type).toBe(2);
        expect(button.style).toBe(2); // Secondary
        expect(button.label).toBe('Refresh');
        expect(button.custom_id).toBe('refresh_result_hash789');
        expect(button.emoji.name).toBe('🔄');
      });
    });
  });
});
