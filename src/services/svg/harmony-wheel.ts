/**
 * Harmony Wheel SVG Generator
 *
 * Generates a color harmony wheel visualization showing the base color
 * and its harmonious dye matches positioned at their actual hue angles.
 *
 * Colors are positioned on the wheel based on their HSV hue value,
 * matching the traditional color wheel representation (like 1.x version).
 */

import {
  createSvgDocument,
  rect,
  circle,
  line,
  text,
  hexToRgb,
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
  /** Base color hex */
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
 * Converts RGB to HSV and returns the hue (0-360)
 */
function rgbToHue(r: number, g: number, b: number): number {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;

  if (delta === 0) {
    hue = 0; // Achromatic (gray)
  } else if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }

  if (hue < 0) hue += 360;

  return hue;
}

/**
 * Gets the hue angle from a hex color
 */
function getHueFromHex(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHue(r, g, b);
}

/**
 * Generates a harmony wheel SVG showing color relationships
 * Colors are positioned at their actual hue angles on the wheel
 */
export function generateHarmonyWheel(options: HarmonyWheelOptions): string {
  const {
    baseColor,
    baseName,
    harmonyType,
    dyes,
    width = 400,
    height = 400,
  } = options;

  const centerX = width / 2;
  const centerY = height / 2;
  const wheelRadius = Math.min(width, height) / 2 - 40;
  const markerRadius = 20;

  // Inner radius ratio - larger = thinner wheel
  const innerRadiusRatio = 0.55;
  // Position markers in the middle of the ring
  const markerRadiusRatio = (1 + innerRadiusRatio) / 2; // 0.775

  const elements: string[] = [];

  // Background
  elements.push(rect(0, 0, width, height, THEME.background, { rx: 12 }));

  // Generate the filled color wheel (like 1.x)
  elements.push(generateFilledColorWheel(centerX, centerY, wheelRadius, innerRadiusRatio));

  // Dark center circle
  elements.push(
    circle(centerX, centerY, wheelRadius * innerRadiusRatio, THEME.background, {
      stroke: THEME.border,
      strokeWidth: 1,
    })
  );

  // Get base color hue for positioning
  const baseHue = getHueFromHex(baseColor);

  // Draw connecting lines from center to each marker
  // Base color line
  const baseAngle = baseHue - 90; // -90 to start from top
  const baseRad = (baseAngle * Math.PI) / 180;
  const baseX = centerX + Math.cos(baseRad) * wheelRadius * markerRadiusRatio;
  const baseY = centerY + Math.sin(baseRad) * wheelRadius * markerRadiusRatio;

  elements.push(
    line(centerX, centerY, baseX, baseY, '#ffffff', 2, { opacity: 0.6 })
  );

  // Harmony dye lines and markers
  dyes.forEach((dye) => {
    const dyeHue = getHueFromHex(dye.hex);
    const dyeAngle = dyeHue - 90;
    const dyeRad = (dyeAngle * Math.PI) / 180;
    const dyeX = centerX + Math.cos(dyeRad) * wheelRadius * markerRadiusRatio;
    const dyeY = centerY + Math.sin(dyeRad) * wheelRadius * markerRadiusRatio;

    elements.push(
      line(centerX, centerY, dyeX, dyeY, '#ffffff', 2, { opacity: 0.6 })
    );
  });

  // Draw base color marker (on the wheel at its hue position)
  elements.push(
    circle(baseX, baseY, markerRadius + 2, baseColor, {
      stroke: '#ffffff',
      strokeWidth: 3,
    })
  );

  // Draw harmony dye markers at their hue positions
  dyes.forEach((dye) => {
    const dyeHue = getHueFromHex(dye.hex);
    const dyeAngle = dyeHue - 90;
    const dyeRad = (dyeAngle * Math.PI) / 180;
    const dyeX = centerX + Math.cos(dyeRad) * wheelRadius * markerRadiusRatio;
    const dyeY = centerY + Math.sin(dyeRad) * wheelRadius * markerRadiusRatio;

    elements.push(
      circle(dyeX, dyeY, markerRadius, dye.hex, {
        stroke: '#ffffff',
        strokeWidth: 3,
      })
    );
  });

  return createSvgDocument(width, height, elements.join('\n'));
}

/**
 * Generates a filled color wheel with continuous gradient (like 1.x)
 */
function generateFilledColorWheel(
  cx: number,
  cy: number,
  radius: number,
  innerRadiusRatio: number = 0.55
): string {
  const segments: string[] = [];
  const segmentCount = 72; // More segments for smoother gradient
  const segmentAngle = 360 / segmentCount;
  const innerRadius = radius * innerRadiusRatio;

  for (let i = 0; i < segmentCount; i++) {
    const startAngle = i * segmentAngle;
    const endAngle = startAngle + segmentAngle + 0.5; // Slight overlap to prevent gaps
    const hue = startAngle;

    // Calculate arc points
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    // Outer arc points
    const ox1 = cx + radius * Math.cos(startRad);
    const oy1 = cy + radius * Math.sin(startRad);
    const ox2 = cx + radius * Math.cos(endRad);
    const oy2 = cy + radius * Math.sin(endRad);

    // Inner arc points
    const ix1 = cx + innerRadius * Math.cos(startRad);
    const iy1 = cy + innerRadius * Math.sin(startRad);
    const ix2 = cx + innerRadius * Math.cos(endRad);
    const iy2 = cy + innerRadius * Math.sin(endRad);

    // Create wedge path
    const path = `M ${ix1} ${iy1} L ${ox1} ${oy1} A ${radius} ${radius} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 0 0 ${ix1} ${iy1} Z`;

    segments.push(
      `<path d="${path}" fill="hsl(${hue}, 100%, 50%)" stroke="none"/>`
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
