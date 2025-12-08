/**
 * Tests for Palette Grid SVG Generator
 */
import { describe, it, expect, vi } from 'vitest';
import { generatePaletteGrid, type PaletteEntry } from './palette-grid.js';

// Mock the image types
vi.mock('../../types/image.js', () => ({
    getMatchQuality: vi.fn((distance: number) => {
        if (distance === 0) return { shortLabel: 'EXACT', label: 'Exact Match' };
        if (distance < 10) return { shortLabel: 'EXCELLENT', label: 'Excellent' };
        if (distance < 25) return { shortLabel: 'GOOD', label: 'Good' };
        if (distance < 50) return { shortLabel: 'FAIR', label: 'Fair' };
        return { shortLabel: 'POOR', label: 'Poor' };
    }),
}));

describe('svg/palette-grid.ts', () => {
    const mockDye = {
        id: 1,
        itemID: 5729,
        name: 'Dalamud Red',
        hex: '#AA1111',
        rgb: { r: 170, g: 17, b: 17 },
        hsv: { h: 0, s: 90, v: 67 },
        category: 'Red',
    };

    describe('generatePaletteGrid', () => {
        it('should generate valid SVG document', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 176, g: 21, b: 21 },
                    matchedDye: mockDye,
                    distance: 8.5,
                    dominance: 42,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
            expect(svg).toContain('</svg>');
        });

        it('should generate empty palette message when no entries', () => {
            const svg = generatePaletteGrid({ entries: [] });

            expect(svg).toContain('No colors extracted from image');
        });

        it('should include extracted hex color', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 255, g: 0, b: 0 },
                    matchedDye: mockDye,
                    distance: 10,
                    dominance: 50,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            expect(svg).toContain('#ff0000');
        });

        it('should include matched dye information', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            expect(svg).toContain('Dalamud Red');
            expect(svg).toContain('#AA1111');
        });

        it('should include dominance percentage', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 42,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            expect(svg).toContain('42%');
        });

        it('should use custom width', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries, width: 1000 });

            expect(svg).toContain('width="1000"');
        });

        it('should include title when provided', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries, title: 'Color Analysis' });

            expect(svg).toContain('Color Analysis');
        });

        it('should handle multiple entries', () => {
            const secondDye = { ...mockDye, id: 2, name: 'Jet Black', hex: '#000000' };
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
                {
                    extracted: { r: 10, g: 10, b: 10 },
                    matchedDye: secondDye,
                    distance: 2,
                    dominance: 25,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            expect(svg).toContain('Dalamud Red');
            expect(svg).toContain('Jet Black');
        });

        it('should show distance when showDistance is true (default)', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 8.5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries, showDistance: true });

            expect(svg).toContain('Δ8.5');
        });

        it('should hide distance when showDistance is false', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 8.5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries, showDistance: false });

            expect(svg).not.toContain('Δ8.5');
        });

        it('should include quality badge', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            // Should include the quality badge label
            expect(svg).toContain('EXCELLENT');
        });

        it('should include separator lines between rows', () => {
            const secondDye = { ...mockDye, id: 2, name: 'Jet Black', hex: '#000000' };
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
                {
                    extracted: { r: 10, g: 10, b: 10 },
                    matchedDye: secondDye,
                    distance: 2,
                    dominance: 25,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            // Should have at least one line element (separator)
            expect(svg).toContain('<line');
        });

        it('should include arrow between extracted and matched', () => {
            const entries: PaletteEntry[] = [
                {
                    extracted: { r: 180, g: 20, b: 20 },
                    matchedDye: mockDye,
                    distance: 5,
                    dominance: 30,
                },
            ];

            const svg = generatePaletteGrid({ entries });

            // Arrow includes a polygon for the arrowhead
            expect(svg).toContain('<polygon');
        });
    });
});
