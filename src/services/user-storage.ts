/**
 * User Storage Service
 *
 * Manages user favorites and collections using Cloudflare KV.
 *
 * @module services/user-storage
 */

// ============================================================================
// Constants
// ============================================================================

const FAVORITES_KEY_PREFIX = 'xivdye:favorites:';
const COLLECTIONS_KEY_PREFIX = 'xivdye:collections:';

/** Maximum number of favorite dyes per user */
export const MAX_FAVORITES = 20;

/** Maximum number of collections per user */
export const MAX_COLLECTIONS = 50;

/** Maximum number of dyes per collection */
export const MAX_DYES_PER_COLLECTION = 20;

/** Maximum length for collection names */
export const MAX_COLLECTION_NAME_LENGTH = 50;

/** Maximum length for collection descriptions */
export const MAX_DESCRIPTION_LENGTH = 200;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of an add operation
 */
export interface AddResult {
  success: boolean;
  reason?: 'alreadyExists' | 'limitReached' | 'notFound' | 'error';
}

/**
 * A dye collection
 */
export interface Collection {
  /** Unique identifier */
  id: string;
  /** Collection name */
  name: string;
  /** Optional description */
  description?: string;
  /** Array of dye IDs in the collection */
  dyes: number[];
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// ============================================================================
// Favorites Functions
// ============================================================================

/**
 * Get a user's favorite dyes
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @returns Array of dye IDs
 */
export async function getFavorites(kv: KVNamespace, userId: string): Promise<number[]> {
  try {
    const data = await kv.get(`${FAVORITES_KEY_PREFIX}${userId}`);
    if (!data) return [];
    return JSON.parse(data) as number[];
  } catch (error) {
    console.error('Failed to get favorites:', error);
    return [];
  }
}

/**
 * Add a dye to user's favorites
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param dyeId - Dye ID to add
 * @returns Result of the operation
 */
export async function addFavorite(
  kv: KVNamespace,
  userId: string,
  dyeId: number
): Promise<AddResult> {
  try {
    const favorites = await getFavorites(kv, userId);

    // Check if already a favorite
    if (favorites.includes(dyeId)) {
      return { success: false, reason: 'alreadyExists' };
    }

    // Check limit
    if (favorites.length >= MAX_FAVORITES) {
      return { success: false, reason: 'limitReached' };
    }

    // Add and save
    favorites.push(dyeId);
    await kv.put(`${FAVORITES_KEY_PREFIX}${userId}`, JSON.stringify(favorites));

    return { success: true };
  } catch (error) {
    console.error('Failed to add favorite:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Remove a dye from user's favorites
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param dyeId - Dye ID to remove
 * @returns True if removed, false if not found
 */
export async function removeFavorite(
  kv: KVNamespace,
  userId: string,
  dyeId: number
): Promise<boolean> {
  try {
    const favorites = await getFavorites(kv, userId);
    const index = favorites.indexOf(dyeId);

    if (index === -1) {
      return false;
    }

    favorites.splice(index, 1);
    await kv.put(`${FAVORITES_KEY_PREFIX}${userId}`, JSON.stringify(favorites));

    return true;
  } catch (error) {
    console.error('Failed to remove favorite:', error);
    return false;
  }
}

/**
 * Check if a dye is in user's favorites
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param dyeId - Dye ID to check
 * @returns True if dye is a favorite
 */
export async function isFavorite(
  kv: KVNamespace,
  userId: string,
  dyeId: number
): Promise<boolean> {
  const favorites = await getFavorites(kv, userId);
  return favorites.includes(dyeId);
}

/**
 * Clear all user's favorites
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 */
export async function clearFavorites(kv: KVNamespace, userId: string): Promise<boolean> {
  try {
    await kv.delete(`${FAVORITES_KEY_PREFIX}${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to clear favorites:', error);
    return false;
  }
}

// ============================================================================
// Collections Functions
// ============================================================================

/**
 * Get all collections for a user
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @returns Array of collections
 */
export async function getCollections(kv: KVNamespace, userId: string): Promise<Collection[]> {
  try {
    const data = await kv.get(`${COLLECTIONS_KEY_PREFIX}${userId}`);
    if (!data) return [];
    return JSON.parse(data) as Collection[];
  } catch (error) {
    console.error('Failed to get collections:', error);
    return [];
  }
}

/**
 * Get a specific collection by name
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param name - Collection name (case-insensitive)
 * @returns Collection or null if not found
 */
export async function getCollection(
  kv: KVNamespace,
  userId: string,
  name: string
): Promise<Collection | null> {
  const collections = await getCollections(kv, userId);
  return collections.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/**
 * Create a new collection
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param name - Collection name
 * @param description - Optional description
 * @returns Result with collection if successful
 */
export async function createCollection(
  kv: KVNamespace,
  userId: string,
  name: string,
  description?: string
): Promise<{ success: boolean; collection?: Collection; reason?: string }> {
  try {
    // Validate name length
    if (name.length > MAX_COLLECTION_NAME_LENGTH) {
      return { success: false, reason: 'nameTooLong' };
    }

    // Validate description length
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return { success: false, reason: 'descriptionTooLong' };
    }

    const collections = await getCollections(kv, userId);

    // Check for duplicate name
    if (collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, reason: 'alreadyExists' };
    }

    // Check limit
    if (collections.length >= MAX_COLLECTIONS) {
      return { success: false, reason: 'limitReached' };
    }

    // Create new collection
    const now = new Date().toISOString();
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      description,
      dyes: [],
      createdAt: now,
      updatedAt: now,
    };

    collections.push(collection);
    await kv.put(`${COLLECTIONS_KEY_PREFIX}${userId}`, JSON.stringify(collections));

    return { success: true, collection };
  } catch (error) {
    console.error('Failed to create collection:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Delete a collection
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param name - Collection name to delete
 * @returns True if deleted, false if not found
 */
export async function deleteCollection(
  kv: KVNamespace,
  userId: string,
  name: string
): Promise<boolean> {
  try {
    const collections = await getCollections(kv, userId);
    const index = collections.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());

    if (index === -1) {
      return false;
    }

    collections.splice(index, 1);
    await kv.put(`${COLLECTIONS_KEY_PREFIX}${userId}`, JSON.stringify(collections));

    return true;
  } catch (error) {
    console.error('Failed to delete collection:', error);
    return false;
  }
}

/**
 * Rename a collection
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param oldName - Current collection name
 * @param newName - New collection name
 * @returns Result of the operation
 */
export async function renameCollection(
  kv: KVNamespace,
  userId: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; reason?: string }> {
  try {
    // Validate new name length
    if (newName.length > MAX_COLLECTION_NAME_LENGTH) {
      return { success: false, reason: 'nameTooLong' };
    }

    const collections = await getCollections(kv, userId);

    // Find the collection to rename
    const collection = collections.find((c) => c.name.toLowerCase() === oldName.toLowerCase());
    if (!collection) {
      return { success: false, reason: 'notFound' };
    }

    // Check if new name already exists
    if (collections.some((c) => c.name.toLowerCase() === newName.toLowerCase() && c.id !== collection.id)) {
      return { success: false, reason: 'alreadyExists' };
    }

    // Update name
    collection.name = newName;
    collection.updatedAt = new Date().toISOString();

    await kv.put(`${COLLECTIONS_KEY_PREFIX}${userId}`, JSON.stringify(collections));

    return { success: true };
  } catch (error) {
    console.error('Failed to rename collection:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Add a dye to a collection
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param collectionName - Collection name
 * @param dyeId - Dye ID to add
 * @returns Result of the operation
 */
export async function addDyeToCollection(
  kv: KVNamespace,
  userId: string,
  collectionName: string,
  dyeId: number
): Promise<AddResult> {
  try {
    const collections = await getCollections(kv, userId);
    const collection = collections.find((c) => c.name.toLowerCase() === collectionName.toLowerCase());

    if (!collection) {
      return { success: false, reason: 'notFound' };
    }

    // Check if already in collection
    if (collection.dyes.includes(dyeId)) {
      return { success: false, reason: 'alreadyExists' };
    }

    // Check limit
    if (collection.dyes.length >= MAX_DYES_PER_COLLECTION) {
      return { success: false, reason: 'limitReached' };
    }

    // Add dye
    collection.dyes.push(dyeId);
    collection.updatedAt = new Date().toISOString();

    await kv.put(`${COLLECTIONS_KEY_PREFIX}${userId}`, JSON.stringify(collections));

    return { success: true };
  } catch (error) {
    console.error('Failed to add dye to collection:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Remove a dye from a collection
 *
 * @param kv - KV namespace binding
 * @param userId - Discord user ID
 * @param collectionName - Collection name
 * @param dyeId - Dye ID to remove
 * @returns True if removed, false if not found
 */
export async function removeDyeFromCollection(
  kv: KVNamespace,
  userId: string,
  collectionName: string,
  dyeId: number
): Promise<boolean> {
  try {
    const collections = await getCollections(kv, userId);
    const collection = collections.find((c) => c.name.toLowerCase() === collectionName.toLowerCase());

    if (!collection) {
      return false;
    }

    const index = collection.dyes.indexOf(dyeId);
    if (index === -1) {
      return false;
    }

    collection.dyes.splice(index, 1);
    collection.updatedAt = new Date().toISOString();

    await kv.put(`${COLLECTIONS_KEY_PREFIX}${userId}`, JSON.stringify(collections));

    return true;
  } catch (error) {
    console.error('Failed to remove dye from collection:', error);
    return false;
  }
}
