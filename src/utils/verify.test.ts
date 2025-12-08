/**
 * Tests for Discord request verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    verifyDiscordRequest,
    unauthorizedResponse,
    badRequestResponse,
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
    });

    describe('unauthorizedResponse', () => {
        it('should return a 401 response with default message', async () => {
            const response = unauthorizedResponse();

            expect(response.status).toBe(401);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const body = await response.json();
            expect(body).toEqual({ error: 'Invalid request signature' });
        });

        it('should return a 401 response with custom message', async () => {
            const response = unauthorizedResponse('Custom error message');

            expect(response.status).toBe(401);

            const body = await response.json();
            expect(body).toEqual({ error: 'Custom error message' });
        });
    });

    describe('badRequestResponse', () => {
        it('should return a 400 response with the provided message', async () => {
            const response = badRequestResponse('Invalid input');

            expect(response.status).toBe(400);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const body = await response.json();
            expect(body).toEqual({ error: 'Invalid input' });
        });
    });
});
