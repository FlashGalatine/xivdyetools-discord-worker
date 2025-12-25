/**
 * Budget Comparison SVG Generator
 *
 * Generates a visual comparison of target dye vs budget alternatives.
 * Used by the /budget command to display results.
 *
 * Layout:
 * +----------------------------------------------------------+
 * |  BUDGET ALTERNATIVES FOR                                  |
 * |  [Target Swatch] Pure White    Target Price: 85,000 Gil   |
 * +----------------------------------------------------------+
 * |  [Alt Swatch] Snow White       Price: 5,000    Save: 94%  |
 * |               #E4DFD0          Distance: 12 (Excellent)   |
 * +----------------------------------------------------------+
 * |  [Alt Swatch] Ash Grey         Price: 2,500    Save: 97%  |
 * |               #8B8B8B          Distance: 28 (Good)        |
 * +----------------------------------------------------------+
 *
 * @module services/svg/budget-comparison
 */

import type { Dye } from '@xivdyetools/types';
import {
  createSvgDocument,
  rect,
  text,
  line,
  THEME,
  FONTS,
  escapeXml,
  getContrastTextColor,
} from './base.js';
import type { BudgetSuggestion, DyePriceData, BudgetSortOption } from '../../types/budget.js';
import { getDistanceQuality, formatGil, SORT_DISPLAY } from '../../types/budget.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for generating the budget comparison SVG
 */
export interface BudgetComparisonOptions {
  /** The target dye (expensive one) */
  targetDye: Dye;
  /** Target dye's price (null if no listings) */
  targetPrice: DyePriceData | null;
  /** Alternative dye suggestions */
  alternatives: BudgetSuggestion[];
  /** World/datacenter used for prices */
  world: string;
  /** How results are sorted */
  sortBy: BudgetSortOption;
  /** Canvas width in pixels (default: 800) */
  width?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WIDTH = 800;
const PADDING = 24;
const HEADER_HEIGHT = 120;
const ROW_HEIGHT = 90;
const SWATCH_SIZE = 56;
const TARGET_SWATCH_SIZE = 72;

// ============================================================================
// SVG Generation
// ============================================================================

/**
 * Generate a budget comparison SVG showing target vs alternatives
 */
export function generateBudgetComparison(options: BudgetComparisonOptions): string {
  const {
    targetDye,
    targetPrice,
    alternatives,
    world,
    sortBy,
    width = DEFAULT_WIDTH,
  } = options;

  // Calculate dimensions
  const hasAlternatives = alternatives.length > 0;
  const contentHeight = hasAlternatives ? alternatives.length * ROW_HEIGHT : 60;
  const height = PADDING * 2 + HEADER_HEIGHT + contentHeight;

  const elements: string[] = [];

  // Background
  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12, ry: 12 }));

  // Header section
  elements.push(generateHeader(targetDye, targetPrice, world, sortBy, width));

  // Separator after header
  elements.push(
    line(PADDING, HEADER_HEIGHT, width - PADDING, HEADER_HEIGHT, THEME.border, 2)
  );

  // Alternatives section
  if (hasAlternatives) {
    alternatives.forEach((alt, index) => {
      const rowY = HEADER_HEIGHT + index * ROW_HEIGHT;
      elements.push(generateAlternativeRow(alt, PADDING, rowY, width - PADDING * 2, targetPrice));

      // Separator line (except after last row)
      if (index < alternatives.length - 1) {
        elements.push(
          line(
            PADDING + 20,
            rowY + ROW_HEIGHT,
            width - PADDING - 20,
            rowY + ROW_HEIGHT,
            THEME.border,
            1
          )
        );
      }
    });
  } else {
    // No alternatives found message
    elements.push(
      text(width / 2, HEADER_HEIGHT + 30, 'No cheaper alternatives found', {
        fill: THEME.textMuted,
        fontSize: 16,
        fontFamily: FONTS.primary,
        textAnchor: 'middle',
      })
    );
  }

  return createSvgDocument(width, height, elements.join('\n'));
}

/**
 * Generate the header section with target dye info
 */
