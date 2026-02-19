/**
 * AudioChunker - Audio Segmentation Utility for VoxChronicle
 *
 * Splits long audio recordings into segments that comply with OpenAI's
 * 25MB file size limit for transcription. Uses intelligent splitting
 * based on chunk boundaries when available, or byte-based splitting
 * as a fallback.
 *
 * @class AudioChunker
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { AudioUtils, MAX_TRANSCRIPTION_SIZE } from '../utils/AudioUtils.mjs';

/**
 * Maximum file size per chunk for OpenAI transcription API (25MB)
 * Using a slightly smaller target to leave margin for container overhead
 * @constant {number}
 */
const MAX_CHUNK_SIZE = MAX_TRANSCRIPTION_SIZE - 1024 * 1024; // 24MB to leave 1MB margin

/**
 * Minimum chunk size to avoid creating too-small segments
 * @constant {number}
 */
const MIN_CHUNK_SIZE = 1024 * 1024; // 1MB minimum

/**
 * AudioChunker class for splitting large audio files into smaller segments
 *
 * @example
 * const chunker = new AudioChunker();
 * const chunks = await chunker.splitIfNeeded(largeAudioBlob);
 * for (const chunk of chunks) {
 *   await transcriptionService.transcribe(chunk);
 * }
 */
class AudioChunker {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('AudioChunker');

  /**
   * Maximum size per chunk in bytes
   * @type {number}
   * @private
   */
  _maxChunkSize = MAX_CHUNK_SIZE;

  /**
   * Create a new AudioChunker instance
   *
   * @param {object} [options] - Configuration options
   * @param {number} [options.maxChunkSize] - Maximum size per chunk in bytes
   */
  constructor(options = {}) {
    if (options.maxChunkSize) {
      this._maxChunkSize = Math.min(options.maxChunkSize, MAX_CHUNK_SIZE);
    }
    this._logger.debug(`AudioChunker initialized with max chunk size: ${this._maxChunkSize} bytes`);
  }

  /**
   * Check if an audio blob needs to be split into chunks
   *
   * @param {Blob} audioBlob - The audio blob to check
   * @returns {boolean} True if the blob needs chunking
   */
  needsChunking(audioBlob) {
    return audioBlob.size > this._maxChunkSize;
  }

  /**
   * Get the number of chunks that would be created for a given blob
   *
   * @param {Blob} audioBlob - The audio blob
   * @returns {number} Estimated number of chunks
   */
  getEstimatedChunkCount(audioBlob) {
    if (!this.needsChunking(audioBlob)) {
      return 1;
    }
    return Math.ceil(audioBlob.size / this._maxChunkSize);
  }

  /**
   * Split an audio blob into smaller chunks if needed
   * Returns the original blob in an array if no splitting is required
   *
   * @param {Blob} audioBlob - The audio blob to split
   * @returns {Promise<Array<Blob>>} Array of audio blobs, each under the size limit
   */
  async splitIfNeeded(audioBlob) {
    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error('Invalid audio blob provided');
    }

    const sizeMB = AudioUtils.getBlobSizeMB(audioBlob);
    this._logger.debug(`splitIfNeeded called: ${sizeMB}MB, needs chunking: ${this.needsChunking(audioBlob)}`);

    if (!this.needsChunking(audioBlob)) {
      this._logger.debug('Audio blob is within size limit, no chunking needed');
      return [audioBlob];
    }

