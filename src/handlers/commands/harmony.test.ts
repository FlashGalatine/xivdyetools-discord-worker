import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHarmonyCommand } from './harmony.js';
import type { Env, DiscordInteraction } from '../../types/env.js';

const resolveUserLocaleMock = vi.hoisted(() => vi.fn());
const initializeLocaleMock = vi.hoisted(() => vi.fn());
const getLocalizedDyeNameMock = vi.hoisted(() => vi.fn((itemID?: number, name?: string) => name ?? `dye-${itemID ?? 'unknown'}`));
const createUserTranslatorMock = vi.hoisted(() => vi.fn());
const createTranslatorMock = vi.hoisted(() => vi.fn());
const renderSvgToPngMock = vi.hoisted(() => vi.fn());
const editOriginalResponseMock = vi.hoisted(() => vi.fn());

const translatorStub = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  getLocale: vi.fn(() => 'en'),
}));

vi.mock('../../services/i18n.js', () => ({
  resolveUserLocale: resolveUserLocaleMock,
  initializeLocale: initializeLocaleMock,
  getLocalizedDyeName: getLocalizedDyeNameMock,
  discordLocaleToLocaleCode: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../services/bot-i18n.js', () => ({
  createUserTranslator: createUserTranslatorMock.mockImplementation(async (kv, userId: string, discordLocale?: string) => {
    await resolveUserLocaleMock(kv, userId, discordLocale);
    return translatorStub;
  }),
  createTranslator: createTranslatorMock.mockReturnValue(translatorStub),
}));

vi.mock('../../services/svg/harmony-wheel.js', () => ({
  generateHarmonyWheel: vi.fn(() => '<svg />'),
}));

vi.mock('../../services/svg/renderer.js', () => ({
  renderSvgToPng: renderSvgToPngMock,
}));

vi.mock('../../utils/discord-api.js', () => ({
  editOriginalResponse: editOriginalResponseMock,
}));

vi.mock('../../utils/response.js', () => ({
  deferredResponse: () => new Response('{}'),
  errorEmbed: (title: string, description: string) => ({ title, description }),
}));

vi.mock('xivdyetools-core', () => {
  class MockDyeService {
    searchByName() {
      return [];
    }
    findTriadicDyes() {
      return [];
    }
    findComplementaryPair() {
      return null;
    }
    findAnalogousDyes() {
      return [];
    }
    findSplitComplementaryDyes() {
      return [];
    }
    findTetradicDyes() {
      return [];
    }
    findSquareDyes() {
      return [];
    }
    findMonochromaticDyes() {
      return [];
    }
  }

  const dyeDatabase = {} as const;
  return { DyeService: MockDyeService, dyeDatabase };
});

describe('handleHarmonyCommand locale resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserLocaleMock.mockResolvedValue('en');
    initializeLocaleMock.mockResolvedValue(undefined);
    renderSvgToPngMock.mockResolvedValue(new Uint8Array([1]));
  });

  it('resolves locale once per request', async () => {
    const waitUntilCalls: Array<Promise<unknown>> = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        waitUntilCalls.push(promise);
      },
    } as any;

    const interaction = {
      member: { user: { id: 'user-123' } },
      data: { options: [{ name: 'color', value: '#ffffff' }] },
      locale: 'en-US',
      token: 'token-abc',
    } as unknown as DiscordInteraction;

    const env = { KV: {} as KVNamespace, DISCORD_CLIENT_ID: 'client-123' } as Env;

    const response = await handleHarmonyCommand(interaction, env, ctx);
    await Promise.all(waitUntilCalls);

    expect(response.status).toBe(200);
    expect(createUserTranslatorMock).toHaveBeenCalledTimes(1);
    expect(resolveUserLocaleMock).toHaveBeenCalledTimes(1);
    expect(createTranslatorMock).toHaveBeenCalledTimes(1);
  });
});
