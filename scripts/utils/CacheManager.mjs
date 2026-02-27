/**
 * Cache Manager Module for VoxChronicle
 * Provides generic key-value caching with expiration and size limits
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from './Logger.mjs';

/**
 * Represents a cache entry with value, timestamps, and optional metadata
 * @typedef {Object} CacheEntry
 * @property {*} value - The cached value (can be any type: string, object, array, etc.)
 * @property {Date} createdAt - Timestamp when the entry was created
 * @property {Date} expiresAt - Timestamp when the entry expires and should be removed
 * @property {Object} [metadata] - Optional metadata associated with the entry (e.g., tags, source info)
 */

/**
 * CacheManager - Generic key-value cache with expiration and LRU trimming
 *
 * Provides a flexible caching mechanism with automatic expiration handling and size limits.
 * Uses LRU (Least Recently Used) strategy to maintain cache size within configured limits.
 * Suitable for caching any type of data including images, text, objects, or API responses.
 *
 * Features:
 * - Automatic expiration checking and cleanup
 * - LRU-based cache trimming when max size is exceeded
 * - Optional metadata storage per cache entry
 * - Support for batch operations (getAll, getValid, clearExpired)
 * - Static utility methods for cache key generation and blob conversion
 *
 * @example
 * // Create a cache instance
 * const cache = new CacheManager({ name: 'myCache', maxSize: 50 });
 *
 * // Store a value with 1 hour expiration
 * const expiresAt = new Date(Date.now() + 3600000);
 * cache.set('key1', { data: 'value' }, expiresAt, { tag: 'important' });
 *
 * // Retrieve the value
 * const value = cache.get('key1'); // Returns { data: 'value' } or null if expired
 */
export class CacheManager {
    /**
     * Creates a new CacheManager instance
     * @param {Object} [options={}] - Configuration options
     * @param {number} [options.maxSize=100] - Maximum number of cache entries
     * @param {string} [options.name='cache'] - Cache name for logging purposes
     */
    constructor(options = {}) {
        /**
         * Cache name for logging
         * @type {string}
         * @private
         */
        this._name = options.name || 'cache';

        /**
         * Logger instance for this cache
         * @private
         */
        this._logger = Logger.createChild(`CacheManager:${this._name}`);

        /**
         * Internal cache storage
         * @type {Map<string, CacheEntry>}
         * @private
         */
        this._cache = new Map();

        /**
         * Maximum cache entries to keep
         * @type {number}
         * @private
         */
        this._maxSize = options.maxSize || 100;
    }

    /**
     * Stores a value in the cache
     * @param {string} key - The cache key
     * @param {*} value - The value to cache
     * @param {Date} expiresAt - When the entry expires
     * @param {Object} [metadata={}] - Optional metadata
     */
    set(key, value, expiresAt, metadata = {}) {
        const now = Date.now();
        const cacheEntry = {
            value: value,
            createdAt: new Date(now),
            lastAccessedAt: now,
            expiresAt: expiresAt,
            metadata: metadata
        };

        this._cache.set(key, cacheEntry);

        // Trim cache if needed
        this._trim();
    }

    /**
     * Retrieves a value from the cache
     * @param {string} key - The cache key
     * @param {boolean} [checkExpiration=true] - Whether to check if entry is expired
     * @returns {*|null} The cached value or null if not found/expired
     */
    get(key, checkExpiration = true) {
        const entry = this._cache.get(key);

        if (!entry) { return null; }

        // Check if entry has expired
        if (checkExpiration && new Date() > entry.expiresAt) {
            this._cache.delete(key);
            return null;
        }

        // Update last accessed time for LRU tracking
        entry.lastAccessedAt = Date.now();

        return entry.value;
    }

    /**
     * Gets a cache entry with full metadata
     * @param {string} key - The cache key
     * @returns {CacheEntry|null} The cache entry or null if not found
     */
    getEntry(key) {
        return this._cache.get(key) || null;
    }

    /**
     * Gets all cached entries
     * @returns {Array<*>} Array of all cached values
     */
    getAll() {
        return Array.from(this._cache.values()).map(entry => entry.value);
    }

    /**
     * Gets all cache entries with metadata
     * @returns {Array<CacheEntry>} Array of all cache entries
     */
    getAllEntries() {
        return Array.from(this._cache.values());
    }

    /**
     * Gets valid (non-expired) cached values
     * @returns {Array<*>} Array of valid cached values
     */
    getValid() {
        const now = new Date();
        return Array.from(this._cache.values())
            .filter(entry => now <= entry.expiresAt)
            .map(entry => entry.value);
    }

    /**
     * Gets valid (non-expired) cache entries
     * @returns {Array<CacheEntry>} Array of valid cache entries
     */
    getValidEntries() {
        const now = new Date();
        return Array.from(this._cache.values())
            .filter(entry => now <= entry.expiresAt);
    }

    /**
     * Clears expired cache entries
     * @returns {number} Number of entries removed
     */
    clearExpired() {
        const now = new Date();
        const expiredKeys = [];

        for (const [key, entry] of this._cache.entries()) {
            if (now > entry.expiresAt) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this._cache.delete(key);
        }

        if (expiredKeys.length > 0) {
            this._logger.info(`Cleared ${expiredKeys.length} expired cache entries`);
        }

        return expiredKeys.length;
    }

    /**
     * Clears all cached entries
     */
    clear() {
        this._cache.clear();
        this._logger.info('Cache cleared');
    }

    /**
     * Gets the current cache size
     * @returns {number} Number of entries in cache
     */
    size() {
        return this._cache.size;
    }

    /**
     * Checks if a key exists in the cache
     * @param {string} key - The cache key
     * @returns {boolean} True if key exists
     */
    has(key) {
        return this._cache.has(key);
    }

    /**
     * Removes a specific entry from the cache
     * @param {string} key - The cache key
     * @returns {boolean} True if entry was removed
     */
    delete(key) {
        return this._cache.delete(key);
    }

    /**
     * Trims the cache to stay within size limits using LRU strategy
     * @private
     */
    _trim() {
        if (this._cache.size <= this._maxSize) { return; }

        // Remove least recently used entries (LRU)
        const entries = Array.from(this._cache.entries())
            .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

        const toRemove = entries.slice(0, this._cache.size - this._maxSize);
        for (const [key] of toRemove) {
            this._cache.delete(key);
        }

        this._logger.info(`Trimmed ${toRemove.length} old cache entries`);
    }

    /**
     * Converts a Blob to base64 string
     * @param {Blob} blob - The blob to convert
     * @returns {Promise<string>} The base64 string (without data URL prefix)
     * @static
     */
    static blobToBase64(blob) {
        const readerPromise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                // Remove data URL prefix
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        // Timeout after 30 seconds for large blobs
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('FileReader timeout after 30s')), 30000);
        });

        return Promise.race([readerPromise, timeoutPromise]);
    }

    /**
     * Generates a cache key from a string using simple hash function
     * @param {string} input - The input string
     * @param {string} [prefix='cache'] - Prefix for the cache key
     * @returns {string} The cache key
     * @static
     */
    static generateCacheKey(input, prefix = 'cache') {
        // Simple hash function for cache key
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `${prefix}_${Math.abs(hash).toString(16)}`;
    }
}
