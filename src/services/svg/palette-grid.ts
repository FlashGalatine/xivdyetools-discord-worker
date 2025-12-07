/**
 * Palette Grid SVG Generator
 *
 * Generates a visual comparison of extracted colors to matched FFXIV dyes.
 * Used by the /match_image command to display color extraction results.
 *
 * Layout:
 * +----------------------------------------------------------+
 * | [Extracted Color] 42%  -->  [Matched Dye] Dalamud Red    |
 * | #B01515                     #AA1111  [EXCELLENT]         |
 * +----------------------------------------------------------+
 *
 * @module services/svg/palette-grid
 */

import type { RGB, Dye } from 'xivdyetools-core';
import {
  createSvgDocument,
  rect,
  text,
  line,
  THEME,
  FONTS,
  escapeXml,
  getContrastTextColor,
  rgbToHex,
} from './base.js';
import { getMatchQuality } from '../../types/image.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single palette entry with extracted and matched colors
 */
export interface PaletteEntry {
  /** The extracted RGB color from the image */
  extracted: RGB;
  /** The closest matching FFXIV dye */
  matchedDye: Dye;
  /** Color distance (Euclidean in RGB space) */
  distance: number;
  /** Percentage of pixels with this color (0-100) */
  dominance: number;
}

/**
 * Options for generating the palette grid
 */
export interface PaletteGridOptions {
  /** Array of palette entries to display */
  entries: PaletteEntry[];
  /** Canvas width in pixels (default: 800) */
  width?: number;
  /** Show color distance values (default: true) */
  showDistance?: boolean;
  /** Title text (optional) */
  title?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WIDTH = 800;
const PADDING = 24;
const ROW_HEIGHT = 100;
const SWATCH_SIZE = 60;
const SWATCH_GAP = 32;
const ARROW_WIDTH = 40;
const TITLE_HEIGHT = 50;
const QUALITY_BADGE_WIDTH = 100;

// ============================================================================
// SVG Generation
// ============================================================================

/**
 * Generate a palette grid SVG showing extracted colors matched to dyes
 *
 * @param options - Palette grid configuration
 * @returns SVG string
 *
 * @example
 * ```typescript
 * const svg = generatePaletteGrid({
 *   entries: [
 *     {
 *       extracted: { r: 176, g: 21, b: 21 },
 *       matchedDye: { name: 'Dalamud Red', hex: '#AA1111', ... },
 *       distance: 8.5,
 *       dominance: 42,
 *     },
 *   ],
 * });
 * const png = await renderSvgToPng(svg);
 * ```
 */
export function generatePaletteGrid(options: PaletteGridOptions): string {
  const {
    entries,
    width = DEFAULT_WIDTH,
    showDistance = true,
    title,
  } = options;

  if (entries.length === 0) {
    return generateEmptyPalette(width);
  }

  // Calculate dimensions
  const hasTitle = Boolean(title);
  const titleSpace = hasTitle ? TITLE_HEIGHT : 0;
  const contentHeight = entries.length * ROW_HEIGHT;
  const height = PADDING * 2 + titleSpace + contentHeight;

  const elements: string[] = [];

  // Background
  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12, ry: 12 }));

  // Title
  if (title) {
    elements.push(
      text(width / 2, PADDING + 20, title, {
        fill: THEME.text,
        fontSize: 20,
        fontFamily: FONTS.primary,
        fontWeight: 600,
        textAnchor: 'middle',
      })
    );
  }

  // Render each row
  const startY = PADDING + titleSpace;
  entries.forEach((entry, index) => {
    const rowY = startY + index * ROW_HEIGHT;
    elements.push(generatePaletteRow(entry, PADDING, rowY, width - PADDING * 2, showDistance));

    // Separator line (except after last row)
    if (index < entries.length - 1) {
      elements.push(
        line(
          PADDING,
          rowY + ROW_HEIGHT,
          width - PADDING,
          rowY + ROW_HEIGHT,
          THEME.border,
          1
        )
      );
    }
  });

  return createSvgDocument(width, height, elements.join('\n'));
}

/**
 * Generate a single palette row
 */
