/**
 * SVG to PNG Renderer
 *
 * Uses resvg-wasm to convert SVG strings to PNG images.
 * This is necessary because Discord displays PNG images better than SVG.
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';

// Track WASM initialization state
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

// WASM binary URL from jsDelivr CDN
// Using a specific version for stability - matches the npm package version
const RESVG_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

/**
 * Initializes the WASM module.
 * Must be called before rendering SVGs.
 * Safe to call multiple times - will only initialize once.
 */
export async function initRenderer(): Promise<void> {
  if (wasmInitialized) return;

  if (wasmInitPromise) {
    await wasmInitPromise;
    return;
  }

  wasmInitPromise = (async () => {
    try {
      // Fetch WASM binary from CDN
      const response = await fetch(RESVG_WASM_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
      }

      const wasmBuffer = await response.arrayBuffer();
      await initWasm(wasmBuffer);
      wasmInitialized = true;
      console.log('resvg-wasm initialized successfully');
    } catch (error) {
      console.error('WASM initialization failed:', error);
      throw new Error(
        `Failed to initialize SVG renderer: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  })();

  await wasmInitPromise;
}

/**
 * Renders an SVG string to a PNG buffer
 */
export async function renderSvgToPng(
  svgString: string,
  options: {
    /** Scale factor (2 = 2x resolution) */
    scale?: number;
    /** Background color (default: transparent) */
    background?: string;
  } = {}
): Promise<Uint8Array> {
  // Ensure WASM is initialized
  await initRenderer();

  const { scale = 2, background } = options;

  try {
    const resvg = new Resvg(svgString, {
      fitTo: {
        mode: 'zoom',
        value: scale,
      },
      background,
      font: {
        // Use system fonts that are commonly available
        defaultFontFamily: 'Arial',
      },
    });

    const rendered = resvg.render();
    const pngBuffer = rendered.asPng();

    return pngBuffer;
  } catch (error) {
    console.error('SVG rendering failed:', error);
    throw new Error(
      `Failed to render SVG: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Renders an SVG to a PNG and returns it as a base64 data URL
 * Useful for embedding in HTML or testing
 */
export async function renderSvgToDataUrl(svgString: string): Promise<string> {
  const pngBuffer = await renderSvgToPng(svgString);
  const base64 = bufferToBase64(pngBuffer);
  return `data:image/png;base64,${base64}`;
}

/**
 * Converts a Uint8Array to a base64 string
 */
function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
