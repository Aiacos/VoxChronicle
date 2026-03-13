import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from '../../scripts/utils/CacheManager.mjs';

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({ name: 'test-cache', maxSize: 5 });
  });

  // ── Helper ─────────────────────────────────────────────────────────────

  function futureDate(ms = 60000) {
    return new Date(Date.now() + ms);
  }

  function pastDate(ms = 60000) {
    return new Date(Date.now() - ms);
  }

  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should use provided name', () => {
      expect(cache._name).toBe('test-cache');
    });

    it('should default name to "cache"', () => {
      const c = new CacheManager();
      expect(c._name).toBe('cache');
    });

    it('should use provided maxSize', () => {
      expect(cache._maxSize).toBe(5);
    });

    it('should default maxSize to 100', () => {
      const c = new CacheManager();
      expect(c._maxSize).toBe(100);
    });

    it('should start with empty cache', () => {
      expect(cache.size()).toBe(0);
    });
  });

  // ── set / get ──────────────────────────────────────────────────────────

  describe('set() and get()', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1', futureDate());
      expect(cache.get('key1')).toBe('value1');
    });

    it('should store complex objects', () => {
      const obj = { name: 'test', data: [1, 2, 3] };
      cache.set('obj', obj, futureDate());
      expect(cache.get('obj')).toBe(obj);
    });

    it('should overwrite existing entries', () => {
      cache.set('k', 'old', futureDate());
      cache.set('k', 'new', futureDate());
      expect(cache.get('k')).toBe('new');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return null for expired entries', () => {
      cache.set('expired', 'data', pastDate());
      expect(cache.get('expired')).toBeNull();
    });

    it('should delete expired entries on get()', () => {
      cache.set('expired', 'data', pastDate());
      cache.get('expired');
      expect(cache.has('expired')).toBe(false);
    });

    it('should return expired value when checkExpiration is false', () => {
      cache.set('expired', 'data', pastDate());
      expect(cache.get('expired', false)).toBe('data');
    });

    it('should store metadata with entry', () => {
      cache.set('meta', 'val', futureDate(), { tag: 'important' });
      const entry = cache.getEntry('meta');
      expect(entry.metadata).toEqual({ tag: 'important' });
    });
  });

  // ── getEntry ───────────────────────────────────────────────────────────

  describe('getEntry()', () => {
    it('should return full cache entry', () => {
      const expires = futureDate();
      cache.set('k', 'v', expires, { source: 'test' });
      const entry = cache.getEntry('k');
      expect(entry.value).toBe('v');
      expect(entry.expiresAt).toBe(expires);
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.metadata).toEqual({ source: 'test' });
    });

    it('should return null for missing key', () => {
      expect(cache.getEntry('missing')).toBeNull();
    });
  });

  // ── getAll ─────────────────────────────────────────────────────────────

  describe('getAll()', () => {
    it('should return all values including expired', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, pastDate());
      const all = cache.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(1);
      expect(all).toContain(2);
    });

    it('should return empty array for empty cache', () => {
      expect(cache.getAll()).toEqual([]);
    });
  });

  // ── getAllEntries ──────────────────────────────────────────────────────

  describe('getAllEntries()', () => {
    it('should return all entries with metadata', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, pastDate());
      const entries = cache.getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveProperty('value');
      expect(entries[0]).toHaveProperty('createdAt');
      expect(entries[0]).toHaveProperty('expiresAt');
    });
  });

  // ── getValid ───────────────────────────────────────────────────────────

  describe('getValid()', () => {
    it('should return only non-expired values', () => {
      cache.set('valid', 'yes', futureDate());
      cache.set('expired', 'no', pastDate());
      const valid = cache.getValid();
      expect(valid).toEqual(['yes']);
    });

    it('should return empty array when all are expired', () => {
      cache.set('a', 1, pastDate());
      cache.set('b', 2, pastDate());
      expect(cache.getValid()).toEqual([]);
    });
  });

  // ── getValidEntries ────────────────────────────────────────────────────

  describe('getValidEntries()', () => {
    it('should return only non-expired entries', () => {
      cache.set('valid', 'yes', futureDate());
      cache.set('expired', 'no', pastDate());
      const entries = cache.getValidEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe('yes');
    });
  });

  // ── clearExpired ───────────────────────────────────────────────────────

  describe('clearExpired()', () => {
    it('should remove expired entries and return count', () => {
      cache.set('a', 1, pastDate());
      cache.set('b', 2, pastDate());
      cache.set('c', 3, futureDate());
      const removed = cache.clearExpired();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(1);
      expect(cache.get('c')).toBe(3);
    });

    it('should return 0 when nothing is expired', () => {
      cache.set('a', 1, futureDate());
      expect(cache.clearExpired()).toBe(0);
    });

    it('should return 0 for empty cache', () => {
      expect(cache.clearExpired()).toBe(0);
    });
  });

  // ── clear ──────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('should empty the cache', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, futureDate());
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  // ── size ───────────────────────────────────────────────────────────────

  describe('size()', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });

    it('should return correct count after inserts', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, futureDate());
      expect(cache.size()).toBe(2);
    });
  });

  // ── has ────────────────────────────────────────────────────────────────

  describe('has()', () => {
    it('should return true for existing key', () => {
      cache.set('exists', 'val', futureDate());
      expect(cache.has('exists')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(cache.has('nope')).toBe(false);
    });

    it('should return true even for expired entries (no expiry check)', () => {
      cache.set('expired', 'val', pastDate());
      expect(cache.has('expired')).toBe(true);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should remove an existing entry and return true', () => {
      cache.set('del', 'val', futureDate());
      expect(cache.delete('del')).toBe(true);
      expect(cache.has('del')).toBe(false);
    });

    it('should return false for non-existing key', () => {
      expect(cache.delete('nope')).toBe(false);
    });
  });

  // ── _trim (LRU) ───────────────────────────────────────────────────────

  describe('_trim()', () => {
    it('should trim oldest entries when maxSize is exceeded', () => {
      // maxSize is 5; add 6 entries
      for (let i = 0; i < 6; i++) {
        cache.set(`key${i}`, `val${i}`, futureDate());
      }
      expect(cache.size()).toBe(5);
      // The first entry (oldest by createdAt) should have been removed
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key5')).toBe(true);
    });

    it('should not trim when within maxSize', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, futureDate());
      expect(cache.size()).toBe(2);
    });

    it('should trim multiple entries when many are added at once', () => {
      const bigCache = new CacheManager({ maxSize: 3 });
      for (let i = 0; i < 10; i++) {
        bigCache.set(`k${i}`, i, futureDate());
      }
      expect(bigCache.size()).toBe(3);
    });

    it('should evict least recently used entry, not oldest created (true LRU)', () => {
      // maxSize is 5, add 5 entries with distinct lastAccessedAt timestamps
      cache.set('key0', 'val0', futureDate());
      cache.set('key1', 'val1', futureDate());
      cache.set('key2', 'val2', futureDate());
      cache.set('key3', 'val3', futureDate());
      cache.set('key4', 'val4', futureDate());

      // Manually set lastAccessedAt to ensure deterministic ordering
      // key1 has the oldest lastAccessedAt (should be evicted first)
      cache.getEntry('key0').lastAccessedAt = 100;
      cache.getEntry('key1').lastAccessedAt = 1;   // least recently used
      cache.getEntry('key2').lastAccessedAt = 50;
      cache.getEntry('key3').lastAccessedAt = 75;
      cache.getEntry('key4').lastAccessedAt = 90;

      // Add a 6th entry to trigger trimming
      cache.set('key5', 'val5', futureDate());

      expect(cache.size()).toBe(5);
      // key1 had the smallest lastAccessedAt, so it should be evicted
      expect(cache.has('key1')).toBe(false);
      // key0 was recently used, so it should survive
      expect(cache.has('key0')).toBe(true);
      // key5 (newest) should exist
      expect(cache.has('key5')).toBe(true);
    });

    it('should update lastAccessedAt on get()', () => {
      cache.set('lru-test', 'value', futureDate());
      const entryBefore = cache.getEntry('lru-test');
      const accessTimeBefore = entryBefore.lastAccessedAt;

      // Small delay to ensure timestamp differs
      const start = Date.now();
      while (Date.now() === start) { /* spin */ }

      cache.get('lru-test');
      const entryAfter = cache.getEntry('lru-test');
      expect(entryAfter.lastAccessedAt).toBeGreaterThanOrEqual(accessTimeBefore);
    });

    it('should include lastAccessedAt in cache entries', () => {
      cache.set('meta-test', 'value', futureDate());
      const entry = cache.getEntry('meta-test');
      expect(entry.lastAccessedAt).toBeDefined();
      expect(typeof entry.lastAccessedAt).toBe('number');
    });
  });

  // ── setWithTTL (Story 2.3) ──────────────────────────────────────────────

  describe('setWithTTL()', () => {
    it('should store value with TTL in milliseconds', () => {
      cache.setWithTTL('ttl-key', 'val', 60000);
      expect(cache.get('ttl-key')).toBe('val');
    });

    it('should expire after TTL', () => {
      vi.useFakeTimers();
      cache.setWithTTL('ttl-key', 'val', 100);
      expect(cache.get('ttl-key')).toBe('val');
      vi.advanceTimersByTime(150);
      expect(cache.get('ttl-key')).toBeNull();
      vi.useRealTimers();
    });

    it('should accept metadata', () => {
      cache.setWithTTL('ttl-meta', 'val', 60000, { tag: 'test' });
      const entry = cache.getEntry('ttl-meta');
      expect(entry.metadata).toEqual({ tag: 'test' });
    });

    it('should set correct expiresAt timestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      cache.setWithTTL('ttl-ts', 'val', 5000);
      const entry = cache.getEntry('ttl-ts');
      expect(entry.expiresAt.getTime()).toBe(now + 5000);
      vi.useRealTimers();
    });
  });

  // ── invalidatePrefix (Story 2.3) ──────────────────────────────────────

  describe('invalidatePrefix()', () => {
    it('should remove all entries with matching prefix', () => {
      cache.set('narrator:suggestion:combat', 'a', futureDate());
      cache.set('narrator:suggestion:social', 'b', futureDate());
      cache.set('narrator:rules:query1', 'c', futureDate());
      const removed = cache.invalidatePrefix('narrator:suggestion:');
      expect(removed).toBe(2);
      expect(cache.has('narrator:suggestion:combat')).toBe(false);
      expect(cache.has('narrator:suggestion:social')).toBe(false);
      expect(cache.has('narrator:rules:query1')).toBe(true);
    });

    it('should return 0 when no keys match', () => {
      cache.set('other:key', 'val', futureDate());
      expect(cache.invalidatePrefix('narrator:')).toBe(0);
    });

    it('should handle empty cache', () => {
      expect(cache.invalidatePrefix('any:')).toBe(0);
    });

    it('should handle empty prefix (removes all)', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, futureDate());
      expect(cache.invalidatePrefix('')).toBe(2);
      expect(cache.size()).toBe(0);
    });

    it('should complete in <10ms for 100 entries', () => {
      const bigCache = new CacheManager({ maxSize: 200 });
      for (let i = 0; i < 100; i++) {
        bigCache.set(`prefix:${i}`, i, futureDate());
      }
      const start = performance.now();
      bigCache.invalidatePrefix('prefix:');
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  // ── stats (Story 2.3) ─────────────────────────────────────────────────

  describe('stats', () => {
    it('should start with zero hits and misses', () => {
      const s = cache.stats;
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
      expect(s.hitRate).toBe(0);
      expect(s.size).toBe(0);
    });

    it('should count hits on successful get()', () => {
      cache.set('k', 'v', futureDate());
      cache.get('k');
      cache.get('k');
      expect(cache.stats.hits).toBe(2);
      expect(cache.stats.misses).toBe(0);
    });

    it('should count misses on failed get()', () => {
      cache.get('missing');
      expect(cache.stats.misses).toBe(1);
      expect(cache.stats.hits).toBe(0);
    });

    it('should count miss on expired entry', () => {
      cache.set('exp', 'v', pastDate());
      cache.get('exp');
      expect(cache.stats.misses).toBe(1);
    });

    it('should calculate hitRate correctly', () => {
      cache.set('k', 'v', futureDate());
      cache.get('k');       // hit
      cache.get('k');       // hit
      cache.get('missing'); // miss
      const s = cache.stats;
      expect(s.hitRate).toBeCloseTo(66.67, 0);
    });

    it('should include current size', () => {
      cache.set('a', 1, futureDate());
      cache.set('b', 2, futureDate());
      expect(cache.stats.size).toBe(2);
    });
  });

  // ── static generateCacheKey ────────────────────────────────────────────

  describe('generateCacheKey()', () => {
    it('should produce deterministic keys for same input', () => {
      const key1 = CacheManager.generateCacheKey('hello');
      const key2 = CacheManager.generateCacheKey('hello');
      expect(key1).toBe(key2);
    });

    it('should produce different keys for different inputs', () => {
      const key1 = CacheManager.generateCacheKey('hello');
      const key2 = CacheManager.generateCacheKey('world');
      expect(key1).not.toBe(key2);
    });

    it('should use default prefix "cache"', () => {
      const key = CacheManager.generateCacheKey('test');
      expect(key).toMatch(/^cache_/);
    });

    it('should use custom prefix', () => {
      const key = CacheManager.generateCacheKey('test', 'image');
      expect(key).toMatch(/^image_/);
    });

    it('should produce a hex hash suffix', () => {
      const key = CacheManager.generateCacheKey('test');
      const suffix = key.split('_')[1];
      expect(suffix).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle empty string input', () => {
      const key = CacheManager.generateCacheKey('');
      expect(key).toMatch(/^cache_/);
    });
  });

  // ── static blobToBase64 ────────────────────────────────────────────────

  describe('blobToBase64()', () => {
    it('should convert a blob to base64 string', async () => {
      const blob = new Blob(['hello world'], { type: 'text/plain' });
      const result = await CacheManager.blobToBase64(blob);
      // The data URL prefix should be stripped — only the base64 part remains
      expect(typeof result).toBe('string');
      expect(result).not.toContain('data:');
    });

    it('should return valid base64 content', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const base64 = await CacheManager.blobToBase64(blob);
      // Decode it back to verify
      const decoded = atob(base64);
      expect(decoded).toBe('test');
    });

    it('should handle binary blob data', async () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 255]);
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const base64 = await CacheManager.blobToBase64(blob);
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });
  });
});