function generatePaletteRow(
  entry: PaletteEntry,
  x: number,
  y: number,
  width: number,
  showDistance: boolean
): string {
  const elements: string[] = [];

  const extractedHex = rgbToHex(entry.extracted.r, entry.extracted.g, entry.extracted.b);
  const matchedHex = entry.matchedDye.hex;
  const quality = getMatchQuality(entry.distance);

  // Row background (subtle highlight)
  elements.push(
    rect(x, y + 4, width, ROW_HEIGHT - 8, THEME.backgroundLight, {
      rx: 8,
      ry: 8,
      opacity: 0.5,
    })
  );

  // Left side: Extracted color
  const extractedX = x + 16;
  const swatchY = y + (ROW_HEIGHT - SWATCH_SIZE) / 2;

  // Extracted color swatch
  elements.push(
    rect(extractedX, swatchY, SWATCH_SIZE, SWATCH_SIZE, extractedHex, {
      rx: 6,
      ry: 6,
      stroke: THEME.border,
      strokeWidth: 2,
    })
  );

  // Extracted info (right of swatch)
  const extractedInfoX = extractedX + SWATCH_SIZE + 12;
  elements.push(
    text(extractedInfoX, y + 36, 'EXTRACTED', {
      fill: THEME.textMuted,
      fontSize: 10,
      fontFamily: FONTS.primary,
      fontWeight: 500,
    })
  );
  elements.push(
    text(extractedInfoX, y + 55, extractedHex.toUpperCase(), {
      fill: THEME.text,
      fontSize: 14,
      fontFamily: FONTS.mono,
      fontWeight: 600,
    })
  );
  elements.push(
    text(extractedInfoX, y + 75, `${entry.dominance}% of image`, {
      fill: THEME.textDim,
      fontSize: 11,
      fontFamily: FONTS.primary,
    })
  );

  // Arrow in the middle
  const arrowX = x + width / 2 - ARROW_WIDTH / 2;
  const arrowY = y + ROW_HEIGHT / 2;
  elements.push(generateArrow(arrowX, arrowY, ARROW_WIDTH, THEME.textMuted));

  // Right side: Matched dye
  const matchedSwatchX = x + width - 16 - SWATCH_SIZE - QUALITY_BADGE_WIDTH - 16;

  // Matched dye swatch
  elements.push(
    rect(matchedSwatchX, swatchY, SWATCH_SIZE, SWATCH_SIZE, matchedHex, {
      rx: 6,
      ry: 6,
      stroke: THEME.border,
      strokeWidth: 2,
    })
  );

  // Matched info (right of swatch)
  const matchedInfoX = matchedSwatchX + SWATCH_SIZE + 12;
  elements.push(
    text(matchedInfoX, y + 36, 'MATCHED DYE', {
      fill: THEME.textMuted,
      fontSize: 10,
      fontFamily: FONTS.primary,
      fontWeight: 500,
    })
  );
  elements.push(
    text(matchedInfoX, y + 55, escapeXml(entry.matchedDye.name), {
      fill: THEME.text,
      fontSize: 14,
      fontFamily: FONTS.primary,
      fontWeight: 600,
    })
  );

  // Show hex and optionally distance
  const distanceText = showDistance ? `  Δ${entry.distance.toFixed(1)}` : '';
  elements.push(
    text(matchedInfoX, y + 75, `${matchedHex.toUpperCase()}${distanceText}`, {
      fill: THEME.textDim,
      fontSize: 11,
      fontFamily: FONTS.mono,
    })
  );

  // Quality badge (right edge)
  const badgeX = x + width - QUALITY_BADGE_WIDTH - 8;
  const badgeY = y + (ROW_HEIGHT - 28) / 2;
  elements.push(generateQualityBadge(quality.shortLabel, badgeX, badgeY, entry.distance));

  return elements.join('\n');
}

/**
 * Generate an arrow SVG element
 */
function generateArrow(x: number, y: number, width: number, color: string): string {
  const arrowHeight = 12;
  const lineEnd = x + width - 8;

  return `<g>
    <line x1="${x}" y1="${y}" x2="${lineEnd}" y2="${y}" stroke="${color}" stroke-width="2"/>
    <polygon points="${lineEnd},${y - arrowHeight / 2} ${lineEnd + 8},${y} ${lineEnd},${y + arrowHeight / 2}" fill="${color}"/>
  </g>`;
}

/**
 * Generate a quality badge
 */
function generateQualityBadge(
  label: string,
  x: number,
  y: number,
  distance: number
): string {
  // Determine badge color based on distance
  let bgColor: string;
  let textColor: string;

  if (distance === 0) {
    bgColor = THEME.success;
    textColor = '#000000';
  } else if (distance < 10) {
    bgColor = '#3b82f6'; // Blue
    textColor = '#ffffff';
  } else if (distance < 25) {
    bgColor = '#22c55e'; // Green
    textColor = '#ffffff';
  } else if (distance < 50) {
    bgColor = THEME.warning;
    textColor = '#000000';
  } else {
    bgColor = THEME.textDim;
    textColor = '#ffffff';
  }

  return `<g>
    ${rect(x, y, QUALITY_BADGE_WIDTH, 28, bgColor, { rx: 4, ry: 4 })}
    ${text(x + QUALITY_BADGE_WIDTH / 2, y + 18, label, {
      fill: textColor,
      fontSize: 11,
      fontFamily: FONTS.primary,
      fontWeight: 600,
      textAnchor: 'middle',
    })}
  </g>`;
}

/**
 * Generate an empty palette message
 */
function generateEmptyPalette(width: number): string {
  const height = 120;
  const elements: string[] = [];

  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12, ry: 12 }));
  elements.push(
    text(width / 2, height / 2, 'No colors extracted from image', {
      fill: THEME.textMuted,
      fontSize: 16,
      fontFamily: FONTS.primary,
      textAnchor: 'middle',
      dominantBaseline: 'middle',
    })
  );

  return createSvgDocument(width, height, elements.join('\n'));
}
