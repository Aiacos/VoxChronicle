/**
 * CacheManager Unit Tests
 *
 * Tests for the CacheManager utility class.
 * Covers set/get, TTL expiration, LRU eviction, metadata,
 * batch operations, static utilities (generateCacheKey, blobToBase64),
 * and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock constants and Logger before importing CacheManager
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../../scripts/utils/Logger.mjs', () => {
  const childLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return {
    Logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      createChild: vi.fn(() => childLogger),
      _childLogger: childLogger
    }
  };
});

import { CacheManager } from '../../scripts/utils/CacheManager.mjs';
import { Logger } from '../../scripts/utils/Logger.mjs';

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({ name: 'test-cache', maxSize: 5 });
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a cache with default options', () => {
      const defaultCache = new CacheManager();
      expect(defaultCache.size()).toBe(0);
    });

    it('should create a cache with custom name and maxSize', () => {
      const customCache = new CacheManager({ name: 'custom', maxSize: 50 });
      expect(customCache.size()).toBe(0);
    });

    it('should default maxSize to 100 when not specified', () => {
      const defaultCache = new CacheManager();
      // Add 101 entries to verify default maxSize
      const futureDate = new Date(Date.now() + 60000);
      for (let i = 0; i < 101; i++) {
        defaultCache.set(`key-${i}`, `value-${i}`, futureDate);
      }
      expect(defaultCache.size()).toBe(100);
    });

    it('should default name to "cache" when not specified', () => {
      const defaultCache = new CacheManager();
      // The name is used internally for logging - we can verify by clearing
      // and checking if Logger was called
      defaultCache.clear();
      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should store a value in the cache', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      expect(cache.size()).toBe(1);
    });

    it('should store a value with metadata', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt, { tag: 'important' });
      const entry = cache.getEntry('key1');
      expect(entry.metadata).toEqual({ tag: 'important' });
    });

    it('should overwrite existing key', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      cache.set('key1', 'value2', expiresAt);
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should store any type of value', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('string', 'hello', expiresAt);
      cache.set('number', 42, expiresAt);
      cache.set('object', { a: 1 }, expiresAt);
      cache.set('array', [1, 2, 3], expiresAt);
      cache.set('null', null, expiresAt);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ a: 1 });
      expect(cache.get('array')).toEqual([1, 2, 3]);
      expect(cache.get('null')).toBeNull();
    });

    it('should default metadata to empty object', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      const entry = cache.getEntry('key1');
      expect(entry.metadata).toEqual({});
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      const after = new Date();

      const entry = cache.getEntry('key1');
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set expiresAt timestamp', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      const entry = cache.getEntry('key1');
      expect(entry.expiresAt).toBe(expiresAt);
    });
  });

  describe('get', () => {
    it('should return the cached value', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return null for expired entry (and remove it)', () => {
      const expiredDate = new Date(Date.now() - 1000); // Already expired
      cache.set('key1', 'value1', expiredDate);
      expect(cache.get('key1')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('should return value without expiration check when checkExpiration=false', () => {
      const expiredDate = new Date(Date.now() - 1000); // Already expired
      cache.set('key1', 'value1', expiredDate);
      expect(cache.get('key1', false)).toBe('value1');
      expect(cache.size()).toBe(1); // Entry should NOT be removed
    });

    it('should remove expired entry from cache on access', () => {
      const expiredDate = new Date(Date.now() - 1000);
      cache.set('key1', 'value1', expiredDate);
      cache.get('key1'); // triggers removal
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('getEntry', () => {
    it('should return the full cache entry', () => {
      const expiresAt = new Date(Date.now() + 60000);
      const metadata = { source: 'test' };
      cache.set('key1', 'value1', expiresAt, metadata);

      const entry = cache.getEntry('key1');
      expect(entry).toBeDefined();
      expect(entry.value).toBe('value1');
      expect(entry.expiresAt).toBe(expiresAt);
      expect(entry.metadata).toEqual(metadata);
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent key', () => {
      expect(cache.getEntry('nonexistent')).toBeNull();
    });

    it('should return entry even if expired (no expiration check)', () => {
      const expiredDate = new Date(Date.now() - 1000);
      cache.set('key1', 'value1', expiredDate);
      const entry = cache.getEntry('key1');
      expect(entry).not.toBeNull();
      expect(entry.value).toBe('value1');
    });
  });

  describe('getAll', () => {
    it('should return all cached values', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      cache.set('key2', 'value2', expiresAt);
      cache.set('key3', 'value3', expiresAt);

      const values = cache.getAll();
      expect(values).toHaveLength(3);
      expect(values).toContain('value1');
      expect(values).toContain('value2');
      expect(values).toContain('value3');
    });

    it('should return empty array when cache is empty', () => {
      expect(cache.getAll()).toEqual([]);
    });

    it('should include expired values (no filtering)', () => {
      const futureDate = new Date(Date.now() + 60000);
      const pastDate = new Date(Date.now() - 1000);
      cache.set('valid', 'validValue', futureDate);
      cache.set('expired', 'expiredValue', pastDate);

      const values = cache.getAll();
      expect(values).toHaveLength(2);
    });
  });

  describe('getAllEntries', () => {
    it('should return all cache entries', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt, { tag: 'a' });
      cache.set('key2', 'value2', expiresAt, { tag: 'b' });

      const entries = cache.getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveProperty('value');
      expect(entries[0]).toHaveProperty('createdAt');
      expect(entries[0]).toHaveProperty('expiresAt');
      expect(entries[0]).toHaveProperty('metadata');
    });

    it('should return empty array when cache is empty', () => {
      expect(cache.getAllEntries()).toEqual([]);
    });
  });

  describe('getValid', () => {
    it('should return only non-expired values', () => {
      const futureDate = new Date(Date.now() + 60000);
      const pastDate = new Date(Date.now() - 1000);

      cache.set('valid1', 'value1', futureDate);
      cache.set('valid2', 'value2', futureDate);
      cache.set('expired', 'expiredValue', pastDate);

      const valid = cache.getValid();
      expect(valid).toHaveLength(2);
      expect(valid).toContain('value1');
      expect(valid).toContain('value2');
      expect(valid).not.toContain('expiredValue');
    });

    it('should return empty array when all entries are expired', () => {
      const pastDate = new Date(Date.now() - 1000);
      cache.set('expired1', 'value1', pastDate);
      cache.set('expired2', 'value2', pastDate);

      expect(cache.getValid()).toEqual([]);
    });

    it('should return empty array when cache is empty', () => {
      expect(cache.getValid()).toEqual([]);
    });
  });

  describe('getValidEntries', () => {
    it('should return only non-expired entries with full metadata', () => {
      const futureDate = new Date(Date.now() + 60000);
      const pastDate = new Date(Date.now() - 1000);

      cache.set('valid', 'value1', futureDate, { tag: 'good' });
      cache.set('expired', 'value2', pastDate, { tag: 'old' });

      const entries = cache.getValidEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe('value1');
      expect(entries[0].metadata).toEqual({ tag: 'good' });
    });

    it('should return empty array when cache is empty', () => {
      expect(cache.getValidEntries()).toEqual([]);
    });
  });

  describe('clearExpired', () => {
    it('should remove expired entries and return count', () => {
      const futureDate = new Date(Date.now() + 60000);
      const pastDate = new Date(Date.now() - 1000);

      cache.set('valid', 'value1', futureDate);
      cache.set('expired1', 'value2', pastDate);
      cache.set('expired2', 'value3', pastDate);

      const removed = cache.clearExpired();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(1);
      expect(cache.get('valid')).toBe('value1');
    });

    it('should return 0 when no entries are expired', () => {
      const futureDate = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', futureDate);
      cache.set('key2', 'value2', futureDate);

      expect(cache.clearExpired()).toBe(0);
      expect(cache.size()).toBe(2);
    });

    it('should return 0 when cache is empty', () => {
      expect(cache.clearExpired()).toBe(0);
    });

    it('should log when entries are cleared', () => {
      const pastDate = new Date(Date.now() - 1000);
      cache.set('expired', 'value', pastDate);

      cache.clearExpired();
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleared 1 expired cache entries'),
        expect.any(String)
      );
    });

    it('should not log when no entries are cleared', () => {
      vi.clearAllMocks();
      cache.clearExpired();
      // Logger.info should not have been called for clearExpired (0 items)
      expect(Logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleared'),
        expect.any(String)
      );
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      cache.set('key2', 'value2', expiresAt);

      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should log cache cleared message', () => {
      cache.clear();
      expect(Logger.info).toHaveBeenCalledWith('Cache cleared', expect.any(String));
    });

    it('should work on empty cache', () => {
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });

    it('should return correct count after adding entries', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      cache.set('key2', 'value2', expiresAt);
      expect(cache.size()).toBe(2);
    });

    it('should decrease after deletion', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      cache.set('key2', 'value2', expiresAt);
      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return true even for expired key (no expiration check)', () => {
      const pastDate = new Date(Date.now() - 1000);
      cache.set('expired', 'value', pastDate);
      expect(cache.has('expired')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should remove existing entry and return true', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('key1', 'value1', expiresAt);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should return false for non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('LRU trimming (_trim)', () => {
    it('should trim cache when maxSize is exceeded', () => {
      const expiresAt = new Date(Date.now() + 60000);

      // maxSize is 5, add 6 entries
      for (let i = 0; i < 6; i++) {
        cache.set(`key-${i}`, `value-${i}`, expiresAt);
      }

      expect(cache.size()).toBe(5);
    });

    it('should remove oldest entries first (LRU)', () => {
      const expiresAt = new Date(Date.now() + 60000);

      // Add entries with staggered creation times
      for (let i = 0; i < 6; i++) {
        cache.set(`key-${i}`, `value-${i}`, expiresAt);
      }

      // key-0 should have been trimmed (oldest)
      expect(cache.has('key-0')).toBe(false);
      // key-5 should still exist (newest)
      expect(cache.has('key-5')).toBe(true);
    });

    it('should log when entries are trimmed', () => {
      const expiresAt = new Date(Date.now() + 60000);

      for (let i = 0; i < 6; i++) {
        cache.set(`key-${i}`, `value-${i}`, expiresAt);
      }

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Trimmed'),
        expect.any(String)
      );
    });

    it('should not trim when cache is within maxSize', () => {
      vi.clearAllMocks();
      const expiresAt = new Date(Date.now() + 60000);

      for (let i = 0; i < 5; i++) {
        cache.set(`key-${i}`, `value-${i}`, expiresAt);
      }

      expect(cache.size()).toBe(5);
      expect(Logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Trimmed'),
        expect.any(String)
      );
    });

    it('should trim multiple entries if many are added at once', () => {
      const smallCache = new CacheManager({ name: 'small', maxSize: 2 });
      const expiresAt = new Date(Date.now() + 60000);

      // Add 5 entries to a cache with maxSize 2
      for (let i = 0; i < 5; i++) {
        smallCache.set(`key-${i}`, `value-${i}`, expiresAt);
      }

      expect(smallCache.size()).toBe(2);
    });
  });

  describe('static generateCacheKey', () => {
    it('should generate a cache key with default prefix', () => {
      const key = CacheManager.generateCacheKey('test input');
      expect(key).toMatch(/^cache_[0-9a-f]+$/);
    });

    it('should generate a cache key with custom prefix', () => {
      const key = CacheManager.generateCacheKey('test input', 'img');
      expect(key).toMatch(/^img_[0-9a-f]+$/);
    });

    it('should generate same key for same input', () => {
      const key1 = CacheManager.generateCacheKey('same input');
      const key2 = CacheManager.generateCacheKey('same input');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = CacheManager.generateCacheKey('input A');
      const key2 = CacheManager.generateCacheKey('input B');
      expect(key1).not.toBe(key2);
    });

    it('should handle empty string', () => {
      const key = CacheManager.generateCacheKey('');
      expect(key).toBe('cache_0');
    });

    it('should handle long strings', () => {
      const longInput = 'a'.repeat(10000);
      const key = CacheManager.generateCacheKey(longInput);
      expect(key).toMatch(/^cache_[0-9a-f]+$/);
    });

    it('should generate different keys for different prefixes', () => {
      const key1 = CacheManager.generateCacheKey('same', 'prefix1');
      const key2 = CacheManager.generateCacheKey('same', 'prefix2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('static blobToBase64', () => {
    it('should convert a blob to base64 string', async () => {
      // Create a simple text blob
      const blob = new Blob(['Hello, World!'], { type: 'text/plain' });
      const base64 = await CacheManager.blobToBase64(blob);

      // "Hello, World!" in base64 is "SGVsbG8sIFdvcmxkIQ=="
      expect(base64).toBe('SGVsbG8sIFdvcmxkIQ==');
    });

    it('should strip data URL prefix', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const base64 = await CacheManager.blobToBase64(blob);

      // Should not contain "data:" prefix
      expect(base64).not.toContain('data:');
      expect(base64).not.toContain(',');
    });

    it('should handle empty blob', async () => {
      const blob = new Blob([], { type: 'text/plain' });
      const base64 = await CacheManager.blobToBase64(blob);
      expect(typeof base64).toBe('string');
    });

    it('should reject on FileReader error', async () => {
      // Create a blob and mock FileReader to trigger error
      const originalFileReader = globalThis.FileReader;

      globalThis.FileReader = class {
        readAsDataURL() {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('Read failed'));
          }, 0);
        }
      };

      const blob = new Blob(['test']);
      await expect(CacheManager.blobToBase64(blob)).rejects.toThrow();

      globalThis.FileReader = originalFileReader;
    });
  });

  describe('edge cases', () => {
    it('should handle entry expiring exactly at current time', () => {
      // Boundary: entry that expires at "now"
      const now = new Date();
      cache.set('boundary', 'value', now);

      // get() checks: new Date() > entry.expiresAt
      // Since we just set it, new Date() may be slightly after now
      // This tests the boundary behavior
      const result = cache.get('boundary');
      // Either null (if time has advanced) or 'value' (if same ms)
      // The important thing is it doesn't throw
      expect(result === null || result === 'value').toBe(true);
    });

    it('should handle getting value with null check after cache set with null value', () => {
      const expiresAt = new Date(Date.now() + 60000);
      cache.set('nullValue', null, expiresAt);

      // get() returns entry.value, which is null
      // But null is also returned for "not found" - this is a known limitation
      // The get method returns null for both "not found" and "value is null"
      const result = cache.get('nullValue');
      expect(result).toBeNull();

      // Use has() to distinguish between "not found" and "null value"
      expect(cache.has('nullValue')).toBe(true);
    });

    it('should handle rapid set/get operations', () => {
      const expiresAt = new Date(Date.now() + 60000);
      for (let i = 0; i < 100; i++) {
        cache.set(`rapid-${i}`, `val-${i}`, expiresAt);
      }
      // maxSize is 5, so only last 5 should remain
      expect(cache.size()).toBe(5);
    });
  });
});
