/**
 * AudioChunker Unit Tests
 *
 * Tests for the AudioChunker class that splits large audio files
 * into chunks that comply with OpenAI's 25MB file size limit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing AudioChunker
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock AudioUtils
vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    getBlobSizeMB: vi.fn((blob) => Math.round((blob.size / (1024 * 1024)) * 100) / 100),
    estimateDuration: vi.fn((blob) => Math.round(blob.size / 16000))
  },
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import { AudioChunker, MAX_CHUNK_SIZE, MIN_CHUNK_SIZE } from '../../scripts/audio/AudioChunker.mjs';
import { AudioUtils } from '../../scripts/utils/AudioUtils.mjs';

/**
 * Create a mock audio blob for testing
 */
function createMockAudioBlob(size = 1024, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type });
}

describe('AudioChunker', () => {
  let chunker;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create chunker instance
    chunker = new AudioChunker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constants', () => {
    it('should export MAX_CHUNK_SIZE constant', () => {
      expect(MAX_CHUNK_SIZE).toBe(24 * 1024 * 1024); // 24MB
    });

    it('should export MIN_CHUNK_SIZE constant', () => {
      expect(MIN_CHUNK_SIZE).toBe(1024 * 1024); // 1MB
    });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(chunker).toBeInstanceOf(AudioChunker);
      expect(chunker.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });

    it('should accept custom maxChunkSize option', () => {
      const customSize = 10 * 1024 * 1024; // 10MB
      const customChunker = new AudioChunker({ maxChunkSize: customSize });
      expect(customChunker.maxChunkSize).toBe(customSize);
    });

    it('should not exceed MAX_CHUNK_SIZE even with larger custom size', () => {
      const tooLarge = 50 * 1024 * 1024; // 50MB (larger than MAX_CHUNK_SIZE)
      const limitedChunker = new AudioChunker({ maxChunkSize: tooLarge });
      expect(limitedChunker.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });
  });

  describe('needsChunking', () => {
    it('should return false for small blobs', () => {
      const smallBlob = createMockAudioBlob(1024); // 1KB
      expect(chunker.needsChunking(smallBlob)).toBe(false);
    });

    it('should return false for blobs at the size limit', () => {
      const limitBlob = createMockAudioBlob(MAX_CHUNK_SIZE);
      expect(chunker.needsChunking(limitBlob)).toBe(false);
    });

    it('should return true for blobs exceeding the size limit', () => {
      const largeBlob = createMockAudioBlob(MAX_CHUNK_SIZE + 1);
      expect(chunker.needsChunking(largeBlob)).toBe(true);
    });

    it('should return true for very large blobs', () => {
      const veryLargeBlob = createMockAudioBlob(100 * 1024 * 1024); // 100MB
      expect(chunker.needsChunking(veryLargeBlob)).toBe(true);
    });
  });

  describe('getEstimatedChunkCount', () => {
    it('should return 1 for small blobs', () => {
      const smallBlob = createMockAudioBlob(1024);
      expect(chunker.getEstimatedChunkCount(smallBlob)).toBe(1);
    });

    it('should return 1 for blobs at the size limit', () => {
      const limitBlob = createMockAudioBlob(MAX_CHUNK_SIZE);
      expect(chunker.getEstimatedChunkCount(limitBlob)).toBe(1);
    });

    it('should return 2 for blobs slightly over the limit', () => {
      const blob = createMockAudioBlob(MAX_CHUNK_SIZE + 1);
      expect(chunker.getEstimatedChunkCount(blob)).toBe(2);
    });

    it('should return correct count for large blobs', () => {
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024); // 50MB
      const expectedChunks = Math.ceil(50 / 24); // ~3 chunks
      expect(chunker.getEstimatedChunkCount(largeBlob)).toBe(expectedChunks);
    });

    it('should return correct count for exact multiples', () => {
      const blob = createMockAudioBlob(MAX_CHUNK_SIZE * 3);
      expect(chunker.getEstimatedChunkCount(blob)).toBe(3);
    });
  });

  describe('splitIfNeeded', () => {
    it('should return original blob in array when no chunking needed', async () => {
      const smallBlob = createMockAudioBlob(1024);
      const result = await chunker.splitIfNeeded(smallBlob);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(smallBlob);
    });

    it('should split large blobs into chunks', async () => {
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024); // 50MB
      const result = await chunker.splitIfNeeded(largeBlob);

      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBe(chunker.getEstimatedChunkCount(largeBlob));
    });

    it('should throw error for null input', async () => {
      await expect(chunker.splitIfNeeded(null)).rejects.toThrow('Invalid audio blob provided');
    });

    it('should throw error for undefined input', async () => {
      await expect(chunker.splitIfNeeded(undefined)).rejects.toThrow('Invalid audio blob provided');
    });

    it('should throw error for non-Blob input', async () => {
      await expect(chunker.splitIfNeeded('not-a-blob')).rejects.toThrow('Invalid audio blob provided');
      await expect(chunker.splitIfNeeded({})).rejects.toThrow('Invalid audio blob provided');
      await expect(chunker.splitIfNeeded(123)).rejects.toThrow('Invalid audio blob provided');
    });
  });

  describe('split', () => {
    it('should throw error for invalid input', async () => {
      await expect(chunker.split(null)).rejects.toThrow('Invalid audio blob provided');
      await expect(chunker.split('not-a-blob')).rejects.toThrow('Invalid audio blob provided');
    });

    it('should split blob into correct number of chunks', async () => {
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024); // 50MB
      const chunks = await chunker.split(largeBlob);

      const expectedCount = Math.ceil(50 * 1024 * 1024 / MAX_CHUNK_SIZE);
      expect(chunks).toHaveLength(expectedCount);
    });

    it('should preserve MIME type in chunks', async () => {
      const mimeType = 'audio/webm';
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024, mimeType);
      const chunks = await chunker.split(largeBlob);

      chunks.forEach(chunk => {
        expect(chunk.type).toBe(mimeType);
      });
    });

    it('should create chunks within size limit', async () => {
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024);
      const chunks = await chunker.split(largeBlob);

      chunks.forEach(chunk => {
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      });
    });

    it('should handle small blob without splitting', async () => {
      const smallBlob = createMockAudioBlob(1024);
      const chunks = await chunker.split(smallBlob);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].size).toBe(1024);
    });

    it('should combine tiny final chunks with previous chunk', async () => {
      // Create a blob that would leave a very small remainder
      const size = MAX_CHUNK_SIZE + (MIN_CHUNK_SIZE / 2); // 24MB + 512KB
      const blob = createMockAudioBlob(size);
      const chunks = await chunker.split(blob);

      // Should combine the small remainder with the first chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0].size).toBe(size);
    });

    it('should split evenly for exact multiples', async () => {
      const size = MAX_CHUNK_SIZE * 2;
      const blob = createMockAudioBlob(size);
      const chunks = await chunker.split(blob);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].size).toBe(MAX_CHUNK_SIZE);
      expect(chunks[1].size).toBe(MAX_CHUNK_SIZE);
    });

    it('should handle blob slightly over limit', async () => {
      const size = MAX_CHUNK_SIZE + (2 * 1024 * 1024); // 24MB + 2MB
      const blob = createMockAudioBlob(size);
      const chunks = await chunker.split(blob);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].size).toBe(MAX_CHUNK_SIZE);
      expect(chunks[1].size).toBe(2 * 1024 * 1024);
    });

    it('should accumulate to total size', async () => {
      const totalSize = 75 * 1024 * 1024; // 75MB
      const blob = createMockAudioBlob(totalSize);
      const chunks = await chunker.split(blob);

      const sumSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      expect(sumSize).toBe(totalSize);
    });
  });

  describe('splitFromChunks', () => {
    it('should throw error for invalid input', async () => {
      await expect(chunker.splitFromChunks(null, 'audio/webm')).rejects.toThrow('Invalid recording chunks array');
      await expect(chunker.splitFromChunks([], 'audio/webm')).rejects.toThrow('Invalid recording chunks array');
      await expect(chunker.splitFromChunks('not-array', 'audio/webm')).rejects.toThrow('Invalid recording chunks array');
    });

    it('should group small chunks together', async () => {
      // Create 10 small chunks
      const smallChunks = Array.from({ length: 10 }, () => createMockAudioBlob(1024 * 1024)); // 1MB each
      const result = await chunker.splitFromChunks(smallChunks, 'audio/webm');

      // Should be grouped into a single blob
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(10 * 1024 * 1024);
    });

    it('should split when chunks exceed limit', async () => {
      // Create chunks that would exceed limit when combined
      const largeChunks = Array.from({ length: 5 }, () => createMockAudioBlob(10 * 1024 * 1024)); // 10MB each
      const result = await chunker.splitFromChunks(largeChunks, 'audio/webm');

      // 50MB total should split into at least 2 groups
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect chunk boundaries', async () => {
      // Create chunks at natural boundaries (like recording chunks)
      const chunks = [
        createMockAudioBlob(5 * 1024 * 1024),  // 5MB
        createMockAudioBlob(10 * 1024 * 1024), // 10MB
        createMockAudioBlob(8 * 1024 * 1024),  // 8MB
        createMockAudioBlob(12 * 1024 * 1024), // 12MB
      ];
      const result = await chunker.splitFromChunks(chunks, 'audio/webm');

      // Should group intelligently at chunk boundaries
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(chunks.length);

      // All chunks should be within limit
      result.forEach(chunk => {
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      });
    });

    it('should preserve MIME type', async () => {
      const mimeType = 'audio/ogg';
      const chunks = [createMockAudioBlob(1024 * 1024)];
      const result = await chunker.splitFromChunks(chunks, mimeType);

      expect(result[0].type).toBe(mimeType);
    });

    it('should handle single chunk', async () => {
      const chunk = createMockAudioBlob(1024 * 1024);
      const result = await chunker.splitFromChunks([chunk], 'audio/webm');

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(chunk.size);
    });

    it('should accumulate to total size', async () => {
      const chunks = Array.from({ length: 20 }, () => createMockAudioBlob(2 * 1024 * 1024)); // 2MB each
      const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
      const result = await chunker.splitFromChunks(chunks, 'audio/webm');

      const resultSize = result.reduce((sum, c) => sum + c.size, 0);
      expect(resultSize).toBe(totalSize);
    });
  });

  describe('calculateChunkSizes', () => {
    it('should return single size for small total', () => {
      const sizes = chunker.calculateChunkSizes(1024);
      expect(sizes).toEqual([1024]);
    });

    it('should return single size at limit', () => {
      const sizes = chunker.calculateChunkSizes(MAX_CHUNK_SIZE);
      expect(sizes).toEqual([MAX_CHUNK_SIZE]);
    });

    it('should split evenly for exact multiples', () => {
      const totalSize = MAX_CHUNK_SIZE * 3;
      const sizes = chunker.calculateChunkSizes(totalSize);

      expect(sizes).toHaveLength(3);
      sizes.forEach(size => {
        expect(size).toBe(MAX_CHUNK_SIZE);
      });
    });

    it('should distribute remainder across first chunks', () => {
      const totalSize = (MAX_CHUNK_SIZE * 3) + 100; // Add 100 bytes
      const sizes = chunker.calculateChunkSizes(totalSize);

      // This will create 4 chunks because ceil((MAX_CHUNK_SIZE * 3 + 100) / MAX_CHUNK_SIZE) = 4
      const expectedCount = Math.ceil(totalSize / MAX_CHUNK_SIZE);
      expect(sizes).toHaveLength(expectedCount);
      // Sum should equal total
      const sum = sizes.reduce((a, b) => a + b, 0);
      expect(sum).toBe(totalSize);
    });

    it('should return array of correct length', () => {
      const totalSize = 100 * 1024 * 1024; // 100MB
      const sizes = chunker.calculateChunkSizes(totalSize);

      const expectedCount = Math.ceil(totalSize / MAX_CHUNK_SIZE);
      expect(sizes).toHaveLength(expectedCount);
    });

    it('should not create chunks larger than max size', () => {
      const totalSize = 100 * 1024 * 1024;
      const sizes = chunker.calculateChunkSizes(totalSize);

      sizes.forEach(size => {
        expect(size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      });
    });
  });

  describe('getChunkingInfo', () => {
    it('should return complete metadata for small blob', () => {
      const blob = createMockAudioBlob(1024);
      const info = chunker.getChunkingInfo(blob);

      expect(info).toHaveProperty('totalSize', 1024);
      expect(info).toHaveProperty('totalSizeMB');
      expect(info).toHaveProperty('needsChunking', false);
      expect(info).toHaveProperty('estimatedChunkCount', 1);
      expect(info).toHaveProperty('maxChunkSize', MAX_CHUNK_SIZE);
      expect(info).toHaveProperty('maxChunkSizeMB');
      expect(info).toHaveProperty('chunkSizes');
      expect(info).toHaveProperty('estimatedDuration');
      expect(info).toHaveProperty('mimeType', 'audio/webm');
    });

    it('should return correct metadata for large blob', () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const info = chunker.getChunkingInfo(blob);

      expect(info.needsChunking).toBe(true);
      expect(info.estimatedChunkCount).toBeGreaterThan(1);
      expect(info.chunkSizes).toHaveLength(info.estimatedChunkCount);
    });

    it('should call AudioUtils methods', () => {
      const blob = createMockAudioBlob(1024);
      chunker.getChunkingInfo(blob);

      expect(AudioUtils.getBlobSizeMB).toHaveBeenCalledWith(blob);
      expect(AudioUtils.estimateDuration).toHaveBeenCalledWith(blob);
    });

    it('should preserve MIME type', () => {
      const mimeType = 'audio/ogg';
      const blob = createMockAudioBlob(1024, mimeType);
      const info = chunker.getChunkingInfo(blob);

      expect(info.mimeType).toBe(mimeType);
    });

    it('should have consistent chunk sizes array', () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const info = chunker.getChunkingInfo(blob);

      const sum = info.chunkSizes.reduce((a, b) => a + b, 0);
      expect(sum).toBe(info.totalSize);
    });
  });

  describe('splitWithOverlap', () => {
    it('should throw error for invalid blob', async () => {
      await expect(chunker.splitWithOverlap(null)).rejects.toThrow('Invalid audio blob provided');
      await expect(chunker.splitWithOverlap('not-a-blob')).rejects.toThrow('Invalid audio blob provided');
    });

    it('should throw error for negative overlap', async () => {
      const blob = createMockAudioBlob(1024);
      await expect(chunker.splitWithOverlap(blob, -100)).rejects.toThrow('Overlap bytes must be non-negative');
    });

    it('should throw error if overlap is too large', async () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const tooLargeOverlap = MAX_CHUNK_SIZE - (MIN_CHUNK_SIZE / 2);
      await expect(chunker.splitWithOverlap(blob, tooLargeOverlap)).rejects.toThrow('Overlap too large');
    });

    it('should return original blob if within limit', async () => {
      const blob = createMockAudioBlob(1024);
      const result = await chunker.splitWithOverlap(blob, 100);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(blob);
    });

    it('should create overlapping chunks', async () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const overlapBytes = 1024 * 1024; // 1MB overlap
      const result = await chunker.splitWithOverlap(blob, overlapBytes);

      expect(result.length).toBeGreaterThan(1);
    });

    it('should work with zero overlap', async () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const result = await chunker.splitWithOverlap(blob, 0);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect max chunk size with overlap', async () => {
      const blob = createMockAudioBlob(50 * 1024 * 1024);
      const overlapBytes = 512 * 1024; // 512KB overlap
      const result = await chunker.splitWithOverlap(blob, overlapBytes);

      result.forEach(chunk => {
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      });
    });

    it('should preserve MIME type', async () => {
      const mimeType = 'audio/mp3';
      const blob = createMockAudioBlob(50 * 1024 * 1024, mimeType);
      const result = await chunker.splitWithOverlap(blob, 0);

      result.forEach(chunk => {
        expect(chunk.type).toBe(mimeType);
      });
    });
  });

  describe('maxChunkSize getter', () => {
    it('should return configured max chunk size', () => {
      expect(chunker.maxChunkSize).toBe(MAX_CHUNK_SIZE);
    });

    it('should reflect custom configuration', () => {
      const customSize = 10 * 1024 * 1024;
      const customChunker = new AudioChunker({ maxChunkSize: customSize });
      expect(customChunker.maxChunkSize).toBe(customSize);
    });
  });

  describe('maxChunkSizeMB getter', () => {
    it('should return size in megabytes', () => {
      const expectedMB = Math.round((MAX_CHUNK_SIZE / (1024 * 1024)) * 100) / 100;
      expect(chunker.maxChunkSizeMB).toBe(expectedMB);
    });

    it('should reflect custom configuration', () => {
      const customSize = 10 * 1024 * 1024; // 10MB
      const customChunker = new AudioChunker({ maxChunkSize: customSize });
      const expectedMB = Math.round((customSize / (1024 * 1024)) * 100) / 100;
      expect(customChunker.maxChunkSizeMB).toBe(expectedMB);
    });

    it('should be properly rounded', () => {
      const size = chunker.maxChunkSizeMB;
      // Should have at most 2 decimal places
      expect(size).toBe(Math.round(size * 100) / 100);
    });
  });

  describe('edge cases', () => {
    it('should handle blob at exact limit boundary', async () => {
      const blob = createMockAudioBlob(MAX_CHUNK_SIZE);
      const result = await chunker.splitIfNeeded(blob);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(MAX_CHUNK_SIZE);
    });

    it('should handle blob one byte over limit', async () => {
      const blob = createMockAudioBlob(MAX_CHUNK_SIZE + 1);
      const result = await chunker.splitIfNeeded(blob);

      // The split logic combines tiny remainders (< MIN_CHUNK_SIZE) with the previous chunk
      // So MAX_CHUNK_SIZE + 1 byte results in a single chunk
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(MAX_CHUNK_SIZE + 1);
    });

    it('should handle very small blobs', async () => {
      const blob = createMockAudioBlob(1);
      const result = await chunker.splitIfNeeded(blob);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(1);
    });

    it('should handle empty blob', async () => {
      const blob = createMockAudioBlob(0);
      const result = await chunker.splitIfNeeded(blob);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(0);
    });

    it('should handle multiple of exact chunk size', async () => {
      const blob = createMockAudioBlob(MAX_CHUNK_SIZE * 4);
      const result = await chunker.split(blob);

      expect(result).toHaveLength(4);
      result.forEach(chunk => {
        expect(chunk.size).toBe(MAX_CHUNK_SIZE);
      });
    });

    it('should handle custom chunker with small max size', async () => {
      const smallChunker = new AudioChunker({ maxChunkSize: 2 * 1024 * 1024 }); // 2MB
      const blob = createMockAudioBlob(10 * 1024 * 1024); // 10MB
      const result = await smallChunker.split(blob);

      expect(result.length).toBe(5); // 10MB / 2MB = 5 chunks
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical recording session (20MB)', async () => {
      const sessionBlob = createMockAudioBlob(20 * 1024 * 1024, 'audio/webm');
      const result = await chunker.splitIfNeeded(sessionBlob);

      // 20MB should fit in a single chunk (limit is 24MB)
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(20 * 1024 * 1024);
    });

    it('should handle long recording session (100MB)', async () => {
      const longSession = createMockAudioBlob(100 * 1024 * 1024, 'audio/webm');
      const result = await chunker.splitIfNeeded(longSession);

      // Should split into multiple chunks
      expect(result.length).toBeGreaterThan(1);

      // All chunks should be valid sizes
      result.forEach((chunk, index) => {
        expect(chunk.size).toBeGreaterThan(0);
        expect(chunk.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
        expect(chunk.type).toBe('audio/webm');
      });

      // Total size should match
      const totalSize = result.reduce((sum, chunk) => sum + chunk.size, 0);
      expect(totalSize).toBe(100 * 1024 * 1024);
    });

    it('should handle recording chunks from real recording', async () => {
      // Simulate 30 minutes of recording with 1-minute chunks
      const recordingChunks = Array.from({ length: 30 }, () =>
        createMockAudioBlob(1 * 1024 * 1024, 'audio/webm') // ~1MB per minute
      );

      const result = await chunker.splitFromChunks(recordingChunks, 'audio/webm');

      // Should group into a single chunk (30MB total)
      expect(result).toHaveLength(2); // 30MB > 24MB, so needs 2 chunks

      // Verify total size preserved
      const originalTotal = recordingChunks.reduce((sum, c) => sum + c.size, 0);
      const resultTotal = result.reduce((sum, c) => sum + c.size, 0);
      expect(resultTotal).toBe(originalTotal);
    });

    it('should provide accurate chunking info before splitting', () => {
      const blob = createMockAudioBlob(75 * 1024 * 1024);
      const info = chunker.getChunkingInfo(blob);

      // Use info to inform user
      expect(info.needsChunking).toBe(true);
      expect(info.estimatedChunkCount).toBeGreaterThan(2);
      expect(info.totalSizeMB).toBeGreaterThan(70);

      // Info should match actual split
      const expectedChunks = Math.ceil(75 / 24);
      expect(info.estimatedChunkCount).toBe(expectedChunks);
    });
  });
});
