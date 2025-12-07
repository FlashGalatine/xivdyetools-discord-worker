/**
 * Image Processing Services
 *
 * Provides image loading, validation, and pixel extraction
 * using WASM-based photon for Cloudflare Workers compatibility.
 *
 * @module services/image
 */

export {
  // Types
  type ProcessedImage,
  type ProcessImageOptions,
  // Functions
  loadImage,
  resizeImage,
  extractPixels,
  processImageForExtraction,
  getImageDimensions,
} from './photon.js';
