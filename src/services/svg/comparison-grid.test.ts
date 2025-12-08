/**
 * Tests for Comparison Grid SVG Generator
 */
import { describe, it, expect } from 'vitest';
import { generateComparisonGrid, type ComparisonGridOptions } from './comparison-grid.js';
import type { Dye } from 'xivdyetools-core';

describe('svg/comparison-grid.ts', () => {
    const mockDye1: Dye = {
        id: 1,
        itemID: 5729,
        name: 'Dalamud Red',
        hex: '#AA1111',
        rgb: { r: 170, g: 17, b: 17 },
        hsv: { h: 0, s: 90, v: 67 },
        category: 'Red',
    };

    const mockDye2: Dye = {
        id: 2,
        itemID: 5730,
        name: 'Jet Black',
        hex: '#0A0A0A',
        rgb: { r: 10, g: 10, b: 10 },
        hsv: { h: 0, s: 0, v: 4 },
        category: 'Black',
    };

    const mockDye3: Dye = {
        id: 3,
        itemID: 5731,
        name: 'Snow White',
        hex: '#FFFFFF',
        rgb: { r: 255, g: 255, b: 255 },
        hsv: { h: 0, s: 0, v: 100 },
        category: 'White',
    };

    const mockDye4: Dye = {
        id: 4,
        itemID: 5732,
        name: 'Metallic Gold',
        hex: '#FFD700',
        rgb: { r: 255, g: 215, b: 0 },
        hsv: { h: 51, s: 100, v: 100 },
        category: 'Yellow',
    };

    describe('generateComparisonGrid', () => {
        it('should generate valid SVG document', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
            expect(svg).toContain('</svg>');
        });

        it('should show error message for less than 2 dyes', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1] });

            expect(svg).toContain('at least 2 dyes');
        });

        it('should include title', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('Dye Comparison');
        });

        it('should include all dye names', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2, mockDye3] });

            expect(svg).toContain('Dalamud Red');
            expect(svg).toContain('Jet Black');
            expect(svg).toContain('Snow White');
        });

        it('should include all dye hex codes', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('#AA1111');
            expect(svg).toContain('#0A0A0A');
        });

        it('should include dye categories', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('Red');
            expect(svg).toContain('Black');
        });

        it('should include RGB values', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('RGB(');
        });

        it('should include HSV values when showHsv is true (default)', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2], showHsv: true });

            expect(svg).toContain('HSV(');
        });

        it('should hide HSV values when showHsv is false', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2], showHsv: false });

            expect(svg).not.toContain('HSV(');
        });

        it('should include color analysis section', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('Color Analysis');
        });

        it('should include most similar and most different comparisons', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2, mockDye3] });

            expect(svg).toContain('Most Similar');
            expect(svg).toContain('Most Different');
        });

        it('should include distance values', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('Distance:');
        });

        it('should include contrast ratio', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            expect(svg).toContain('Contrast:');
            expect(svg).toContain(':1');
        });

        it('should use custom width', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2], width: 1000 });

            expect(svg).toContain('width="1000"');
        });

        it('should handle 4 dyes', () => {
            const svg = generateComparisonGrid({
                dyes: [mockDye1, mockDye2, mockDye3, mockDye4],
            });

            expect(svg).toContain('Dalamud Red');
            expect(svg).toContain('Jet Black');
            expect(svg).toContain('Snow White');
            expect(svg).toContain('Metallic Gold');
        });

        it('should include color swatches', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2] });

            // Color swatches include fill attributes with the dye colors
            expect(svg).toContain('fill="#AA1111"');
            expect(svg).toContain('fill="#0A0A0A"');
        });

        it('should include index numbers', () => {
            const svg = generateComparisonGrid({ dyes: [mockDye1, mockDye2, mockDye3] });

            // Index circles with numbers
            expect(svg).toContain('>1<');
            expect(svg).toContain('>2<');
            expect(svg).toContain('>3<');
        });
    });
});
