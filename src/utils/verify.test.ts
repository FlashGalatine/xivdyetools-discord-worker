/**
 * Tests for Discord request verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    verifyDiscordRequest,
    unauthorizedResponse,
    badRequestResponse,
    timingSafeEqual,
} from './verify.js';

// Mock the discord-interactions verifyKey function
vi.mock('discord-interactions', () => ({
    verifyKey: vi.fn(),
}));

import { verifyKey } from 'discord-interactions';

const mockVerifyKey = vi.mocked(verifyKey);

describe('verify.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('verifyDiscordRequest', () => {
        const mockPublicKey = 'mock-public-key';

        it('should return invalid when X-Signature-Ed25519 header is missing', async () => {
            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Timestamp': '12345',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.body).toBe('');
            expect(result.error).toBe('Missing signature headers');
        });

        it('should return invalid when X-Signature-Timestamp header is missing', async () => {
            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'mock-signature',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.body).toBe('');
            expect(result.error).toBe('Missing signature headers');
        });

        it('should return invalid when both signature headers are missing', async () => {
            const request = new Request('https://example.com', {
                method: 'POST',
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Missing signature headers');
        });

        it('should return valid when signature verification passes', async () => {
            mockVerifyKey.mockResolvedValue(true);

            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'valid-signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: '{"type": 1}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(true);
            expect(result.body).toBe('{"type": 1}');
            expect(result.error).toBeUndefined();
            expect(mockVerifyKey).toHaveBeenCalledWith(
                '{"type": 1}',
                'valid-signature',
                '12345',
                mockPublicKey
            );
        });

        it('should return invalid when signature verification fails', async () => {
            mockVerifyKey.mockResolvedValue(false);

            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'invalid-signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.body).toBe('{}');
            expect(result.error).toBe('Invalid signature');
        });

        it('should return invalid when verifyKey throws an Error', async () => {
            mockVerifyKey.mockRejectedValue(new Error('Crypto error'));

            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.body).toBe('{}');
            expect(result.error).toBe('Crypto error');
        });

        it('should return generic error when verifyKey throws non-Error', async () => {
            mockVerifyKey.mockRejectedValue('Unknown error');

            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Verification failed');
        });

        it('should reject request body that is too large via Content-Length header', async () => {
            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'Content-Length': '200000', // >100KB
                    'X-Signature-Ed25519': 'signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: '{}',
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Request body too large');
        });

        it('should reject request body that is too large via actual body size', async () => {
            // Create a body that's >100KB
            const largeBody = 'a'.repeat(100001);
            
            const request = new Request('https://example.com', {
                method: 'POST',
                headers: {
                    'X-Signature-Ed25519': 'signature',
                    'X-Signature-Timestamp': '12345',
                },
                body: largeBody,
            });

            const result = await verifyDiscordRequest(request, mockPublicKey);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Request body too large');
        });
    });

    describe('unauthorizedResponse', () => {
        it('should return a 401 response with default message', async () => {
            const response = unauthorizedResponse();

            expect(response.status).toBe(401);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const body = (await response.json()) as InteractionResponseBody;
            expect(body).toEqual({ error: 'Invalid request signature' });
        });

        it('should return a 401 response with custom message', async () => {
            const response = unauthorizedResponse('Custom error message');

            expect(response.status).toBe(401);

            const body = (await response.json()) as InteractionResponseBody;
            expect(body).toEqual({ error: 'Custom error message' });
        });
    });

    describe('badRequestResponse', () => {
        it('should return a 400 response with the provided message', async () => {
            const response = badRequestResponse('Invalid input');

            expect(response.status).toBe(400);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const body = (await response.json()) as InteractionResponseBody;
            expect(body).toEqual({ error: 'Invalid input' });
        });
    });

    describe('timingSafeEqual', () => {
        it('should return true for identical strings', async () => {
            const result = await timingSafeEqual('test-secret', 'test-secret');
            expect(result).toBe(true);
        });

        it('should return false for different strings', async () => {
            const result = await timingSafeEqual('test-secret', 'wrong-secret');
            expect(result).toBe(false);
        });

        it('should return false for strings with different lengths', async () => {
            const result = await timingSafeEqual('short', 'much-longer-string');
            expect(result).toBe(false);
        });

        it('should return true for empty strings', async () => {
            const result = await timingSafeEqual('', '');
            expect(result).toBe(true);
        });

        it('should return false for empty vs non-empty', async () => {
            const result1 = await timingSafeEqual('', 'something');
            const result2 = await timingSafeEqual('something', '');
            expect(result1).toBe(false);
            expect(result2).toBe(false);
        });

        it('should handle unicode strings', async () => {
            const result1 = await timingSafeEqual('こんにちは', 'こんにちは');
            const result2 = await timingSafeEqual('こんにちは', 'さようなら');
            expect(result1).toBe(true);
            expect(result2).toBe(false);
        });

        it('should detect single character differences', async () => {
            const result = await timingSafeEqual('secret-key-123', 'secret-key-124');
            expect(result).toBe(false);
        });

        it('should handle very long identical strings', async () => {
            const longString = 'a'.repeat(10000);
            const result = await timingSafeEqual(longString, longString);
            expect(result).toBe(true);
        });

        it('should use fallback when crypto.subtle.timingSafeEqual throws', async () => {
            // Mock crypto.subtle.timingSafeEqual to throw
            const originalTimingSafeEqual = crypto.subtle.timingSafeEqual;
            (crypto.subtle as unknown as { timingSafeEqual: undefined }).timingSafeEqual = undefined;

            const result1 = await timingSafeEqual('test', 'test');
            const result2 = await timingSafeEqual('test', 'diff');

            // Restore
            (crypto.subtle as unknown as { timingSafeEqual: typeof originalTimingSafeEqual }).timingSafeEqual = originalTimingSafeEqual;

            expect(result1).toBe(true);
            expect(result2).toBe(false);
        });

        it('should return false when padded content matches but original lengths differ', async () => {
            // 'abc' will be padded to match length of 'abc\x00\x00'
            // After padding both have [97, 98, 99, 0, 0] but original lengths differ
            const result = await timingSafeEqual('abc', 'abc\x00\x00');
            expect(result).toBe(false);
        });
    });
});
