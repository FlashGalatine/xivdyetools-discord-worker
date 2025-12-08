/**
 * Tests for modal handlers index exports
 */
import { describe, it, expect } from 'vitest';

describe('modals/index exports', () => {
    it('exports all modal handlers', async () => {
        const modals = await import('./index.js');

        expect(modals.handlePresetRejectionModal).toBeDefined();
        expect(typeof modals.handlePresetRejectionModal).toBe('function');

        expect(modals.isPresetRejectionModal).toBeDefined();
        expect(typeof modals.isPresetRejectionModal).toBe('function');

        expect(modals.handlePresetRevertModal).toBeDefined();
        expect(typeof modals.handlePresetRevertModal).toBe('function');

        expect(modals.isPresetRevertModal).toBeDefined();
        expect(typeof modals.isPresetRevertModal).toBe('function');
    });
});
