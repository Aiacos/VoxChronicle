/**
 * LocalWhisperService - Local Whisper Transcription Service
 *
 * Provides audio transcription using a local Whisper server (whisper.cpp, faster-whisper, etc.)
 * Implements the same interface as TranscriptionService for seamless integration.
 * Supports speaker diarization if the backend provides it, otherwise falls back to basic transcription.
 *
 * @class LocalWhisperService
 * @module vox-chronicle
 */

import { WhisperBackend, WhisperError, WhisperErrorType } from './WhisperBackend.mjs';
import { AudioChunker } from '../audio/AudioChunker.mjs';
import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';

/**
 * Response format options for local Whisper transcription
 * @enum {string}
 */
const LocalWhisperResponseFormat = {
  /** JSON with segments and optional speaker labels */
  JSON: 'json',
  /** Verbose JSON with detailed timing */
  VERBOSE_JSON: 'verbose_json',
  /** Plain text only */
  TEXT: 'text',
  /** SubRip subtitle format */
  SRT: 'srt',
  /** WebVTT format */
  VTT: 'vtt'
};

/**
 * Default timeout for transcription requests (10 minutes)
 * Local transcription can take longer depending on hardware
 * @constant {number}
 */
const LOCAL_TRANSCRIPTION_TIMEOUT_MS = 600000;

/**
 * LocalWhisperService class for local audio transcription
 *
 * @example
 * const service = new LocalWhisperService('http://localhost:8080');
 * const result = await service.transcribe(audioBlob, {
 *   language: 'en',
 *   speakerMap: { 'SPEAKER_00': 'Game Master', 'SPEAKER_01': 'Player 1' }
 * });
 */
class LocalWhisperService {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('LocalWhisperService');

  /**
   * Whisper backend client
   * @type {WhisperBackend}
   * @private
   */
  _backend = null;

  /**
   * Audio chunker for handling large files
   * @type {AudioChunker}
   * @private
   */
  _chunker = null;

  /**
   * Default transcription language
   * @type {string|null}
   * @private
   */
  _defaultLanguage = null;

  /**
   * Default speaker mapping
   * @type {object}
   * @private
   */
  _defaultSpeakerMap = {};

  /**
   * Whether the backend supports speaker diarization
   * @type {boolean|null}
   * @private
   */
  _supportsDiarization = null;

  /**
   * Create a new LocalWhisperService instance
   *
   * @param {string} backendUrl - Whisper backend server URL
   * @param {object} [options] - Configuration options
   * @param {string} [options.defaultLanguage] - Default transcription language (e.g., 'en', 'it')
   * @param {object} [options.defaultSpeakerMap] - Default speaker ID to name mapping
   * @param {number} [options.timeout=600000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   */
  constructor(backendUrl, options = {}) {
    this._backend = new WhisperBackend(backendUrl, {
      timeout: options.timeout || LOCAL_TRANSCRIPTION_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? 3
    });

    this._defaultLanguage = options.defaultLanguage || null;
    this._defaultSpeakerMap = options.defaultSpeakerMap || {};
    this._chunker = new AudioChunker();

    this._logger.debug('LocalWhisperService initialized');
  }

  /**
   * Get the backend URL
   *
   * @returns {string} Backend URL
   */
  get backendUrl() {
    return this._backend.baseUrl;
  }

  /**
   * Update the backend URL
   *
   * @param {string} url - New backend URL
   */
  setBackendUrl(url) {
    this._backend.setBaseUrl(url);
    this._supportsDiarization = null; // Reset capabilities
    this._logger.debug(`Backend URL updated to: ${url}`);
  }

  /**
   * Perform a health check on the backend
   *
   * @param {object} [options] - Health check options
   * @returns {Promise<boolean>} True if backend is healthy
   */
  async healthCheck(options = {}) {
    this._logger.debug('healthCheck called');
    const t0 = Date.now();
    const result = await this._backend.healthCheck(options);
    this._logger.debug(`healthCheck completed in ${Date.now() - t0}ms`, { healthy: result });
    return result;
  }

  /**
   * Get the last known health status
   *
   * @returns {boolean|null} Last health status
   */
  get lastHealthStatus() {
    return this._backend.lastHealthStatus;
  }