    return this.split(audioBlob);
  }

  /**
   * Split an audio blob into chunks
   *
   * @param {Blob} audioBlob - The audio blob to split
   * @returns {Promise<Array<Blob>>} Array of audio blob chunks
   */
  async split(audioBlob) {
    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error('Invalid audio blob provided');
    }

    const totalSize = audioBlob.size;
    const mimeType = audioBlob.type;
    const numChunks = this.getEstimatedChunkCount(audioBlob);

    this._logger.log(
      `Splitting audio blob: ${AudioUtils.getBlobSizeMB(audioBlob)}MB into ~${numChunks} chunks`
    );

    const chunks = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalSize) {
      // Calculate chunk size
      const remaining = totalSize - offset;
      const chunkSize = Math.min(this._maxChunkSize, remaining);

      // Ensure we don't create tiny final chunks
      if (remaining <= MIN_CHUNK_SIZE && chunks.length > 0) {
        // Append to last chunk if the remainder is too small
        const lastChunk = chunks.pop();
        const combinedData = await this._combineBlobs(
          [lastChunk, audioBlob.slice(offset)],
          mimeType
        );
        chunks.push(combinedData);
        this._logger.debug(`Combined small remainder with previous chunk`);
        break;
      }

      // Slice the blob
      const chunkBlob = audioBlob.slice(offset, offset + chunkSize, mimeType);
      chunks.push(chunkBlob);

      this._logger.debug(
        `Created chunk ${chunkIndex + 1}: ${AudioUtils.getBlobSizeMB(chunkBlob)}MB`
      );

      offset += chunkSize;
      chunkIndex++;
    }

    this._logger.log(`Split complete: ${chunks.length} chunks created`);
    return chunks;
  }

  /**
   * Split audio using recorded data chunks for cleaner boundaries
   * This method is preferred when original recording chunks are available
   *
   * @param {Array<Blob>} recordingChunks - Original recording data chunks
   * @param {string} mimeType - The audio MIME type
   * @returns {Promise<Array<Blob>>} Array of optimally-sized audio blobs
   */
  async splitFromChunks(recordingChunks, mimeType) {
    if (!Array.isArray(recordingChunks) || recordingChunks.length === 0) {
      throw new Error('Invalid recording chunks array');
    }

    const totalSize = recordingChunks.reduce((sum, c) => sum + c.size, 0);
    this._logger.debug(`splitFromChunks called: ${recordingChunks.length} chunks, total ${(totalSize / 1024 / 1024).toFixed(2)}MB, mimeType: ${mimeType}`);
    this._logger.debug(`Processing ${recordingChunks.length} recording chunks`);

    const resultChunks = [];
    let currentGroup = [];
    let currentSize = 0;

    for (const chunk of recordingChunks) {
      const chunkSize = chunk.size;

      // Check if adding this chunk would exceed the limit
      if (currentSize + chunkSize > this._maxChunkSize && currentGroup.length > 0) {
        // Create a blob from current group
        const groupBlob = await this._combineBlobs(currentGroup, mimeType);
        resultChunks.push(groupBlob);

        this._logger.debug(
          `Created chunk group: ${AudioUtils.getBlobSizeMB(groupBlob)}MB from ${currentGroup.length} chunks`
        );

        // Start new group
        currentGroup = [];
        currentSize = 0;
      }

      currentGroup.push(chunk);
      currentSize += chunkSize;
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      const groupBlob = await this._combineBlobs(currentGroup, mimeType);
      resultChunks.push(groupBlob);

      this._logger.debug(
        `Created final chunk group: ${AudioUtils.getBlobSizeMB(groupBlob)}MB from ${currentGroup.length} chunks`
      );
    }

    this._logger.log(`Grouped ${recordingChunks.length} chunks into ${resultChunks.length} blobs`);
    return resultChunks;
  }

  /**
   * Calculate optimal chunk sizes for a given total size
   *
   * @param {number} totalSize - Total size in bytes
   * @returns {Array<number>} Array of chunk sizes
   */
  calculateChunkSizes(totalSize) {
    if (totalSize <= this._maxChunkSize) {
      return [totalSize];
    }

    const numChunks = Math.ceil(totalSize / this._maxChunkSize);
    const evenSize = Math.floor(totalSize / numChunks);
    const remainder = totalSize % numChunks;

    const sizes = [];
    for (let i = 0; i < numChunks; i++) {
      // Distribute remainder across first chunks
      sizes.push(evenSize + (i < remainder ? 1 : 0));
    }

    return sizes;
  }

  /**
   * Get metadata about how an audio blob would be chunked
   *
   * @param {Blob} audioBlob - The audio blob to analyze
   * @returns {object} Chunking metadata
   */
  getChunkingInfo(audioBlob) {
    const totalSize = audioBlob.size;
    const needsChunking = this.needsChunking(audioBlob);
    const estimatedChunks = this.getEstimatedChunkCount(audioBlob);
    const chunkSizes = this.calculateChunkSizes(totalSize);

    return {
      totalSize,
      totalSizeMB: AudioUtils.getBlobSizeMB(audioBlob),
      needsChunking,
      estimatedChunkCount: estimatedChunks,
      maxChunkSize: this._maxChunkSize,
      maxChunkSizeMB: Math.round((this._maxChunkSize / (1024 * 1024)) * 100) / 100,
      chunkSizes,
      estimatedDuration: AudioUtils.estimateDuration(audioBlob),
      mimeType: audioBlob.type
    };
  }

  /**
   * Combine multiple blobs into a single blob
   *
   * @param {Array<Blob>} blobs - Array of blobs to combine
   * @param {string} mimeType - The MIME type for the resulting blob
   * @returns {Promise<Blob>} Combined blob
   * @private
   */
  async _combineBlobs(blobs, mimeType) {
    return new Blob(blobs, { type: mimeType });
  }

  /**
   * Create chunks with overlap for better transcription continuity
   * Useful when context between chunks is important
   *
   * @param {Blob} audioBlob - The audio blob to split
   * @param {number} [overlapBytes=0] - Number of bytes to overlap between chunks
   * @returns {Promise<Array<Blob>>} Array of overlapping audio blob chunks
   */
  async splitWithOverlap(audioBlob, overlapBytes = 0) {
    this._logger.debug(`splitWithOverlap called: ${audioBlob?.size ? AudioUtils.getBlobSizeMB(audioBlob) + 'MB' : 'invalid'}, overlap: ${overlapBytes} bytes`);

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error('Invalid audio blob provided');
    }

    if (overlapBytes < 0) {
      throw new Error('Overlap bytes must be non-negative');
    }

    // If overlap would make chunks larger than limit, reduce it
    const effectiveChunkSize = this._maxChunkSize - overlapBytes;
    if (effectiveChunkSize < MIN_CHUNK_SIZE) {
      throw new Error('Overlap too large for the configured chunk size');
    }

    const totalSize = audioBlob.size;
    const mimeType = audioBlob.type;

    if (totalSize <= this._maxChunkSize) {
      return [audioBlob];
    }

    const chunks = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalSize) {
      const chunkStart = offset;
      const chunkEnd = Math.min(offset + this._maxChunkSize, totalSize);

      const chunkBlob = audioBlob.slice(chunkStart, chunkEnd, mimeType);
      chunks.push(chunkBlob);

      this._logger.debug(
        `Created overlapping chunk ${chunkIndex + 1}: bytes ${chunkStart}-${chunkEnd}`
      );

      // Move offset, accounting for overlap
      offset += effectiveChunkSize;
      chunkIndex++;
    }

    this._logger.log(`Split with overlap complete: ${chunks.length} chunks created`);
    return chunks;
  }

  /**
   * Get the maximum chunk size configuration
   *
   * @returns {number} Maximum chunk size in bytes
   */
  get maxChunkSize() {
    return this._maxChunkSize;
  }

  /**
   * Get the maximum chunk size in megabytes
   *
   * @returns {number} Maximum chunk size in MB
   */
  get maxChunkSizeMB() {
    return Math.round((this._maxChunkSize / (1024 * 1024)) * 100) / 100;
  }
}

// Export the AudioChunker class and constants
export { AudioChunker, MAX_CHUNK_SIZE, MIN_CHUNK_SIZE };
