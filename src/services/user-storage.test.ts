/**
 * Tests for User Storage Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    clearFavorites,
    getCollections,
    getCollection,
    createCollection,
    deleteCollection,
    renameCollection,
    addDyeToCollection,
    removeDyeFromCollection,
    MAX_FAVORITES,
    MAX_COLLECTIONS,
    MAX_DYES_PER_COLLECTION,
    MAX_COLLECTION_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
} from './user-storage.js';

// Create mock KV namespace with proper Map-based storage
function createMockKV() {
    const store = new Map<string, string>();

    return {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        _store: store,
    } as unknown as KVNamespace & { _store: Map<string, string> };
}

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
});

describe('user-storage.ts', () => {
    let mockKV: ReturnType<typeof createMockKV>;
    const mockUserId = 'user-123';

    beforeEach(() => {
        mockKV = createMockKV();
        vi.clearAllMocks();
    });

    describe('Constants', () => {
        it('should have correct default limits', () => {
            expect(MAX_FAVORITES).toBe(20);
            expect(MAX_COLLECTIONS).toBe(50);
            expect(MAX_DYES_PER_COLLECTION).toBe(20);
            expect(MAX_COLLECTION_NAME_LENGTH).toBe(50);
            expect(MAX_DESCRIPTION_LENGTH).toBe(200);
        });
    });

    // ==========================================================================
    // Favorites Tests
    // ==========================================================================

    describe('getFavorites', () => {
        it('should return empty array when no favorites exist', async () => {
            const favorites = await getFavorites(mockKV, mockUserId);
            expect(favorites).toEqual([]);
        });

        it('should return favorites from KV', async () => {
            mockKV._store.set(`xivdye:favorites:${mockUserId}`, JSON.stringify([1, 2, 3]));

            const favorites = await getFavorites(mockKV, mockUserId);

            expect(favorites).toEqual([1, 2, 3]);
        });

        it('should return empty array on KV error', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV error'));

            const favorites = await getFavorites(mockKV, mockUserId);

            expect(favorites).toEqual([]);
        });
    });

    describe('addFavorite', () => {
        it('should add a new favorite', async () => {
            const result = await addFavorite(mockKV, mockUserId, 5729);

            expect(result.success).toBe(true);
            expect(mockKV.put).toHaveBeenCalled();

            const stored = JSON.parse(mockKV._store.get(`xivdye:favorites:${mockUserId}`)!);
            expect(stored).toContain(5729);
        });

        it('should return alreadyExists if dye is already a favorite', async () => {
            await addFavorite(mockKV, mockUserId, 5729);

            const result = await addFavorite(mockKV, mockUserId, 5729);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('alreadyExists');
        });

        it('should return limitReached when at max favorites', async () => {
            // Add MAX_FAVORITES dyes
            for (let i = 0; i < MAX_FAVORITES; i++) {
                await addFavorite(mockKV, mockUserId, i + 1);
            }

            const result = await addFavorite(mockKV, mockUserId, 9999);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('limitReached');
        });

        it('should return error on KV failure', async () => {
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await addFavorite(mockKV, mockUserId, 1);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('error');
        });
    });

    describe('removeFavorite', () => {
        it('should remove a favorite', async () => {
            await addFavorite(mockKV, mockUserId, 5729);
            await addFavorite(mockKV, mockUserId, 5730);

            const result = await removeFavorite(mockKV, mockUserId, 5729);

            expect(result).toBe(true);

            const favorites = await getFavorites(mockKV, mockUserId);
            expect(favorites).not.toContain(5729);
            expect(favorites).toContain(5730);
        });

        it('should return false when favorite not found', async () => {
            const result = await removeFavorite(mockKV, mockUserId, 9999);
            expect(result).toBe(false);
        });

        it('should return false on KV error', async () => {
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));
            await addFavorite(mockKV, mockUserId, 1);
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await removeFavorite(mockKV, mockUserId, 1);
            expect(result).toBe(false);
        });
    });

    describe('isFavorite', () => {
        it('should return true if dye is a favorite', async () => {
            await addFavorite(mockKV, mockUserId, 5729);

            const result = await isFavorite(mockKV, mockUserId, 5729);

            expect(result).toBe(true);
        });

        it('should return false if dye is not a favorite', async () => {
            const result = await isFavorite(mockKV, mockUserId, 5729);

            expect(result).toBe(false);
        });
    });

    describe('clearFavorites', () => {
        it('should clear all favorites', async () => {
            await addFavorite(mockKV, mockUserId, 1);
            await addFavorite(mockKV, mockUserId, 2);

            const result = await clearFavorites(mockKV, mockUserId);

            expect(result).toBe(true);
            expect(mockKV.delete).toHaveBeenCalled();
        });

        it('should return false on KV error', async () => {
            mockKV.delete = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await clearFavorites(mockKV, mockUserId);

            expect(result).toBe(false);
        });
    });

    // ==========================================================================
    // Collections Tests
    // ==========================================================================

    describe('getCollections', () => {
        it('should return empty array when no collections exist', async () => {
            const collections = await getCollections(mockKV, mockUserId);
            expect(collections).toEqual([]);
        });

        it('should return collections from KV', async () => {
            const mockCollections = [{ id: '1', name: 'Test', dyes: [], createdAt: '', updatedAt: '' }];
            mockKV._store.set(`xivdye:collections:${mockUserId}`, JSON.stringify(mockCollections));

            const collections = await getCollections(mockKV, mockUserId);

            expect(collections).toEqual(mockCollections);
        });

        it('should return empty array on KV error', async () => {
            mockKV.get = vi.fn().mockRejectedValue(new Error('KV error'));

            const collections = await getCollections(mockKV, mockUserId);

            expect(collections).toEqual([]);
        });
    });

    describe('getCollection', () => {
        it('should return a collection by name (case-insensitive)', async () => {
            await createCollection(mockKV, mockUserId, 'My Collection', 'Description');

            const collection = await getCollection(mockKV, mockUserId, 'my collection');

            expect(collection).not.toBeNull();
            expect(collection?.name).toBe('My Collection');
        });

        it('should return null if collection not found', async () => {
            const collection = await getCollection(mockKV, mockUserId, 'NonExistent');

            expect(collection).toBeNull();
        });
    });

    describe('createCollection', () => {
        it('should create a new collection', async () => {
            const result = await createCollection(mockKV, mockUserId, 'New Collection', 'A description');

            expect(result.success).toBe(true);
            expect(result.collection).toBeDefined();
            expect(result.collection?.name).toBe('New Collection');
            expect(result.collection?.description).toBe('A description');
            expect(result.collection?.dyes).toEqual([]);
        });

        it('should create collection without description', async () => {
            const result = await createCollection(mockKV, mockUserId, 'No Desc');

            expect(result.success).toBe(true);
            expect(result.collection?.description).toBeUndefined();
        });

        it('should return nameTooLong for names exceeding limit', async () => {
            const longName = 'a'.repeat(MAX_COLLECTION_NAME_LENGTH + 1);

            const result = await createCollection(mockKV, mockUserId, longName);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('nameTooLong');
        });

        it('should return descriptionTooLong for descriptions exceeding limit', async () => {
            const longDesc = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);

            const result = await createCollection(mockKV, mockUserId, 'Name', longDesc);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('descriptionTooLong');
        });

        it('should return alreadyExists for duplicate names (case-insensitive)', async () => {
            await createCollection(mockKV, mockUserId, 'My Collection');

            const result = await createCollection(mockKV, mockUserId, 'MY COLLECTION');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('alreadyExists');
        });

        it('should return limitReached at max collections', async () => {
            for (let i = 0; i < MAX_COLLECTIONS; i++) {
                await createCollection(mockKV, mockUserId, `Collection ${i}`);
            }

            const result = await createCollection(mockKV, mockUserId, 'One More');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('limitReached');
        });

        it('should return error on KV failure', async () => {
            mockKV.put = vi.fn().mockRejectedValue(new Error('KV error'));

            const result = await createCollection(mockKV, mockUserId, 'Test');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('error');
        });
    });

    describe('deleteCollection', () => {
        it('should delete a collection', async () => {
            await createCollection(mockKV, mockUserId, 'To Delete');

            const result = await deleteCollection(mockKV, mockUserId, 'To Delete');

            expect(result).toBe(true);

            const collection = await getCollection(mockKV, mockUserId, 'To Delete');
            expect(collection).toBeNull();
        });

        it('should return false if collection not found', async () => {
            const result = await deleteCollection(mockKV, mockUserId, 'NonExistent');

            expect(result).toBe(false);
        });

        it('should be case-insensitive', async () => {
            await createCollection(mockKV, mockUserId, 'My Collection');

            const result = await deleteCollection(mockKV, mockUserId, 'MY COLLECTION');

            expect(result).toBe(true);
        });
    });

    describe('renameCollection', () => {
        it('should rename a collection', async () => {
            await createCollection(mockKV, mockUserId, 'Old Name');

            const result = await renameCollection(mockKV, mockUserId, 'Old Name', 'New Name');

            expect(result.success).toBe(true);

            const oldCollection = await getCollection(mockKV, mockUserId, 'Old Name');
            const newCollection = await getCollection(mockKV, mockUserId, 'New Name');

            expect(oldCollection).toBeNull();
            expect(newCollection).not.toBeNull();
            expect(newCollection?.name).toBe('New Name');
        });

        it('should return nameTooLong for long names', async () => {
            await createCollection(mockKV, mockUserId, 'Current');

            const result = await renameCollection(
                mockKV, mockUserId, 'Current', 'a'.repeat(MAX_COLLECTION_NAME_LENGTH + 1)
            );

            expect(result.success).toBe(false);
            expect(result.reason).toBe('nameTooLong');
        });

        it('should return notFound if collection does not exist', async () => {
            const result = await renameCollection(mockKV, mockUserId, 'NonExistent', 'New');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('notFound');
        });

        it('should return alreadyExists if new name is taken', async () => {
            await createCollection(mockKV, mockUserId, 'First');
            await createCollection(mockKV, mockUserId, 'Second');

            const result = await renameCollection(mockKV, mockUserId, 'First', 'Second');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('alreadyExists');
        });
    });

    describe('addDyeToCollection', () => {
        it('should add a dye to a collection', async () => {
            await createCollection(mockKV, mockUserId, 'My Dyes');

            const result = await addDyeToCollection(mockKV, mockUserId, 'My Dyes', 5729);

            expect(result.success).toBe(true);

            const collection = await getCollection(mockKV, mockUserId, 'My Dyes');
            expect(collection?.dyes).toContain(5729);
        });

        it('should return notFound if collection does not exist', async () => {
            const result = await addDyeToCollection(mockKV, mockUserId, 'NonExistent', 5729);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('notFound');
        });

        it('should return alreadyExists if dye is already in collection', async () => {
            await createCollection(mockKV, mockUserId, 'My Dyes');
            await addDyeToCollection(mockKV, mockUserId, 'My Dyes', 5729);

            const result = await addDyeToCollection(mockKV, mockUserId, 'My Dyes', 5729);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('alreadyExists');
        });

        it('should return limitReached at max dyes per collection', async () => {
            await createCollection(mockKV, mockUserId, 'Full Collection');

            for (let i = 0; i < MAX_DYES_PER_COLLECTION; i++) {
                await addDyeToCollection(mockKV, mockUserId, 'Full Collection', i + 1);
            }

            const result = await addDyeToCollection(mockKV, mockUserId, 'Full Collection', 9999);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('limitReached');
        });
    });

    describe('removeDyeFromCollection', () => {
        it('should remove a dye from a collection', async () => {
            await createCollection(mockKV, mockUserId, 'My Dyes');
            await addDyeToCollection(mockKV, mockUserId, 'My Dyes', 5729);
            await addDyeToCollection(mockKV, mockUserId, 'My Dyes', 5730);

            const result = await removeDyeFromCollection(mockKV, mockUserId, 'My Dyes', 5729);

            expect(result).toBe(true);

            const collection = await getCollection(mockKV, mockUserId, 'My Dyes');
            expect(collection?.dyes).not.toContain(5729);
            expect(collection?.dyes).toContain(5730);
        });

        it('should return false if collection does not exist', async () => {
            const result = await removeDyeFromCollection(mockKV, mockUserId, 'NonExistent', 5729);
            expect(result).toBe(false);
        });

        it('should return false if dye is not in collection', async () => {
            await createCollection(mockKV, mockUserId, 'My Dyes');

            const result = await removeDyeFromCollection(mockKV, mockUserId, 'My Dyes', 9999);
            expect(result).toBe(false);
        });
    });
});
