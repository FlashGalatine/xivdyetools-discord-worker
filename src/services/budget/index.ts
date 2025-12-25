/**
 * Budget Services
 *
 * Exports for the budget dye finder feature.
 *
 * @module services/budget
 */

// Universalis API client
export {
  isUniversalisEnabled,
  fetchPrices,
  fetchPricesBatched,
  fetchWorlds,
  fetchDataCenters,
  validateWorld,
  getWorldAutocomplete,
} from './universalis-client.js';

export type { UniversalisWorld, UniversalisDataCenter } from './universalis-client.js';
