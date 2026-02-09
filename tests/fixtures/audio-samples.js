/**
 * Audio Test Fixtures
 *
 * Provides pre-defined audio blobs and samples for testing audio-related
 * functionality including recording, transcription, and chunking.
 */

/**
 * Audio size constants (in bytes)
 */
export const AUDIO_SIZES = {
  TINY: 512, // 512 bytes - minimal valid audio
  SMALL: 1024, // 1 KB - small test sample
  MEDIUM: 50 * 1024, // 50 KB - typical short recording
  LARGE: 1024 * 1024, // 1 MB - longer recording
  VERY_LARGE: 10 * 1024 * 1024, // 10 MB - extended session
  NEAR_LIMIT: 24 * 1024 * 1024, // 24 MB - just under 25MB limit
  OVERSIZED: 26 * 1024 * 1024, // 26 MB - exceeds 25MB limit (requires chunking)
  HUGE: 50 * 1024 * 1024 // 50 MB - requires multiple chunks
};

/**
 * Common audio MIME types
 */
export const AUDIO_MIME_TYPES = {
  WEBM: 'audio/webm',
  WEBM_OPUS: 'audio/webm;codecs=opus',
  MP3: 'audio/mp3',
  MP4: 'audio/mp4',
  WAV: 'audio/wav',
  OGG: 'audio/ogg',
  MPEG: 'audio/mpeg',
  INVALID: 'video/mp4' // Wrong type for audio
};

/**
 * Create a mock audio blob for testing
 *
 * @param {number} size - Blob size in bytes
 * @param {string} type - MIME type
 * @param {number} [fillValue=0] - Value to fill the buffer with
 * @returns {Blob} Mock audio blob
 */
export function createMockAudioBlob(size = 1024, type = 'audio/webm', fillValue = 0) {
  const data = new Uint8Array(size).fill(fillValue);
  return new Blob([data], { type });
}

/**
 * Create a mock audio blob with realistic WebM headers
 * This creates a blob that looks more like actual WebM data
 *
 * @param {number} size - Blob size in bytes
 * @returns {Blob} Mock WebM audio blob with headers
 */
export function createRealisticWebMBlob(size = 1024) {
  // WebM file starts with EBML header: 0x1A45DFA3
  const header = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const remaining = new Uint8Array(size - header.length).fill(0);

  const combined = new Uint8Array(size);
  combined.set(header, 0);
  combined.set(remaining, header.length);

  return new Blob([combined], { type: AUDIO_MIME_TYPES.WEBM });
}

/**
 * Create a mock audio File object (not just Blob)
 *
 * @param {number} size - File size in bytes
 * @param {string} name - File name
 * @param {string} type - MIME type
 * @returns {File} Mock audio file
 */
export function createMockAudioFile(size = 1024, name = 'recording.webm', type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new File([data], name, { type, lastModified: Date.now() });
}

/**
 * Pre-defined audio samples for common test scenarios
 */

// Small audio samples (under 1 MB)
export const SMALL_AUDIO_SAMPLES = {
  tiny: createMockAudioBlob(AUDIO_SIZES.TINY, AUDIO_MIME_TYPES.WEBM),
  small: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.WEBM),
  medium: createMockAudioBlob(AUDIO_SIZES.MEDIUM, AUDIO_MIME_TYPES.WEBM),
  webmOpus: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.WEBM_OPUS),
  mp3: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.MP3),
  wav: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.WAV)
};

// Large audio samples (1 MB+)
export const LARGE_AUDIO_SAMPLES = {
  large: createMockAudioBlob(AUDIO_SIZES.LARGE, AUDIO_MIME_TYPES.WEBM),
  veryLarge: createMockAudioBlob(AUDIO_SIZES.VERY_LARGE, AUDIO_MIME_TYPES.WEBM),
  nearLimit: createMockAudioBlob(AUDIO_SIZES.NEAR_LIMIT, AUDIO_MIME_TYPES.WEBM),
  oversized: createMockAudioBlob(AUDIO_SIZES.OVERSIZED, AUDIO_MIME_TYPES.WEBM),
  huge: createMockAudioBlob(AUDIO_SIZES.HUGE, AUDIO_MIME_TYPES.WEBM)
};

// Invalid audio samples for error testing
export const INVALID_AUDIO_SAMPLES = {
  empty: new Blob([], { type: AUDIO_MIME_TYPES.WEBM }),
  wrongType: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.INVALID),
  noType: createMockAudioBlob(AUDIO_SIZES.SMALL, ''),
  corrupted: createMockAudioBlob(AUDIO_SIZES.SMALL, AUDIO_MIME_TYPES.WEBM, 0xff)
};

// Realistic audio samples with headers
export const REALISTIC_AUDIO_SAMPLES = {
  webm: createRealisticWebMBlob(AUDIO_SIZES.MEDIUM),
  webmLarge: createRealisticWebMBlob(AUDIO_SIZES.LARGE)
};

// Audio files (File objects, not just Blobs)
export const AUDIO_FILE_SAMPLES = {
  recording: createMockAudioFile(AUDIO_SIZES.MEDIUM, 'recording.webm', AUDIO_MIME_TYPES.WEBM),
  session: createMockAudioFile(AUDIO_SIZES.LARGE, 'session-2024-01-15.webm', AUDIO_MIME_TYPES.WEBM),
  combat: createMockAudioFile(AUDIO_SIZES.MEDIUM, 'combat-encounter.webm', AUDIO_MIME_TYPES.WEBM),
  mp3File: createMockAudioFile(AUDIO_SIZES.SMALL, 'export.mp3', AUDIO_MIME_TYPES.MP3)
};