function generateHeader(
  targetDye: Dye,
  targetPrice: DyePriceData | null,
  world: string,
  sortBy: BudgetSortOption,
  width: number
): string {
  const elements: string[] = [];

  // Title
  elements.push(
    text(PADDING, 35, 'BUDGET ALTERNATIVES FOR', {
      fill: THEME.textMuted,
      fontSize: 12,
      fontFamily: FONTS.primary,
      fontWeight: 500,
    })
  );

  // Target dye swatch
  const swatchY = 50;
  elements.push(
    rect(PADDING, swatchY, TARGET_SWATCH_SIZE, TARGET_SWATCH_SIZE, targetDye.hex, {
      rx: 8,
      ry: 8,
      stroke: THEME.accent,
      strokeWidth: 3,
    })
  );

  // Hex value on swatch
  const swatchTextColor = getContrastTextColor(targetDye.hex);
  elements.push(
    text(PADDING + TARGET_SWATCH_SIZE / 2, swatchY + TARGET_SWATCH_SIZE - 8, targetDye.hex.toUpperCase(), {
      fill: swatchTextColor,
      fontSize: 10,
      fontFamily: FONTS.mono,
      textAnchor: 'middle',
    })
  );

  // Target dye name
  const infoX = PADDING + TARGET_SWATCH_SIZE + 16;
  elements.push(
    text(infoX, 70, escapeXml(targetDye.name), {
      fill: THEME.text,
      fontSize: 24,
      fontFamily: FONTS.header,
      fontWeight: 600,
    })
  );

  // Category
  elements.push(
    text(infoX, 92, escapeXml(targetDye.category), {
      fill: THEME.textMuted,
      fontSize: 14,
      fontFamily: FONTS.primary,
    })
  );

  // Price section (right side)
  const priceX = width - PADDING;

  if (targetPrice) {
    elements.push(
      text(priceX, 55, 'TARGET PRICE', {
        fill: THEME.textMuted,
        fontSize: 10,
        fontFamily: FONTS.primary,
        fontWeight: 500,
        textAnchor: 'end',
      })
    );
    elements.push(
      text(priceX, 80, `${formatGil(targetPrice.currentMinPrice)} Gil`, {
        fill: THEME.warning,
        fontSize: 22,
        fontFamily: FONTS.header,
        fontWeight: 600,
        textAnchor: 'end',
      })
    );
    elements.push(
      text(priceX, 100, `on ${world}`, {
        fill: THEME.textDim,
        fontSize: 12,
        fontFamily: FONTS.primary,
        textAnchor: 'end',
      })
    );
  } else {
    elements.push(
      text(priceX, 70, 'No listings', {
        fill: THEME.textMuted,
        fontSize: 16,
        fontFamily: FONTS.primary,
        textAnchor: 'end',
      })
    );
    elements.push(
      text(priceX, 92, `on ${world}`, {
        fill: THEME.textDim,
        fontSize: 12,
        fontFamily: FONTS.primary,
        textAnchor: 'end',
      })
    );
  }

  // Sort indicator
  const sortLabel = SORT_DISPLAY[sortBy].label;
  elements.push(
    text(width / 2, HEADER_HEIGHT - 8, `Sorted by: ${sortLabel}`, {
      fill: THEME.textDim,
      fontSize: 11,
      fontFamily: FONTS.primary,
      textAnchor: 'middle',
    })
  );

  return elements.join('\n');
}

/**
 * Generate a row for an alternative dye
 */
