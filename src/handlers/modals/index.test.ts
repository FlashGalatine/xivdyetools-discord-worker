/**
 * Tests for Modal Handlers Index
 */
import { describe, it, expect } from 'vitest';
import * as modals from './index.js';

describe('handlers/modals/index.ts', () => {
    describe('exports', () => {
        it('should export handlePresetRejectionModal', () => {
            expect(modals.handlePresetRejectionModal).toBeDefined();
            expect(typeof modals.handlePresetRejectionModal).toBe('function');
        });

        it('should export isPresetRejectionModal', () => {
            expect(modals.isPresetRejectionModal).toBeDefined();
            expect(typeof modals.isPresetRejectionModal).toBe('function');
        });

        it('should export handlePresetRevertModal', () => {
            expect(modals.handlePresetRevertModal).toBeDefined();
            expect(typeof modals.handlePresetRevertModal).toBe('function');
        });

        it('should export isPresetRevertModal', () => {
            expect(modals.isPresetRevertModal).toBeDefined();
            expect(typeof modals.isPresetRevertModal).toBe('function');
        });
    });

    describe('isPresetRejectionModal', () => {
        it('should identify preset rejection modals', () => {
            expect(modals.isPresetRejectionModal('preset_reject_modal_abc')).toBe(true);
            expect(modals.isPresetRejectionModal('other_modal')).toBe(false);
        });
    });

    describe('isPresetRevertModal', () => {
        it('should identify preset revert modals', () => {
            expect(modals.isPresetRevertModal('preset_revert_modal_abc')).toBe(true);
            expect(modals.isPresetRevertModal('other_modal')).toBe(false);
        });
    });
});