/**
 * Create a sequence of audio chunks for chunking tests
 *
 * @param {number} chunkCount - Number of chunks to create
 * @param {number} chunkSize - Size of each chunk in bytes
 * @param {string} type - MIME type
 * @returns {Array<Blob>} Array of audio blob chunks
 */
export function createAudioChunks(
  chunkCount = 3,
  chunkSize = AUDIO_SIZES.LARGE,
  type = AUDIO_MIME_TYPES.WEBM
) {
  return Array.from({ length: chunkCount }, (_, i) => {
    // Use different fill values to make chunks distinguishable
    return createMockAudioBlob(chunkSize, type, i);
  });
}

/**
 * Create a progressive audio stream (simulating recording in progress)
 *
 * @param {number} finalSize - Final size when recording completes
 * @param {number} steps - Number of steps to simulate
 * @returns {Array<Blob>} Array of progressively larger blobs
 */
export function createProgressiveAudioStream(finalSize = AUDIO_SIZES.LARGE, steps = 5) {
  return Array.from({ length: steps }, (_, i) => {
    const currentSize = Math.floor((finalSize / steps) * (i + 1));
    return createMockAudioBlob(currentSize, AUDIO_MIME_TYPES.WEBM);
  });
}

/**
 * Audio duration estimates (for testing duration calculations)
 * Based on typical bitrates: ~16 KB/s for compressed audio
 */
export const AUDIO_DURATION_ESTIMATES = {
  [AUDIO_SIZES.TINY]: 0.03, // ~32ms
  [AUDIO_SIZES.SMALL]: 0.06, // ~64ms
  [AUDIO_SIZES.MEDIUM]: 3.1, // ~3 seconds
  [AUDIO_SIZES.LARGE]: 64, // ~1 minute
  [AUDIO_SIZES.VERY_LARGE]: 640, // ~10 minutes
  [AUDIO_SIZES.NEAR_LIMIT]: 1536, // ~25 minutes
  [AUDIO_SIZES.OVERSIZED]: 1664, // ~27 minutes
  [AUDIO_SIZES.HUGE]: 3200 // ~53 minutes
};

/**
 * Get estimated duration for a given audio size
 *
 * @param {number} sizeInBytes - Audio size in bytes
 * @returns {number} Estimated duration in seconds
 */
export function getEstimatedDuration(sizeInBytes) {
  const BYTES_PER_SECOND = 16000; // ~16 KB/s typical for compressed audio
  return Math.round(sizeInBytes / BYTES_PER_SECOND);
}

/**
 * Test scenarios combining audio samples with expected outcomes
 */
export const AUDIO_TEST_SCENARIOS = {
  smallRecording: {
    audio: SMALL_AUDIO_SAMPLES.medium,
    expectedSize: AUDIO_SIZES.MEDIUM,
    expectedDuration: AUDIO_DURATION_ESTIMATES[AUDIO_SIZES.MEDIUM],
    requiresChunking: false,
    isValid: true
  },

  largeRecording: {
    audio: LARGE_AUDIO_SAMPLES.large,
    expectedSize: AUDIO_SIZES.LARGE,
    expectedDuration: AUDIO_DURATION_ESTIMATES[AUDIO_SIZES.LARGE],
    requiresChunking: false,
    isValid: true
  },

  oversizedRecording: {
    audio: LARGE_AUDIO_SAMPLES.oversized,
    expectedSize: AUDIO_SIZES.OVERSIZED,
    expectedDuration: AUDIO_DURATION_ESTIMATES[AUDIO_SIZES.OVERSIZED],
    requiresChunking: true,
    estimatedChunks: 2,
    isValid: true
  },

  hugeRecording: {
    audio: LARGE_AUDIO_SAMPLES.huge,
    expectedSize: AUDIO_SIZES.HUGE,
    expectedDuration: AUDIO_DURATION_ESTIMATES[AUDIO_SIZES.HUGE],
    requiresChunking: true,
    estimatedChunks: 3,
    isValid: true
  },

  emptyRecording: {
    audio: INVALID_AUDIO_SAMPLES.empty,
    expectedSize: 0,
    expectedDuration: 0,
    requiresChunking: false,
    isValid: false,
    errorType: 'empty'
  },

  invalidType: {
    audio: INVALID_AUDIO_SAMPLES.wrongType,
    expectedSize: AUDIO_SIZES.SMALL,
    expectedDuration: AUDIO_DURATION_ESTIMATES[AUDIO_SIZES.SMALL],
    requiresChunking: false,
    isValid: false,
    errorType: 'invalidMimeType'
  }
};

/**
 * Export all samples in a single object for convenience
 */
export const ALL_AUDIO_SAMPLES = {
  ...SMALL_AUDIO_SAMPLES,
  ...LARGE_AUDIO_SAMPLES,
  ...INVALID_AUDIO_SAMPLES,
  ...REALISTIC_AUDIO_SAMPLES,
  ...AUDIO_FILE_SAMPLES
};
