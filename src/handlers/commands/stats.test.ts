/**
 * Tests for /stats command handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleStatsCommand } from './stats.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

// Mock dependencies
vi.mock('../../services/analytics.js', () => ({
  getStats: vi.fn(),
}));

vi.mock('../../services/bot-i18n.js', () => ({
  createUserTranslator: vi.fn().mockResolvedValue({
    t: (key: string) => key,
    getLocale: () => 'en',
  }),
}));

import { getStats } from '../../services/analytics.js';

// Create mock KV namespace
function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

describe('stats.ts', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    mockEnv = {
      DISCORD_PUBLIC_KEY: 'test-key',
      DISCORD_TOKEN: 'test-token',
      DISCORD_APPLICATION_ID: 'test-app-id',
      PRESET_API_URL: 'https://test-api.example.com',
      INTERNAL_WEBHOOK_SECRET: 'test-secret',
      KV: mockKV,
      STATS_AUTHORIZED_USERS: 'admin-123,admin-456',
    };

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    vi.clearAllMocks();

    // Default mock for getStats
    vi.mocked(getStats).mockResolvedValue({
      totalCommands: 1000,
      successCount: 950,
      failureCount: 50,
      successRate: 95,
      commandBreakdown: {
        harmony: 300,
        dye: 250,
        match: 200,
        mixer: 100,
        comparison: 50,
      },
      uniqueUsersToday: 42,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('authorization', () => {
    it('should deny access to unauthorized users', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'random-user-789' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.type).toBe(4);
      expect(data.data.embeds[0].title).toContain('Access Denied');
      expect(data.data.flags).toBe(64); // Ephemeral
    });

    it('should allow access to authorized users', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.type).toBe(4);
      expect(data.data.embeds[0].title).toContain('Bot Statistics');
    });

    it('should allow second authorized user', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-456' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Bot Statistics');
    });

    it('should deny access when STATS_AUTHORIZED_USERS is not configured', async () => {
      const envWithoutAuth = { ...mockEnv, STATS_AUTHORIZED_USERS: undefined };

      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'any-user' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, envWithoutAuth, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Access Denied');
    });

    it('should deny access when no userId is available', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        // No member or user
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Access Denied');
    });

    it('should handle DM interactions with user field', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        user: { id: 'admin-123' }, // DM uses user instead of member.user
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Bot Statistics');
    });

    it('should trim whitespace from authorized user IDs', async () => {
      const envWithSpaces = {
        ...mockEnv,
        STATS_AUTHORIZED_USERS: ' admin-123 , admin-456 ',
      };

      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, envWithSpaces, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Bot Statistics');
    });
  });

  describe('stats display', () => {
    it('should display usage statistics correctly', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      const embed = data.data.embeds[0];
      expect(embed.title).toBe('📊 Bot Statistics');
      expect(embed.fields).toBeDefined();
      expect(embed.fields.length).toBeGreaterThan(0);

      // Find usage field
      const usageField = embed.fields.find((f: { name: string }) => f.name.includes('Usage'));
      expect(usageField).toBeDefined();
      expect(usageField.value).toContain('Total Commands');
      expect(usageField.value).toContain('1,000'); // Formatted number
      expect(usageField.value).toContain('Success Rate');
      expect(usageField.value).toContain('95.0%');
      expect(usageField.value).toContain('Unique Users Today');
      expect(usageField.value).toContain('42');
    });

    it('should display infrastructure information', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      const infraField = data.data.embeds[0].fields.find(
        (f: { name: string }) => f.name.includes('Infrastructure')
      );
      expect(infraField).toBeDefined();
      expect(infraField.value).toContain('Cloudflare Workers');
      expect(infraField.value).toContain('Version');
    });

    it('should display top 5 commands', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      const topField = data.data.embeds[0].fields.find(
        (f: { name: string }) => f.name.includes('Top Commands')
      );
      expect(topField).toBeDefined();
      expect(topField.value).toContain('/harmony');
      expect(topField.value).toContain('/dye');
      expect(topField.value).toContain('300');
      expect(topField.value).toContain('1.'); // Ranking
    });

    it('should show "No commands executed yet" when no commands', async () => {
      vi.mocked(getStats).mockResolvedValue({
        totalCommands: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        commandBreakdown: {},
        uniqueUsersToday: 0,
      });

      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      const topField = data.data.embeds[0].fields.find(
        (f: { name: string }) => f.name.includes('Top Commands')
      );
      expect(topField.value).toBe('No commands executed yet');
    });

    it('should indicate Analytics Engine status when enabled', async () => {
      const envWithAnalytics = {
        ...mockEnv,
        ANALYTICS: {} as AnalyticsEngineDataset,
      };

      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, envWithAnalytics, mockCtx);
      const data = await response.json();

      const infraField = data.data.embeds[0].fields.find(
        (f: { name: string }) => f.name.includes('Infrastructure')
      );
      expect(infraField.value).toContain('Enabled');
    });

    it('should indicate KV Only when Analytics is not enabled', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      const infraField = data.data.embeds[0].fields.find(
        (f: { name: string }) => f.name.includes('Infrastructure')
      );
      expect(infraField.value).toContain('KV Only');
    });

    it('should include footer with retention info', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].footer.text).toContain('30-day retention');
    });

    it('should include timestamp', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].timestamp).toBeDefined();
    });

    it('should be ephemeral', async () => {
      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.flags).toBe(64);
    });
  });

  describe('error handling', () => {
    it('should display error message when getStats fails', async () => {
      vi.mocked(getStats).mockRejectedValue(new Error('KV unavailable'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const interaction: DiscordInteraction = {
        type: 2,
        data: { name: 'stats' },
        member: { user: { id: 'admin-123' } },
        id: 'int-1',
        application_id: 'app-1',
        token: 'token-1',
      };

      const response = await handleStatsCommand(interaction, mockEnv, mockCtx);
      const data = await response.json();

      expect(data.data.embeds[0].title).toContain('Error');
      expect(data.data.embeds[0].description).toContain('Failed to retrieve statistics');
      expect(data.data.flags).toBe(64);

      expect(consoleSpy).toHaveBeenCalledWith('Error in stats command:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