  /**
   * Transcribe audio with optional speaker diarization
   *
   * @param {Blob|File} audioBlob - Audio file to transcribe
   * @param {object} [options] - Transcription options
   * @param {object} [options.speakerMap] - Map of speaker IDs to names (e.g., {'SPEAKER_00': 'GM'})
   * @param {string} [options.language] - ISO language code (e.g., 'en', 'it', 'es')
   * @param {string} [options.responseFormat] - Response format
   * @param {boolean} [options.word_timestamps=false] - Include word-level timestamps
   * @param {number} [options.temperature=0] - Sampling temperature (0-1)
   * @param {Function} [options.onProgress] - Progress callback for chunked transcription
   * @returns {Promise<TranscriptionResult>} Transcription result with speaker-labeled segments
   */
  async transcribe(audioBlob, options = {}) {
    this._logger.debug('transcribe called', { blobSize: audioBlob?.size, language: options.language });
    const t0 = Date.now();

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new WhisperError(
        'Invalid audio input: expected Blob or File',
        WhisperErrorType.INVALID_REQUEST_ERROR
      );
    }

    // Validate audio blob
    if (!AudioUtils.isValidAudioBlob(audioBlob)) {
      this._logger.warn('Audio blob may not be valid, attempting transcription anyway');
    }

    // Check if audio exceeds size limit and needs chunking
    let result;
    if (this._chunker.needsChunking(audioBlob)) {
      result = await this._transcribeChunked(audioBlob, options);
    } else {
      result = await this._transcribeSingle(audioBlob, options);
    }

