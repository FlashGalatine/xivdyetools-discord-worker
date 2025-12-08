/**
 * Tests for /accessibility command handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAccessibilityCommand } from './accessibility.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// Mock dependencies
vi.mock('xivdyetools-core', () => {
  class MockDyeService {
    searchByName(query: string) {
      return [{ id: 1, name: query, hex: '#FF0000', category: 'Standard' }];
    }
    findClosestDye(hex: string) {
      return { id: 1, name: 'Red Dye', hex, category: 'Standard' };
    }
  }
  
  return {
    DyeService: MockDyeService,
    dyeDatabase: {},
  };
});
vi.mock('../../services/bot-i18n.js', () => ({
  createUserTranslator: vi.fn().mockResolvedValue({
    t: (key: string) => key,
    getLocale: () => 'en',
  }),
}));
vi.mock('../../services/i18n.js', () => ({
  initializeLocale: vi.fn(),
}));
vi.mock('../../services/svg/accessibility-comparison.js', () => ({
  generateAccessibilityComparison: vi.fn().mockReturnValue('<svg></svg>'),
}));
vi.mock('../../services/svg/renderer.js', () => ({
  renderSvgToPng: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock('../../utils/discord-api.js', () => ({
  uploadFileToDiscord: vi.fn().mockResolvedValue('https://cdn.discord.com/test.png'),
}));

describe('accessibility.ts', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = {
      DISCORD_PUBLIC_KEY: 'test-key',
      DISCORD_TOKEN: 'test-token',
      DISCORD_APPLICATION_ID: 'test-app-id',
      PRESET_API_URL: 'https://test-api.example.com',
      INTERNAL_WEBHOOK_SECRET: 'test-secret',
      KV: {} as KVNamespace,
    };

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    vi.clearAllMocks();
  });

  it('should handle basic accessibility command', async () => {
    const interaction: DiscordInteraction = {
      type: 2,
      data: {
        name: 'accessibility',
        options: [
          {
            name: 'contrast',
            type: 1,
            options: [
              { name: 'foreground', value: '#000000' },
              { name: 'background', value: '#FFFFFF' },
            ],
          },
        ],
      },
      user: { id: 'user-123' },
      id: 'int-1',
      application_id: 'app-1',
      token: 'token-1',
    };

    const response = await handleAccessibilityCommand(interaction, mockEnv, mockCtx);
    expect(response.status).toBe(200);
    const data = await response.json();
    // Type 4 is CHANNEL_MESSAGE_WITH_SOURCE (immediate error response)
    expect(data.type).toBe(4);
    expect(data.data.flags).toBe(64); // Ephemeral
  });
});
