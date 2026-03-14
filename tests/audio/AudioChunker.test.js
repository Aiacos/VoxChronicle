import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioChunker, MAX_CHUNK_SIZE, MIN_CHUNK_SIZE } from '../../scripts/audio/AudioChunker.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a Blob of a specific size (filled with zeroes).
 * @param {number} sizeBytes
 * @param {string} [type='audio/webm']
 * @returns {Blob}
 */
function makeBlob(sizeBytes, type = 'audio/webm') {
  const buffer = new ArrayBuffer(sizeBytes);
  return new Blob([buffer], { type });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('AudioChunker', () => {
  let chunker;

  beforeEach(() => {
    chunker = new AudioChunker();
  });

  // ── Exports ────────────────────────────────────────────────────────────

  describe('Exports', () => {
    it('should export MAX_CHUNK_SIZE as 24MB (25MB minus 1MB margin)', () => {
      const expected = 25 * 1024 * 1024 - 1024 * 1024; // 24MB
      expect(MAX_CHUNK_SIZE).toBe(expected);
    });

    it('should export MIN_CHUNK_SIZE as 1MB', () => {
      expect(MIN_CHUNK_SIZE).toBe(1024 * 1024);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create an instance with default maxChunkSize', () => {
      expect(chunker.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });

    it('should accept a custom maxChunkSize option', () => {
      const custom = new AudioChunker({ maxChunkSize: 5 * 1024 * 1024 });
      expect(custom.maxChunkSize).toBe(5 * 1024 * 1024);
    });

    it('should cap custom maxChunkSize to MAX_CHUNK_SIZE', () => {
      const huge = new AudioChunker({ maxChunkSize: 100 * 1024 * 1024 });
      expect(huge.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });

    it('should ignore zero maxChunkSize (falsy) and use default', () => {
      const zero = new AudioChunker({ maxChunkSize: 0 });
      expect(zero.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });
  });

  // ── maxChunkSize / maxChunkSizeMB getters ──────────────────────────────

  describe('maxChunkSize getter', () => {
    it('should return the configured max chunk size in bytes', () => {
      expect(chunker.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });
  });

  describe('maxChunkSizeMB getter', () => {
    it('should return the configured max chunk size in megabytes', () => {
      const mb = MAX_CHUNK_SIZE / (1024 * 1024);
      expect(chunker.maxChunkSizeMB).toBeCloseTo(mb, 1);
    });
  });

  // ── needsChunking ──────────────────────────────────────────────────────

  describe('needsChunking()', () => {
    it('should return false for a blob smaller than the limit', () => {
      const blob = makeBlob(1024);
      expect(chunker.needsChunking(blob)).toBe(false);
    });

    it('should return false for a blob exactly at the limit', () => {
      const blob = makeBlob(MAX_CHUNK_SIZE);
      expect(chunker.needsChunking(blob)).toBe(false);
    });

    it('should return true for a blob larger than the limit', () => {
      const blob = makeBlob(MAX_CHUNK_SIZE + 1);
      expect(chunker.needsChunking(blob)).toBe(true);
    });
  });

  // ── getEstimatedChunkCount ─────────────────────────────────────────────

  describe('getEstimatedChunkCount()', () => {
    it('should return 1 for a blob within the limit', () => {
      const blob = makeBlob(1000);
      expect(chunker.getEstimatedChunkCount(blob)).toBe(1);
    });

    it('should return correct count for a blob exactly 2x the limit', () => {
      const blob = makeBlob(MAX_CHUNK_SIZE * 2);
      expect(chunker.getEstimatedChunkCount(blob)).toBe(2);
    });

    it('should round up for partial chunks', () => {
      const blob = makeBlob(MAX_CHUNK_SIZE * 2 + 1);
      expect(chunker.getEstimatedChunkCount(blob)).toBe(3);
    });
  });

  // ── splitIfNeeded ──────────────────────────────────────────────────────

  describe('splitIfNeeded()', () => {
    it('should return the original blob in an array when under limit', async () => {
      const blob = makeBlob(1024);
      const result = await chunker.splitIfNeeded(blob);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(blob); // same reference
    });

    it('should split a blob that exceeds the limit', async () => {
      const size = MAX_CHUNK_SIZE * 2 + 1024 * 1024 * 2; // ~50MB
      const blob = makeBlob(size);
      const result = await chunker.splitIfNeeded(blob);
      expect(result.length).toBeGreaterThan(1);
      // Every chunk should be within the limit (plus possible tiny-remainder merging)
      for (const chunk of result) {
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE + MIN_CHUNK_SIZE);
      }
    });

    it('should throw for null input', async () => {
      await expect(chunker.splitIfNeeded(null)).rejects.toThrow('Invalid audio blob');
    });

    it('should throw for undefined input', async () => {
      await expect(chunker.splitIfNeeded(undefined)).rejects.toThrow('Invalid audio blob');
    });

    it('should throw for non-Blob input', async () => {
      await expect(chunker.splitIfNeeded('not a blob')).rejects.toThrow('Invalid audio blob');
    });
  });

  // ── split ──────────────────────────────────────────────────────────────

  describe('split()', () => {
    it('should throw for null input', async () => {
      await expect(chunker.split(null)).rejects.toThrow('Invalid audio blob');
    });

    it('should throw for non-Blob input', async () => {
      await expect(chunker.split(42)).rejects.toThrow('Invalid audio blob');
    });

    it('should return a single chunk for a blob within the limit', async () => {
      const blob = makeBlob(1024, 'audio/ogg');
      const chunks = await chunker.split(blob);
      expect(chunks).toHaveLength(1);
      // The chunk is a sliced blob, so size should match
      expect(chunks[0].size).toBe(1024);
    });

    it('should split a large blob into correct number of chunks', async () => {
      const size = MAX_CHUNK_SIZE * 3;
      const blob = makeBlob(size);
      const chunks = await chunker.split(blob);
      expect(chunks).toHaveLength(3);
      for (const chunk of chunks) {
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      }
    });

    it('should merge a tiny final remainder into the previous chunk', async () => {
      // Total = 2 * MAX + a small tail below MIN_CHUNK_SIZE
      const tail = MIN_CHUNK_SIZE - 1; // just under 1MB
      const size = MAX_CHUNK_SIZE * 2 + tail;
      const blob = makeBlob(size);
      const chunks = await chunker.split(blob);

      // Without merging we'd get 3 chunks, but the tiny tail is merged into chunk 2
      expect(chunks).toHaveLength(2);
      // The last chunk should be larger than MAX_CHUNK_SIZE (it absorbed the tail)
      expect(chunks[1].size).toBeGreaterThan(MAX_CHUNK_SIZE);
    });

    it('should not merge the remainder when it exceeds MIN_CHUNK_SIZE', async () => {
      const tail = MIN_CHUNK_SIZE + 1;
      const size = MAX_CHUNK_SIZE * 2 + tail;
      const blob = makeBlob(size);
      const chunks = await chunker.split(blob);
      // Should be 3 chunks - the tail is big enough to stand alone
      expect(chunks).toHaveLength(3);
    });

    it('should preserve the MIME type on all chunks', async () => {
      const blob = makeBlob(MAX_CHUNK_SIZE * 2, 'audio/ogg;codecs=opus');
      const chunks = await chunker.split(blob);
      for (const chunk of chunks) {
        expect(chunk.type).toBe('audio/ogg;codecs=opus');
      }
    });

    it('should produce chunks whose total size equals the original', async () => {
      const size = MAX_CHUNK_SIZE * 3 + 5 * 1024 * 1024;
      const blob = makeBlob(size);
      const chunks = await chunker.split(blob);
      const totalChunkSize = chunks.reduce((sum, c) => sum + c.size, 0);
      expect(totalChunkSize).toBe(size);
    });

    it('should handle an empty blob (0 bytes) returning an empty array', async () => {
      const blob = makeBlob(0);
      const chunks = await chunker.split(blob);
      // The while loop never enters since totalSize = 0
      expect(chunks).toHaveLength(0);
    });
  });

  // ── splitFromChunks ────────────────────────────────────────────────────

  describe('splitFromChunks()', () => {
    it('should throw for empty array', async () => {
      await expect(chunker.splitFromChunks([], 'audio/webm')).rejects.toThrow(
        'Invalid recording chunks'
      );
    });

    it('should throw for null', async () => {
      await expect(chunker.splitFromChunks(null, 'audio/webm')).rejects.toThrow(
        'Invalid recording chunks'
      );
    });

    it('should keep small chunks in a single group', async () => {
      const chunks = [makeBlob(1024), makeBlob(2048), makeBlob(512)];
      const result = await chunker.splitFromChunks(chunks, 'audio/webm');
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(1024 + 2048 + 512);
    });

    it('should split into multiple groups when total exceeds limit', async () => {
      const halfMax = Math.floor(MAX_CHUNK_SIZE / 2);
      const chunks = [makeBlob(halfMax), makeBlob(halfMax), makeBlob(halfMax)];
      const result = await chunker.splitFromChunks(chunks, 'audio/webm');
      expect(result).toHaveLength(2);
    });

    it('should preserve MIME type in grouped blobs', async () => {
      const chunks = [makeBlob(1024, 'audio/ogg')];
      const result = await chunker.splitFromChunks(chunks, 'audio/mp4');
      expect(result[0].type).toBe('audio/mp4');
    });

    it('should handle a single oversized chunk', async () => {
      // A single chunk larger than MAX_CHUNK_SIZE: it goes into its own group
      const chunks = [makeBlob(MAX_CHUNK_SIZE + 100)];
      const result = await chunker.splitFromChunks(chunks, 'audio/webm');
      // The chunk alone exceeds the limit, but since currentGroup starts empty
      // it gets added then flushed as the final group
      expect(result).toHaveLength(1);
    });
  });

  // ── calculateChunkSizes ────────────────────────────────────────────────

  describe('calculateChunkSizes()', () => {
    it('should return [totalSize] when under the limit', () => {
      expect(chunker.calculateChunkSizes(1000)).toEqual([1000]);
    });

    it('should return [totalSize] when exactly at the limit', () => {
      expect(chunker.calculateChunkSizes(MAX_CHUNK_SIZE)).toEqual([MAX_CHUNK_SIZE]);
    });

    it('should return evenly distributed sizes for exact multiple', () => {
      const sizes = chunker.calculateChunkSizes(MAX_CHUNK_SIZE * 3);
      expect(sizes).toHaveLength(3);
      for (const s of sizes) {
        expect(s).toBe(MAX_CHUNK_SIZE);
      }
    });

    it('should distribute remainder across first chunks', () => {
      const total = MAX_CHUNK_SIZE * 2 + 3;
      const sizes = chunker.calculateChunkSizes(total);
      expect(sizes).toHaveLength(3);
      const sum = sizes.reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
      // The first chunks should be 1 byte larger
      expect(sizes[0]).toBeGreaterThanOrEqual(sizes[2]);
    });
  });

  // ── getChunkingInfo ────────────────────────────────────────────────────

  describe('getChunkingInfo()', () => {
    it('should return correct info for a small blob', () => {
      const blob = makeBlob(1024, 'audio/webm');
      const info = chunker.getChunkingInfo(blob);

      expect(info.totalSize).toBe(1024);
      expect(info.needsChunking).toBe(false);
      expect(info.estimatedChunkCount).toBe(1);
      expect(info.maxChunkSize).toBe(MAX_CHUNK_SIZE);
      expect(info.chunkSizes).toEqual([1024]);
      expect(info.mimeType).toBe('audio/webm');
      expect(typeof info.totalSizeMB).toBe('number');
      expect(typeof info.maxChunkSizeMB).toBe('number');
      expect(typeof info.estimatedDuration).toBe('number');
    });

    it('should return correct info for a large blob', () => {
      const size = MAX_CHUNK_SIZE * 2 + 100;
      const blob = makeBlob(size, 'audio/ogg');
      const info = chunker.getChunkingInfo(blob);

      expect(info.totalSize).toBe(size);
      expect(info.needsChunking).toBe(true);
      expect(info.estimatedChunkCount).toBe(3);
      expect(info.mimeType).toBe('audio/ogg');
    });
  });

  // ── splitWithOverlap ───────────────────────────────────────────────────

  describe('splitWithOverlap()', () => {
    it('should throw for null input', async () => {
      await expect(chunker.splitWithOverlap(null)).rejects.toThrow('Invalid audio blob');
    });

    it('should throw for non-Blob input', async () => {
      await expect(chunker.splitWithOverlap('nope')).rejects.toThrow('Invalid audio blob');
    });

    it('should throw for negative overlap', async () => {
      const blob = makeBlob(1024);
      await expect(chunker.splitWithOverlap(blob, -1)).rejects.toThrow(
        'Overlap bytes must be non-negative'
      );
    });

    it('should throw when overlap is too large for chunk size', async () => {
      const blob = makeBlob(MAX_CHUNK_SIZE * 2);
      // Overlap so large that effectiveChunkSize < MIN_CHUNK_SIZE
      const hugeOverlap = MAX_CHUNK_SIZE - MIN_CHUNK_SIZE + 1;
      await expect(chunker.splitWithOverlap(blob, hugeOverlap)).rejects.toThrow(
        'Overlap too large'
      );
    });

    it('should return the original blob when under the limit', async () => {
      const blob = makeBlob(1024);
      const result = await chunker.splitWithOverlap(blob, 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(blob);
    });

    it('should produce overlapping chunks with zero overlap (same as split)', async () => {
      const size = MAX_CHUNK_SIZE * 2 + MIN_CHUNK_SIZE * 2;
      const blob = makeBlob(size);
      const chunks = await chunker.splitWithOverlap(blob, 0);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should produce more chunks with overlap than without', async () => {
      const size = MAX_CHUNK_SIZE * 3;
      const blob = makeBlob(size);
      const overlapBytes = 1024 * 1024; // 1MB overlap

      const withoutOverlap = await chunker.splitWithOverlap(blob, 0);
      const withOverlap = await chunker.splitWithOverlap(blob, overlapBytes);

      expect(withOverlap.length).toBeGreaterThanOrEqual(withoutOverlap.length);
    });

    it('should preserve MIME type on overlapping chunks', async () => {
      const blob = makeBlob(MAX_CHUNK_SIZE * 2, 'audio/mp4');
      const chunks = await chunker.splitWithOverlap(blob, 512 * 1024);
      for (const chunk of chunks) {
        expect(chunk.type).toBe('audio/mp4');
      }
    });
  });

  // ── _combineBlobs (indirectly tested) ──────────────────────────────────

  describe('_combineBlobs()', () => {
    it('should combine multiple blobs with correct type', async () => {
      // Access private method for direct testing
      const result = await chunker._combineBlobs([makeBlob(100), makeBlob(200)], 'audio/ogg');
      expect(result.size).toBe(300);
      expect(result.type).toBe('audio/ogg');
    });
  });

  // ── Custom maxChunkSize behaviour ──────────────────────────────────────

  describe('with custom maxChunkSize', () => {
    it('should split according to a smaller custom limit', async () => {
      const smallChunker = new AudioChunker({ maxChunkSize: 2 * 1024 * 1024 }); // 2MB
      const blob = makeBlob(5 * 1024 * 1024); // 5MB
      expect(smallChunker.needsChunking(blob)).toBe(true);
      const chunks = await smallChunker.split(blob);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── EventBus integration ──────────────────────────────────────────────
  describe('EventBus integration', () => {
    let eventBus;

    beforeEach(() => {
      eventBus = { emit: vi.fn() };
    });

    it('accepts eventBus in constructor options', () => {
      const chunker = new AudioChunker({ eventBus });
      expect(chunker._eventBus).toBe(eventBus);
    });

    it('works without eventBus (optional)', () => {
      const chunker = new AudioChunker();
      expect(chunker._eventBus).toBeNull();
    });

    it('emits audio:chunkingStarted when split begins', async () => {
      const chunker = new AudioChunker({ eventBus });
      const blob = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE + 1024)], { type: 'audio/webm' });
      await chunker.split(blob);
      expect(eventBus.emit).toHaveBeenCalledWith(
        'audio:chunkingStarted',
        expect.objectContaining({ totalSize: blob.size })
      );
    });

    it('emits audio:chunkCreated for each chunk produced', async () => {
      const chunker = new AudioChunker({ eventBus });
      // Use 2x max size to ensure at least 2 chunks (small remainder gets merged)
      const blob = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE * 2)], { type: 'audio/webm' });
      await chunker.split(blob);
      const chunkEvents = eventBus.emit.mock.calls.filter((c) => c[0] === 'audio:chunkCreated');
      expect(chunkEvents.length).toBeGreaterThanOrEqual(2);
      expect(chunkEvents[0][1]).toEqual(expect.objectContaining({ index: 0 }));
    });

    it('emits audio:chunkingComplete when split finishes', async () => {
      const chunker = new AudioChunker({ eventBus });
      const blob = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE + 1024)], { type: 'audio/webm' });
      await chunker.split(blob);
      expect(eventBus.emit).toHaveBeenCalledWith(
        'audio:chunkingComplete',
        expect.objectContaining({ chunkCount: expect.any(Number) })
      );
    });

    it('emits events during splitFromChunks too', async () => {
      const chunker = new AudioChunker({ eventBus });
      const chunk1 = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE - 1024)], { type: 'audio/webm' });
      const chunk2 = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE - 1024)], { type: 'audio/webm' });
      await chunker.splitFromChunks([chunk1, chunk2], 'audio/webm');
      expect(eventBus.emit).toHaveBeenCalledWith('audio:chunkingStarted', expect.any(Object));
      expect(eventBus.emit).toHaveBeenCalledWith('audio:chunkingComplete', expect.any(Object));
    });

    it('does not throw when eventBus.emit throws', async () => {
      eventBus.emit = vi.fn(() => {
        throw new Error('bus broken');
      });
      const chunker = new AudioChunker({ eventBus });
      const blob = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE + 1024)], { type: 'audio/webm' });
      // Should not throw despite eventBus failure
      await expect(chunker.split(blob)).resolves.toBeDefined();
    });

    it('does not emit events when no eventBus provided', async () => {
      const chunker = new AudioChunker();
      const blob = new Blob([new ArrayBuffer(MAX_CHUNK_SIZE + 1024)], { type: 'audio/webm' });
      // Should not throw
      await expect(chunker.split(blob)).resolves.toBeDefined();
    });
  });
});
