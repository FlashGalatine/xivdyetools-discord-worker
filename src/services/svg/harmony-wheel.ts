/**
 * Harmony Wheel SVG Generator
 *
 * Generates a color harmony wheel visualization showing the base color
 * and its harmonious dye matches arranged in a circular pattern.
 */

import {
  createSvgDocument,
  rect,
  circle,
  line,
  text,
  escapeXml,
  getContrastTextColor,
  THEME,
  FONTS,
} from './base.js';

export interface HarmonyDye {
  id: number;
  name: string;
  hex: string;
  category?: string;
}

export interface HarmonyWheelOptions {
  /** Base color hex (center of wheel) */
  baseColor: string;
  /** Name of the base color/dye */
  baseName?: string;
  /** Type of harmony (triadic, complementary, etc.) */
  harmonyType: string;
  /** Matched dyes for the harmony */
  dyes: HarmonyDye[];
  /** Width of the output image */
  width?: number;
  /** Height of the output image */
  height?: number;
}

/**
 * Generates a harmony wheel SVG showing color relationships
 */
export function generateHarmonyWheel(options: HarmonyWheelOptions): string {
  const {
    baseColor,
    baseName,
    harmonyType,
    dyes,
    width = 500,
    height = 500,
  } = options;

  const centerX = width / 2;
  const centerY = height / 2 - 20; // Shift up to make room for legend
  const outerRadius = Math.min(width, height) / 2 - 80;
  const innerRadius = outerRadius - 60;

  const elements: string[] = [];

  // Background
  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12 }));

  // Title
  elements.push(
    text(centerX, 30, `${formatHarmonyType(harmonyType)} Harmony`, {
      fill: THEME.text,
      fontSize: 20,
      fontFamily: FONTS.primary,
      fontWeight: 'bold',
      textAnchor: 'middle',
    })
  );

  // Hue ring (decorative background)
  elements.push(generateHueRing(centerX, centerY, outerRadius + 15, 8));

  // Outer circle (border)
  elements.push(
    circle(centerX, centerY, outerRadius, 'none', {
      stroke: THEME.border,
      strokeWidth: 2,
    })
  );

  // Inner circle (border)
  elements.push(
    circle(centerX, centerY, innerRadius, THEME.backgroundLight, {
      stroke: THEME.border,
      strokeWidth: 1,
    })
  );

  // Dye markers around the wheel
  const angleStep = 360 / dyes.length;
  dyes.forEach((dye, index) => {
    const angle = index * angleStep - 90; // Start from top
    const radians = (angle * Math.PI) / 180;
    const markerRadius = (outerRadius + innerRadius) / 2;

    const x = centerX + Math.cos(radians) * markerRadius;
    const y = centerY + Math.sin(radians) * markerRadius;

    // Connecting line to center
    elements.push(
      line(centerX, centerY, x, y, dye.hex, 2, { opacity: 0.4 })
    );

    // Dye marker circle
    elements.push(
      circle(x, y, 28, dye.hex, {
        stroke: '#ffffff',
        strokeWidth: 3,
      })
    );

    // Dye number label
    elements.push(
      text(x, y, `${index + 1}`, {
        fill: getContrastTextColor(dye.hex),
        fontSize: 14,
        fontFamily: FONTS.primary,
        fontWeight: 'bold',
        textAnchor: 'middle',
        dominantBaseline: 'middle',
      })
    );
  });

  // Center circle with base color
  elements.push(
    circle(centerX, centerY, 35, baseColor, {
      stroke: '#ffffff',
      strokeWidth: 4,
    })
  );

  // Base color label
  if (baseName) {
    elements.push(
      text(centerX, centerY + 55, baseName, {
        fill: THEME.textMuted,
        fontSize: 11,
        fontFamily: FONTS.primary,
        textAnchor: 'middle',
      })
    );
  }

  // Legend at the bottom
  const legendY = height - 80;
  const legendItemWidth = Math.min(120, (width - 40) / dyes.length);
  const legendStartX = (width - legendItemWidth * dyes.length) / 2;

  dyes.forEach((dye, index) => {
    const itemX = legendStartX + index * legendItemWidth + legendItemWidth / 2;

    // Color swatch
    elements.push(
      rect(itemX - 15, legendY, 30, 20, dye.hex, {
        rx: 4,
        stroke: THEME.border,
        strokeWidth: 1,
      })
    );

    // Number
    elements.push(
      text(itemX, legendY + 13, `${index + 1}`, {
        fill: getContrastTextColor(dye.hex),
        fontSize: 12,
        fontFamily: FONTS.primary,
        fontWeight: 'bold',
        textAnchor: 'middle',
        dominantBaseline: 'middle',
      })
    );

    // Dye name (truncated if needed)
    const displayName = truncateName(dye.name, 14);
    elements.push(
      text(itemX, legendY + 38, displayName, {
        fill: THEME.text,
        fontSize: 10,
        fontFamily: FONTS.primary,
        textAnchor: 'middle',
      })
    );

    // Hex code
    elements.push(
      text(itemX, legendY + 52, dye.hex.toUpperCase(), {
        fill: THEME.textMuted,
        fontSize: 9,
        fontFamily: FONTS.mono,
        textAnchor: 'middle',
      })
    );
  });

  return createSvgDocument(width, height, elements.join('\n'));
}

/**
 * Generates a decorative hue ring around the wheel
 */
function generateHueRing(
  cx: number,
  cy: number,
  radius: number,
  strokeWidth: number
): string {
  const segments: string[] = [];
  const segmentCount = 36;
  const segmentAngle = 360 / segmentCount;

  for (let i = 0; i < segmentCount; i++) {
    const startAngle = i * segmentAngle;
    const hue = startAngle;

    // Calculate arc endpoints
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((startAngle + segmentAngle - 90) * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    segments.push(
      `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}"
             fill="none"
             stroke="hsl(${hue}, 70%, 50%)"
             stroke-width="${strokeWidth}"
             opacity="0.6"/>`
    );
  }

  return segments.join('\n');
}

/**
 * Formats harmony type for display
 */
function formatHarmonyType(type: string): string {
  const formats: Record<string, string> = {
    complementary: 'Complementary',
    analogous: 'Analogous',
    triadic: 'Triadic',
    'split-complementary': 'Split-Complementary',
    tetradic: 'Tetradic',
    square: 'Square',
    monochromatic: 'Monochromatic',
  };
  return formats[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Truncates a name to fit within the legend
 */
function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 2) + '..';
}