    this._logger.debug(`transcribe completed in ${Date.now() - t0}ms`, {
      segmentCount: result.segments?.length,
      speakerCount: result.speakers?.length,
      textLength: result.text?.length
    });
    return result;
  }

  /**
   * Transcribe a single audio blob (under size limit)
   *
   * @param {Blob} audioBlob - Audio blob to transcribe
   * @param {object} options - Transcription options
   * @returns {Promise<TranscriptionResult>} Transcription result
   * @private
   */
  async _transcribeSingle(audioBlob, options = {}) {
    const t0 = Date.now();
    const speakerMap = options.speakerMap || this._defaultSpeakerMap;
    const language = options.language || this._defaultLanguage;
    const responseFormat = options.responseFormat || LocalWhisperResponseFormat.JSON;

    this._logger.log(`Starting local transcription: ${AudioUtils.getBlobSizeMB(audioBlob)}MB`);

    try {
      const response = await this._backend.transcribe(audioBlob, {
        language,
        response_format: responseFormat,
        word_timestamps: options.word_timestamps,
        temperature: options.temperature,
        task: 'transcribe'
      });

      // Normalize response to match OpenAI format
      const normalizedResult = this._normalizeResponse(response);

      // Map speakers to names if diarization is available
      const mappedResult = this._mapSpeakersToNames(normalizedResult, speakerMap);

      this._logger.log(`Local transcription completed successfully in ${Date.now() - t0}ms`);
      this._logger.debug('_transcribeSingle result', {
        durationMs: Date.now() - t0,
        segmentCount: mappedResult.segments?.length,
        speakerCount: mappedResult.speakers?.length,
        textLength: mappedResult.text?.length
      });
      return mappedResult;
    } catch (error) {
      this._logger.error(`_transcribeSingle failed after ${Date.now() - t0}ms: ${error.message}`, { blobSizeMB: AudioUtils.getBlobSizeMB(audioBlob) });
      throw error;
    }
  }

  /**
   * Transcribe a large audio file by splitting into chunks
   *
   * @param {Blob} audioBlob - Large audio blob to transcribe
   * @param {object} options - Transcription options
   * @returns {Promise<TranscriptionResult>} Combined transcription result
   * @private
   */
  async _transcribeChunked(audioBlob, options = {}) {
    const t0 = Date.now();
    const chunkingInfo = this._chunker.getChunkingInfo(audioBlob);
    this._logger.log(
      `Audio requires chunking: ${chunkingInfo.totalSizeMB}MB -> ~${chunkingInfo.estimatedChunkCount} chunks`
    );

    // Split audio into chunks
    const chunks = await this._chunker.splitIfNeeded(audioBlob);

    const results = [];
    let totalDuration = 0;
    const allSpeakers = new Set();

    // Transcribe each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this._logger.log(`Transcribing chunk ${i + 1}/${chunks.length}`);

      // Report progress if callback provided
      if (options.onProgress) {
        options.onProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          progress: (i / chunks.length) * 100
        });
      }

      const chunkResult = await this._transcribeSingle(chunk, {
        ...options,
        // Don't re-map speakers until we combine results
        speakerMap: {}
      });

      // Track duration offset for proper timing
      if (chunkResult.segments) {
        // Adjust segment times based on previous chunks
        chunkResult.segments.forEach((segment) => {
          segment.start += totalDuration;
          segment.end += totalDuration;
          if (segment.speaker || segment.originalSpeaker) {
            allSpeakers.add(segment.originalSpeaker || segment.speaker);
          }
        });
      }

      results.push(chunkResult);

      // Estimate duration of this chunk for next offset
      const chunkDuration = AudioUtils.estimateDuration(chunk);
      totalDuration += chunkDuration;
    }

    // Report completion
    if (options.onProgress) {
      options.onProgress({
        currentChunk: chunks.length,
        totalChunks: chunks.length,
        progress: 100
      });
    }

    // Combine all chunk results
    const combinedResult = this._combineChunkResults(results, allSpeakers);

    // Apply speaker mapping to final result
    const speakerMap = options.speakerMap || this._defaultSpeakerMap;
    const result = this._mapSpeakersToNames(combinedResult, speakerMap);

    this._logger.debug(`_transcribeChunked completed in ${Date.now() - t0}ms`, {
      chunkCount: chunks.length,
      totalSegments: result.segments?.length,
      uniqueSpeakers: allSpeakers.size
    });
    return result;
  }

  /**
   * Normalize Whisper backend response to match OpenAI format
   *
   * @param {object | string} response - Raw backend response
   * @returns {object} Normalized transcription result
   * @private
   */
  _normalizeResponse(response) {
    // Handle text-only response
    if (typeof response === 'string') {
      return {
        text: response,
        segments: [],
        speakers: []
      };
    }

    // Handle JSON response
    if (typeof response === 'object' && response !== null) {
      const normalized = {
        text: response.text || '',
        segments: [],
        language: response.language,
        duration: response.duration
      };

      // Process segments if available
      if (response.segments && Array.isArray(response.segments)) {
        normalized.segments = response.segments.map((segment) => ({
          speaker: segment.speaker || null,
          text: segment.text || '',
          start: segment.start ?? segment.from ?? 0,
          end: segment.end ?? segment.to ?? 0
        }));
      } else if (response.words && Array.isArray(response.words)) {
        // Handle word-level response (create segments from words)
        normalized.segments = this._createSegmentsFromWords(response.words);
      }

      return normalized;
    }

    // Fallback for unexpected format
    this._logger.warn('Unexpected response format from backend');
    return {
      text: String(response || ''),
      segments: [],
      speakers: []
    };
  }

  /**
   * Create segments from word-level transcription
   *
   * @param {Array<object>} words - Array of word objects with timestamps
   * @returns {Array<object>} Segment array
   * @private
   */
  _createSegmentsFromWords(words) {
    if (!words || words.length === 0) {
      return [];
    }

    const segments = [];
    let currentSegment = null;
    const SEGMENT_GAP_THRESHOLD = 1.0; // 1 second gap = new segment

    for (const word of words) {
      const wordStart = word.start ?? 0;
      const wordEnd = word.end ?? wordStart;
      const wordText = word.word || '';
      const wordSpeaker = word.speaker || null;

      // Start new segment if:
      // 1. No current segment
      // 2. Speaker changed
      // 3. Long gap since last word
      if (
        !currentSegment ||
        (wordSpeaker && currentSegment.speaker !== wordSpeaker) ||
        wordStart - currentSegment.end > SEGMENT_GAP_THRESHOLD
      ) {
        if (currentSegment) {
          segments.push(currentSegment);
        }

        currentSegment = {
          speaker: wordSpeaker,
          text: wordText,
          start: wordStart,
          end: wordEnd
        };
      } else {
        // Append to current segment
        currentSegment.text += ` ${wordText}`;
        currentSegment.end = wordEnd;
      }
    }

    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Combine transcription results from multiple chunks
   *
   * @param {Array<object>} chunkResults - Results from each chunk
   * @param {Set<string>} allSpeakers - Set of all unique speakers
   * @returns {object} Combined transcription result
   * @private
   */
  _combineChunkResults(chunkResults, allSpeakers) {
    if (!chunkResults || chunkResults.length === 0) {
      return { text: '', segments: [], speakers: [] };
    }

    // Combine all text
    const fullText = chunkResults
      .map((result) => result.text || '')
      .join(' ')
      .trim();

    // Combine all segments
    const allSegments = [];
    for (const result of chunkResults) {
      if (result.segments && Array.isArray(result.segments)) {
        allSegments.push(...result.segments);
      }
    }

    // Sort segments by start time
    allSegments.sort((a, b) => a.start - b.start);

    return {
      text: fullText,
      segments: allSegments,
      speakers: Array.from(allSpeakers),
      chunked: true,
      chunkCount: chunkResults.length
    };
  }

  /**
   * Map speaker IDs to human-readable names
   *
   * @param {object} result - Raw transcription result
   * @param {object} speakerMap - Map of speaker IDs to names
   * @returns {TranscriptionResult} Result with mapped speaker names
   * @private
   */
  _mapSpeakersToNames(result, speakerMap = {}) {
    if (!result) {
      return { text: '', segments: [], speakers: [] };
    }

    // If no segments, return basic result
    if (!result.segments || !Array.isArray(result.segments)) {
      return {
        text: result.text || '',
        segments: [],
        speakers: [],
        raw: result
      };
    }

    // Collect unique speaker IDs
    const uniqueSpeakers = new Set();

    // Map segments with speaker names
    const mappedSegments = result.segments.map((segment) => {
      const originalSpeaker = segment.speaker || 'Unknown';

      // Only add to uniqueSpeakers if there's a speaker
      if (segment.speaker) {
        uniqueSpeakers.add(originalSpeaker);
      }

      // Look up speaker name in map, use original ID if not found
      const mappedName = speakerMap[originalSpeaker] || originalSpeaker;

      return {
        speaker: mappedName,
        originalSpeaker: originalSpeaker,
        text: segment.text || '',
        start: segment.start || 0,
        end: segment.end || 0
      };
    });

    // Build speaker list with mapping info
    const speakers = Array.from(uniqueSpeakers).map((speakerId) => ({
      id: speakerId,
      name: speakerMap[speakerId] || speakerId,
      isMapped: Boolean(speakerMap[speakerId])
    }));

    return {
      text: result.text || '',
      segments: mappedSegments,
      speakers: speakers,
      language: result.language,
      duration: result.duration,
      chunked: result.chunked,
      chunkCount: result.chunkCount,
      raw: result
    };
  }

  /**
   * Set the default speaker mapping
   *
   * @param {object} speakerMap - Map of speaker IDs to names
   * @example
   * service.setSpeakerMap({
   *   'SPEAKER_00': 'Game Master',
   *   'SPEAKER_01': 'Player 1',
   *   'SPEAKER_02': 'Player 2'
   * });
   */
  setSpeakerMap(speakerMap) {
    this._defaultSpeakerMap = speakerMap || {};
    this._logger.debug(
      `Updated speaker map with ${Object.keys(this._defaultSpeakerMap).length} entries`
    );
  }

  /**
   * Get the current speaker mapping
   *
   * @returns {object} Current speaker map
   */
  getSpeakerMap() {
    return { ...this._defaultSpeakerMap };
  }

  /**
   * Set the default transcription language
   *
   * @param {string|null} language - ISO language code or null for auto-detect
   */
  setLanguage(language) {
    this._defaultLanguage = language;
    this._logger.debug(`Set default language: ${language || 'auto-detect'}`);
  }

  /**
   * Get the current default language
   *
   * @returns {string|null} Current default language
   */
  getLanguage() {
    return this._defaultLanguage;
  }

  /**
   * Transcribe with basic settings (simplified interface)
   * Useful for quick transcription without speaker identification
   *
   * @param {Blob} audioBlob - Audio to transcribe
   * @param {string} [language] - Language code
   * @returns {Promise<object>} Basic transcription result
   */
  async transcribeBasic(audioBlob, language = null) {
    this._logger.debug('transcribeBasic called', { blobSize: audioBlob?.size, language });
    return this.transcribe(audioBlob, {
      responseFormat: LocalWhisperResponseFormat.TEXT,
      language: language || this._defaultLanguage
    });
  }

  /**
   * Check if the backend supports speaker diarization
   * Queries the backend for capabilities if not already cached
   *
   * @returns {Promise<boolean>} True if diarization is supported
   */
  async checkDiarizationSupport() {
    this._logger.debug('checkDiarizationSupport called');
    if (this._supportsDiarization !== null) {
      this._logger.debug('checkDiarizationSupport: returning cached value', { supportsDiarization: this._supportsDiarization });
      return this._supportsDiarization;
    }

    try {
      const serverInfo = await this._backend.getServerInfo();

      if (serverInfo && serverInfo.capabilities) {
        this._supportsDiarization = Boolean(serverInfo.capabilities.diarization);
      } else {
        // Assume no diarization support if server info not available
        this._supportsDiarization = false;
      }

      this._logger.debug(`Backend diarization support: ${this._supportsDiarization}`);
      return this._supportsDiarization;
    } catch {
      this._logger.debug('Could not determine diarization support, assuming false');
      this._supportsDiarization = false;
      return false;
    }
  }

  /**
   * Get supported languages for transcription
   * Note: This returns Whisper's standard language support
   * Actual backend may support a subset depending on loaded models
   *
   * @returns {Array<object>} List of supported languages
   */
  static getSupportedLanguages() {
    return [
      { code: '', name: 'Auto-detect' },
      { code: 'en', name: 'English' },
      { code: 'it', name: 'Italiano' },
      { code: 'es', name: 'Español' },
      { code: 'de', name: 'Deutsch' },
      { code: 'fr', name: 'Français' },
      { code: 'pt', name: 'Português' },
      { code: 'pl', name: 'Polski' },
      { code: 'nl', name: 'Nederlands' },
      { code: 'ja', name: '日本語' },
      { code: 'zh', name: '中文' },
      { code: 'ru', name: 'Русский' },
      { code: 'ko', name: '한국어' },
      { code: 'ar', name: 'العربية' }
    ];
  }

  /**
   * Estimate transcription time for an audio file
   * Local transcription speed depends on hardware and model
   *
   * @param {Blob} audioBlob - Audio to estimate time for
   * @param {object} [options] - Estimation options
   * @param {number} [options.realtimeFactor=0.5] - Estimation factor (0.5 = 2x faster than realtime)
   * @returns {object} Time estimate
   */
  estimateTranscriptionTime(audioBlob, options = {}) {
    const estimatedDuration = AudioUtils.estimateDuration(audioBlob);
    const realtimeFactor = options.realtimeFactor ?? 0.5; // Default: 2x faster than realtime

    const estimatedSeconds = estimatedDuration * realtimeFactor;

    return {
      audioLengthSeconds: estimatedDuration,
      estimatedTranscriptionSeconds: estimatedSeconds,
      realtimeFactor,
      note: 'Actual time depends on hardware and model size'
    };
  }
}

/**
 * @typedef {object} TranscriptionResult
 * @property {string} text - Full transcription text
 * @property {Array<TranscriptionSegment>} segments - Speaker-labeled segments
 * @property {Array<SpeakerInfo>} speakers - List of identified speakers
 * @property {string} [language] - Detected or specified language
 * @property {number} [duration] - Audio duration in seconds
 * @property {boolean} [chunked] - Whether transcription was chunked
 * @property {number} [chunkCount] - Number of chunks if chunked
 * @property {object} [raw] - Raw backend response
 */

/**
 * @typedef {object} TranscriptionSegment
 * @property {string} speaker - Speaker name (mapped or original ID)
 * @property {string} originalSpeaker - Original speaker ID from backend
 * @property {string} text - Segment text
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 */

/**
 * @typedef {object} SpeakerInfo
 * @property {string} id - Original speaker ID from backend
 * @property {string} name - Mapped name or original ID
 * @property {boolean} isMapped - Whether a custom name was applied
 */

// Export the class and enums
export { LocalWhisperService, LocalWhisperResponseFormat, LOCAL_TRANSCRIPTION_TIMEOUT_MS };
