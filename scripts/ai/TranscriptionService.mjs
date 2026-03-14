/**
 * TranscriptionService - Audio Transcription with Speaker Diarization
 *
 * Orchestrates audio transcription via an injected TranscriptionProvider.
 * Handles large audio files by chunking, maps speaker IDs to human-readable
 * names, applies multi-language tagging, and guards against cascading failures
 * via a circuit breaker.
 *
 * The HTTP layer is fully delegated to the provider; all business logic
 * (chunking, speaker mapping, circuit breaker, vocabulary prompts) lives here.
 *
 * @class TranscriptionService
 * @module vox-chronicle
 */

import { OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
import { AudioChunker } from '../audio/AudioChunker.mjs';
import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';
import { VocabularyDictionary } from '../core/VocabularyDictionary.mjs';

/**
 * Transcription model options
 * @enum {string}
 */
const TranscriptionModel = {
  /** GPT-4o with speaker diarization - identifies different speakers */
  GPT4O_DIARIZE: 'gpt-4o-transcribe-diarize',
  /** Standard GPT-4o transcription without diarization */
  GPT4O: 'gpt-4o-transcribe',
  /** Whisper model for basic transcription */
  WHISPER: 'whisper-1'
};

/**
 * Response format options for transcription
 * @enum {string}
 */
const TranscriptionResponseFormat = {
  /** JSON with speaker labels and segments */
  DIARIZED_JSON: 'diarized_json',
  /** Standard JSON response */
  JSON: 'json',
  /** Verbose JSON with timing */
  VERBOSE_JSON: 'verbose_json',
  /** Plain text */
  TEXT: 'text',
  /** SubRip subtitle format */
  SRT: 'srt',
  /** WebVTT format */
  VTT: 'vtt'
};

/**
 * Chunking strategy for long audio files
 * @enum {string}
 */
const ChunkingStrategy = {
  /** Let OpenAI determine optimal chunking */
  AUTO: 'auto',
  /** No chunking (for short audio) */
  NONE: 'none'
};

/**
 * Default timeout for transcription requests (10 minutes).
 * Transcription can take longer than typical API calls.
 * @constant {number}
 */
const TRANSCRIPTION_TIMEOUT_MS = 600000;

/**
 * TranscriptionService orchestrates audio transcription via a TranscriptionProvider.
 *
 * @example
 * const provider = new OpenAITranscriptionProvider('your-api-key');
 * const service = new TranscriptionService(provider, {
 *   defaultLanguage: 'en',
 *   defaultSpeakerMap: { 'SPEAKER_00': 'Game Master', 'SPEAKER_01': 'Player 1' }
 * });
 * const result = await service.transcribe(audioBlob);
 */
class TranscriptionService {
  /**
   * TranscriptionProvider instance used for API calls
   * @type {import('./providers/TranscriptionProvider.mjs').TranscriptionProvider}
   */
  #provider;

  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('TranscriptionService');

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
   * Whether multi-language mode is enabled (auto-detect language per segment)
   * @type {boolean}
   * @private
   */
  _multiLanguageMode = false;

  /**
   * Number of consecutive transcription errors (circuit breaker counter)
   * @type {number}
   * @private
   */
  _consecutiveErrors = 0;

  /**
   * Maximum consecutive errors before circuit breaker opens
   * @type {number}
   * @private
   */
  _maxConsecutiveErrors = 5;

  /**
   * Whether the circuit breaker is open (blocking requests)
   * @type {boolean}
   * @private
   */
  _circuitOpen = false;

  /**
   * Create a new TranscriptionService instance.
   *
   * @param {import('./providers/TranscriptionProvider.mjs').TranscriptionProvider} provider - Transcription provider instance
   * @param {object} [options] - Configuration options
   * @param {string} [options.defaultLanguage] - Default transcription language (e.g., 'en', 'it')
   * @param {object} [options.defaultSpeakerMap] - Default speaker ID to name mapping
   * @param {boolean} [options.multiLanguageMode=false] - Enable multi-language mode with auto-detection
   * @param {number} [options.maxConsecutiveErrors=5] - Max consecutive errors before circuit opens
   */
  constructor(provider, options = {}) {
    this.#provider = provider;

    this._defaultLanguage = options.defaultLanguage || null;
    this._defaultSpeakerMap = options.defaultSpeakerMap || {};
    this._multiLanguageMode = options.multiLanguageMode === true;
    this._maxConsecutiveErrors = options.maxConsecutiveErrors ?? 5;
    this._chunker = new AudioChunker();

    this._logger.debug('TranscriptionService initialized');
  }

  /**
   * Transcribe audio with speaker diarization.
   *
   * @param {Blob|File} audioBlob - Audio file to transcribe
   * @param {object} [options] - Transcription options
   * @param {object} [options.speakerMap] - Map of speaker IDs to names (e.g., {'SPEAKER_00': 'GM'})
   * @param {string} [options.language] - ISO language code (e.g., 'en', 'it', 'es')
   * @param {string} [options.model] - Transcription model to use
   * @param {string} [options.responseFormat] - Response format
   * @param {string} [options.prompt] - Optional context prompt for better accuracy
   * @param {Function} [options.onProgress] - Progress callback for chunked transcription
   * @returns {Promise<TranscriptionResult>} Transcription result with speaker-labeled segments
   */
  async transcribe(audioBlob, options = {}) {
    options = { ...options }; // Prevent mutation of caller's object
    this._logger.debug('transcribe called', {
      blobSize: audioBlob?.size,
      model: options.model,
      language: options.language
    });
    const t0 = Date.now();

    // Circuit breaker check - fail fast if too many consecutive errors
    if (this._isCircuitOpen()) {
      throw new OpenAIError(
        'Circuit breaker is open: too many consecutive transcription failures. ' +
          'Call resetCircuitBreaker() to retry.',
        OpenAIErrorType.API_ERROR
      );
    }

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new OpenAIError(
        'Invalid audio input: expected Blob or File',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    // Validate audio blob
    if (!AudioUtils.isValidAudioBlob(audioBlob)) {
      this._logger.warn('Audio blob may not be valid, attempting transcription anyway');
    }

    // If no custom prompt provided, generate one from vocabulary dictionary.
    // NOTE: The diarization model (gpt-4o-transcribe-diarize) does NOT support
    // the prompt parameter — OpenAI returns HTTP 400 if it's included.
    const effectiveModel = options.model || TranscriptionModel.GPT4O_DIARIZE;
    const isDiarizeModel = effectiveModel === TranscriptionModel.GPT4O_DIARIZE;

    if (!options.prompt && !isDiarizeModel) {
      try {
        const vocabularyDict = new VocabularyDictionary();
        const vocabularyPrompt = vocabularyDict.generatePrompt();

        if (vocabularyPrompt) {
          options.prompt = vocabularyPrompt;
          this._logger.debug('Using vocabulary dictionary for transcription prompt');
        }
      } catch (error) {
        // Don't fail transcription if vocabulary dictionary fails
        this._logger.warn(
          'Failed to generate vocabulary prompt, continuing without it:',
          error.message
        );
      }
    } else if (isDiarizeModel && options.prompt) {
      this._logger.debug('Prompt parameter stripped — not supported by diarization model');
      delete options.prompt;
    }

    try {
      let result;

      // Check if audio exceeds size limit and needs chunking
      if (this._chunker.needsChunking(audioBlob)) {
        result = await this._transcribeChunked(audioBlob, options);
      } else {
        result = await this._transcribeSingle(audioBlob, options);
      }

      // Success - reset circuit breaker counter
      this._consecutiveErrors = 0;

      // If multi-language mode is enabled, tag segments with detected language
      if (this._multiLanguageMode && result.segments) {
        result = this._tagSegmentsWithLanguage(result);
      }

      this._logger.debug(`transcribe completed in ${Date.now() - t0}ms`, {
        segmentCount: result.segments?.length,
        speakerCount: result.speakers?.length,
        textLength: result.text?.length,
        chunked: result.chunked || false
      });
      return result;
    } catch (error) {
      // Increment circuit breaker counter on failure
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
        this._circuitOpen = true;
        this._logger.error(
          `Circuit breaker opened after ${this._consecutiveErrors} consecutive errors`
        );
      }
      this._logger.error(`transcribe failed after ${Date.now() - t0}ms: ${error.message}`, {
        blobSize: audioBlob?.size
      });
      throw error;
    }
  }

  /**
   * Transcribe a single audio blob (under size limit).
   *
   * Delegates the HTTP request to the injected provider and post-processes
   * the normalized `{ text, segments }` response with speaker mapping.
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
    const model = options.model || TranscriptionModel.GPT4O_DIARIZE;
    const isDiarizeModel = model === TranscriptionModel.GPT4O_DIARIZE;

    this._logger.log(
      `Starting transcription: ${AudioUtils.getBlobSizeMB(audioBlob)}MB, model: ${model}`
    );

    // Map service-level options to the provider interface.
    // The provider is responsible for building FormData and calling the API.
    const providerOptions = {
      model,
      diarize: isDiarizeModel
    };

    // Only pass language when not in multi-language auto-detect mode
    if (language && !this._multiLanguageMode) {
      providerOptions.language = language;
      this._logger.debug(`Using language: ${language}`);
    } else if (this._multiLanguageMode) {
      this._logger.debug('Multi-language mode: language parameter omitted for auto-detection');
    }

    // Prompt is only valid for non-diarize models; callers are expected to
    // have already stripped the prompt for diarize models (transcribe() does this).
    if (options.prompt && !isDiarizeModel) {
      providerOptions.prompt = options.prompt;
    }

    try {
      const response = await this.#provider.transcribe(audioBlob, providerOptions);

      // Debug log for troubleshooting empty segments
      this._logger.debug('Provider response:', response);

      // Map speakers to names
      const mappedResult = this._mapSpeakersToNames(response, speakerMap);

      // FAIL-SAFE: If text is present but segments are empty (diarization failed),
      // create a single synthetic segment so the transcript is not lost.
      if (mappedResult.text && mappedResult.segments.length === 0) {
        this._logger.warn(
          'Diarization returned 0 segments despite having text. Creating synthetic segment.'
        );
        mappedResult.segments.push({
          speaker: speakerMap['Unknown'] || 'Unknown',
          originalSpeaker: 'Unknown',
          text: mappedResult.text,
          start: 0,
          end: response.duration || 0
        });
        mappedResult.speakers.push({ id: 'Unknown', name: 'Unknown', isMapped: false });
      }

      this._logger.log(`Transcription completed successfully in ${Date.now() - t0}ms`);
      this._logger.debug('_transcribeSingle result', {
        durationMs: Date.now() - t0,
        segmentCount: mappedResult.segments?.length,
        speakerCount: mappedResult.speakers?.length,
        textLength: mappedResult.text?.length
      });
      return mappedResult;
    } catch (error) {
      this._logger.error(`_transcribeSingle failed after ${Date.now() - t0}ms: ${error.message}`, {
        model,
        blobSizeMB: AudioUtils.getBlobSizeMB(audioBlob)
      });
      throw error;
    }
  }

  /**
   * Transcribe a large audio file by splitting into chunks.
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

      // Transcribe this chunk without speaker mapping.
      // IMPORTANT: We pass an empty speakerMap here because OpenAI's diarization
      // assigns consistent speaker IDs (SPEAKER_00, SPEAKER_01, etc.) across chunks.
      // The same person will get the same ID in each chunk, so we can safely defer
      // the mapping to human-readable names until after all chunks are combined.
      // This ensures speaker continuity across chunk boundaries.
      const chunkResult = await this._transcribeSingle(chunk, {
        ...options,
        speakerMap: {} // Delay mapping until combination phase
      });

      // Track duration offset for proper timing across chunks.
      // Each chunk's timestamps start at 0, so we need to adjust them based on
      // the cumulative duration of previous chunks to maintain chronological order.
      if (chunkResult.segments) {
        chunkResult.segments.forEach((segment) => {
          // Offset timestamps to account for previous chunks
          segment.start += totalDuration;
          segment.end += totalDuration;

          // Collect all unique speaker IDs across all chunks.
          // The diarization model preserves speaker identity between chunks,
          // so SPEAKER_00 in chunk 1 is the same person as SPEAKER_00 in chunk 2.
          if (segment.speaker) {
            allSpeakers.add(segment.speaker);
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

    // Combine all chunk results with properly adjusted timestamps
    const combinedResult = this._combineChunkResults(results, allSpeakers);

    // Apply speaker mapping to the final combined result.
    // By deferring speaker name mapping until this point, we ensure that:
    // 1. All chunks use consistent speaker IDs (SPEAKER_00, SPEAKER_01, etc.)
    // 2. The same speaker gets the same human-readable name across the entire transcription
    // 3. Speaker continuity is preserved even when a speaker appears in multiple chunks
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
   * Combine transcription results from multiple chunks.
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
   * Map speaker IDs to human-readable names.
   *
   * @param {object} result - Raw transcription result from provider
   * @param {object} speakerMap - Map of speaker IDs to names
   * @returns {TranscriptionResult} Result with mapped speaker names
   * @private
   */
  _mapSpeakersToNames(result, speakerMap = {}) {
    // Edge case 4: Empty speakerMap parameter.
    // When no speaker mapping is provided (e.g., during chunked transcription or initial
    // transcription before user has labeled speakers), we default to an empty object.
    // This allows the algorithm to proceed and preserve the original speaker IDs, which
    // can be mapped later via setSpeakerMap() or in a subsequent call to this method.

    if (!result) {
      return { text: '', segments: [], speakers: [] };
    }

    // Edge case 1: No segments in result.
    // OpenAI API may return empty segments for silent audio or transcription failures.
    // Return a valid but empty result structure to prevent downstream code from breaking
    // when trying to iterate over segments that don't exist.
    if (!result.segments || !Array.isArray(result.segments)) {
      return {
        text: result.text || '',
        segments: [],
        speakers: [],
        raw: result
      };
    }

    // Collect unique speaker IDs from all segments.
    // OpenAI diarization returns speaker IDs like "SPEAKER_00", "SPEAKER_01", etc.
    // We use a Set to automatically deduplicate as we encounter the same speaker across segments.
    const uniqueSpeakers = new Set();

    // Map segments with speaker names.
    // For each segment, we replace the AI-generated speaker ID (e.g., "SPEAKER_00")
    // with the human-readable name provided in speakerMap (e.g., "Game Master").
    const mappedSegments = result.segments.map((segment) => {
      // Edge case 3: Missing speaker field in segment.
      // Some segments may lack a speaker field if the audio is unclear or if the diarization
      // model couldn't confidently identify a speaker. Default to "Unknown" to maintain
      // data integrity and prevent undefined values in the output.
      const originalSpeaker = segment.speaker || 'Unknown';

      // Track this speaker ID in our set of unique speakers
      uniqueSpeakers.add(originalSpeaker);

      // Edge case 2: Speaker ID not in map.
      // Users may not have mapped all detected speakers yet, especially in first-time
      // transcriptions or when new speakers join mid-session. Fall back to the original
      // speaker ID (e.g., "SPEAKER_00") so the segment remains identifiable and can be
      // mapped later without losing the speaker identity.
      const mappedName = speakerMap[originalSpeaker] || originalSpeaker;

      const mapped = {
        speaker: mappedName,
        originalSpeaker: originalSpeaker,
        text: segment.text || '',
        start: segment.start ?? 0,
        end: segment.end ?? 0
      };

      // Preserve per-segment language if present (used by multi-language mode)
      if (segment.language) {
        mapped.language = segment.language;
      }

      return mapped;
    });

    // Build speaker list with mapping info.
    // Convert Set to Array and create metadata for each speaker showing
    // both their original ID and mapped name (if any).
    const speakers = Array.from(uniqueSpeakers).map((speakerId) => ({
      id: speakerId, // Original: "SPEAKER_00"
      name: speakerMap[speakerId] || speakerId, // Mapped: "Game Master" or fallback "SPEAKER_00"
      isMapped: Boolean(speakerMap[speakerId]) // True if user provided a custom name
    }));

    const mappedResult = {
      text: result.text || '',
      segments: mappedSegments,
      speakers: speakers,
      language: result.language,
      duration: result.duration,
      raw: result,
      // Preserve chunking metadata if present
      ...(result.chunked !== undefined && { chunked: result.chunked }),
      ...(result.chunkCount !== undefined && { chunkCount: result.chunkCount })
    };

    return mappedResult;
  }

  /**
   * Set the default speaker mapping.
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
   * Get the current speaker mapping.
   *
   * @returns {object} Current speaker map
   */
  getSpeakerMap() {
    return { ...this._defaultSpeakerMap };
  }

  /**
   * Set the default transcription language.
   *
   * @param {string|null} language - ISO language code or null for auto-detect
   */
  setLanguage(language) {
    this._defaultLanguage = language;
    this._logger.debug(`Set default language: ${language || 'auto-detect'}`);
  }

  /**
   * Get the current default language.
   *
   * @returns {string|null} Current default language
   */
  getLanguage() {
    return this._defaultLanguage;
  }

  // ---------------------------------------------------------------------------
  // Multi-language mode
  // ---------------------------------------------------------------------------

  /**
   * Enable or disable multi-language mode.
   *
   * When enabled, the language parameter is omitted from API calls to allow
   * automatic per-segment language detection. After transcription, segments
   * are tagged with their detected language.
   *
   * @param {boolean} enabled - Whether to enable multi-language mode
   */
  setMultiLanguageMode(enabled) {
    this._multiLanguageMode = enabled === true;
    this._logger.debug(`Multi-language mode: ${this._multiLanguageMode ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if multi-language mode is enabled.
   *
   * @returns {boolean} True if multi-language mode is enabled
   */
  isMultiLanguageMode() {
    return this._multiLanguageMode;
  }

  /**
   * Tag segments with detected language information.
   *
   * When multi-language mode is active, each segment's speaker label is
   * augmented with the detected language code, e.g., "Speaker (en): text".
   * Each segment also gets a `language` field from the API response.
   *
   * @param {TranscriptionResult} result - Transcription result to tag
   * @returns {TranscriptionResult} Result with language-tagged segments
   * @private
   */
  _tagSegmentsWithLanguage(result) {
    if (!result.segments || result.segments.length === 0) {
      return result;
    }

    const taggedSegments = result.segments.map((segment) => {
      // Use segment-level language if available, fall back to top-level language
      const segmentLanguage = segment.language || result.language || result.raw?.language;

      return {
        ...segment,
        language: segmentLanguage || undefined,
        // Tag the speaker with detected language for display
        speaker: segmentLanguage ? `${segment.speaker} (${segmentLanguage})` : segment.speaker
      };
    });

    return {
      ...result,
      segments: taggedSegments
    };
  }

  // ---------------------------------------------------------------------------
  // Circuit breaker
  // ---------------------------------------------------------------------------

  /**
   * Check if the circuit breaker is currently open.
   *
   * @returns {boolean} True if the circuit is open (blocking requests)
   * @private
   */
  _isCircuitOpen() {
    return this._circuitOpen;
  }

  /**
   * Manually reset the circuit breaker.
   *
   * Resets the consecutive error counter and closes the circuit,
   * allowing transcription requests to proceed again.
   */
  resetCircuitBreaker() {
    this._consecutiveErrors = 0;
    this._circuitOpen = false;
    this._logger.debug('Circuit breaker reset');
  }

  /**
   * Get the current circuit breaker status.
   *
   * @returns {{ isOpen: boolean, consecutiveErrors: number, maxErrors: number }}
   */
  getCircuitBreakerStatus() {
    return {
      isOpen: this._circuitOpen,
      consecutiveErrors: this._consecutiveErrors,
      maxErrors: this._maxConsecutiveErrors
    };
  }

  /**
   * Transcribe with basic settings (no diarization).
   * Useful for quick transcription without speaker identification.
   *
   * @param {Blob} audioBlob - Audio to transcribe
   * @param {string} [language] - Language code
   * @returns {Promise<object>} Basic transcription result
   */
  async transcribeBasic(audioBlob, language = null) {
    this._logger.debug('transcribeBasic called', { blobSize: audioBlob?.size, language });
    return this.transcribe(audioBlob, {
      model: TranscriptionModel.WHISPER,
      responseFormat: TranscriptionResponseFormat.JSON,
      language: language || this._defaultLanguage
    });
  }

  /**
   * Get supported languages for transcription.
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
      { code: 'zh', name: '中文' }
    ];
  }

  /**
   * Get available transcription models.
   *
   * @returns {Array<object>} List of available models
   */
  static getAvailableModels() {
    return [
      {
        id: TranscriptionModel.GPT4O_DIARIZE,
        name: 'GPT-4o with Diarization',
        description: 'Best quality with speaker identification',
        supportsDiarization: true
      },
      {
        id: TranscriptionModel.GPT4O,
        name: 'GPT-4o',
        description: 'High quality transcription',
        supportsDiarization: false
      },
      {
        id: TranscriptionModel.WHISPER,
        name: 'Whisper',
        description: 'Fast, efficient transcription',
        supportsDiarization: false
      }
    ];
  }

  /**
   * Estimate transcription cost for an audio file.
   *
   * @param {Blob} audioBlob - Audio to estimate cost for
   * @param {string} [model] - Model to use
   * @returns {object} Cost estimate
   */
  estimateCost(audioBlob, model = TranscriptionModel.GPT4O_DIARIZE) {
    const estimatedDuration = AudioUtils.estimateDuration(audioBlob);
    const durationMinutes = estimatedDuration / 60;

    // Pricing as of spec (subject to change)
    const pricePerMinute = 0.006; // $0.006/minute for gpt-4o-transcribe-diarize

    return {
      estimatedDurationSeconds: estimatedDuration,
      estimatedDurationMinutes: durationMinutes,
      estimatedCostUSD: durationMinutes * pricePerMinute,
      model,
      pricePerMinute
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
 * @property {object} [raw] - Raw provider response
 */

/**
 * @typedef {object} TranscriptionSegment
 * @property {string} speaker - Speaker name (mapped or original ID)
 * @property {string} originalSpeaker - Original speaker ID from API
 * @property {string} text - Segment text
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 */

/**
 * @typedef {object} SpeakerInfo
 * @property {string} id - Original speaker ID from API
 * @property {string} name - Mapped name or original ID
 * @property {boolean} isMapped - Whether a custom name was applied
 */

// Export all classes and enums
export {
  TranscriptionService,
  TranscriptionModel,
  TranscriptionResponseFormat,
  ChunkingStrategy,
  TRANSCRIPTION_TIMEOUT_MS
};