function generateAlternativeRow(
  alt: BudgetSuggestion,
  x: number,
  y: number,
  width: number,
  targetPrice: DyePriceData | null
): string {
  const elements: string[] = [];
  const rowPadding = 12;

  // Row background
  elements.push(
    rect(x, y + 6, width, ROW_HEIGHT - 12, THEME.backgroundLight, {
      rx: 8,
      ry: 8,
      opacity: 0.5,
    })
  );

  // Dye swatch
  const swatchX = x + rowPadding;
  const swatchY = y + (ROW_HEIGHT - SWATCH_SIZE) / 2;
  elements.push(
    rect(swatchX, swatchY, SWATCH_SIZE, SWATCH_SIZE, alt.dye.hex, {
      rx: 6,
      ry: 6,
      stroke: THEME.border,
      strokeWidth: 2,
    })
  );

  // Dye name and hex
  const infoX = swatchX + SWATCH_SIZE + 14;
  elements.push(
    text(infoX, y + 35, escapeXml(alt.dye.name), {
      fill: THEME.text,
      fontSize: 16,
      fontFamily: FONTS.primary,
      fontWeight: 600,
    })
  );
  elements.push(
    text(infoX, y + 55, alt.dye.hex.toUpperCase(), {
      fill: THEME.textDim,
      fontSize: 12,
      fontFamily: FONTS.mono,
    })
  );

  // Color distance badge
  const quality = getDistanceQuality(alt.colorDistance);
  const distanceText = `${quality.emoji} ${quality.label} (Δ${alt.colorDistance.toFixed(1)})`;
  elements.push(
    text(infoX, y + 75, distanceText, {
      fill: THEME.textMuted,
      fontSize: 11,
      fontFamily: FONTS.primary,
    })
  );

  // Price section (right side)
  const priceX = x + width - rowPadding;

  if (alt.price) {
    // Price
    elements.push(
      text(priceX, y + 35, `${formatGil(alt.price.currentMinPrice)} Gil`, {
        fill: THEME.success,
        fontSize: 18,
        fontFamily: FONTS.header,
        fontWeight: 600,
        textAnchor: 'end',
      })
    );

    // Savings
    if (targetPrice && alt.savings > 0) {
      const savingsText = `Save ${formatGil(alt.savings)} (${alt.savingsPercent.toFixed(0)}%)`;
      elements.push(
        text(priceX, y + 55, savingsText, {
          fill: THEME.accent,
          fontSize: 13,
          fontFamily: FONTS.primary,
          fontWeight: 500,
          textAnchor: 'end',
        })
      );
    }

    // Listings count
    elements.push(
      text(priceX, y + 75, `${alt.price.listingCount} listings`, {
        fill: THEME.textDim,
        fontSize: 11,
        fontFamily: FONTS.primary,
        textAnchor: 'end',
      })
    );
  } else {
    elements.push(
      text(priceX, y + 50, 'No listings', {
        fill: THEME.textMuted,
        fontSize: 14,
        fontFamily: FONTS.primary,
        textAnchor: 'end',
      })
    );
  }

  return elements.join('\n');
}

/**
 * Generate an empty state SVG when no world is set
 */
export function generateNoWorldSetSvg(width: number = DEFAULT_WIDTH): string {
  const height = 160;
  const elements: string[] = [];

  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12, ry: 12 }));

  elements.push(
    text(width / 2, 60, '⚠️ No World Set', {
      fill: THEME.warning,
      fontSize: 24,
      fontFamily: FONTS.header,
      fontWeight: 600,
      textAnchor: 'middle',
    })
  );

  elements.push(
    text(width / 2, 95, 'Use /budget set_world to set your preferred', {
      fill: THEME.textMuted,
      fontSize: 14,
      fontFamily: FONTS.primary,
      textAnchor: 'middle',
    })
  );

  elements.push(
    text(width / 2, 115, 'world or datacenter for price lookups.', {
      fill: THEME.textMuted,
      fontSize: 14,
      fontFamily: FONTS.primary,
      textAnchor: 'middle',
    })
  );

  return createSvgDocument(width, height, elements.join('\n'));
}

/**
 * Generate an error state SVG
 */
export function generateErrorSvg(message: string, width: number = DEFAULT_WIDTH): string {
  const height = 120;
  const elements: string[] = [];

  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12, ry: 12 }));

  elements.push(
    text(width / 2, 50, '❌ Error', {
      fill: THEME.error,
      fontSize: 20,
      fontFamily: FONTS.header,
      fontWeight: 600,
      textAnchor: 'middle',
    })
  );

  elements.push(
    text(width / 2, 80, escapeXml(message), {
      fill: THEME.textMuted,
      fontSize: 14,
      fontFamily: FONTS.primary,
      textAnchor: 'middle',
    })
  );

  return createSvgDocument(width, height, elements.join('\n'));
}
