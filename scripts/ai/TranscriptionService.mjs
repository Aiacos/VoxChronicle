/**
 * TranscriptionService - OpenAI Audio Transcription with Speaker Diarization
 *
 * Provides audio transcription using OpenAI's GPT-4o-transcribe-diarize model
 * with support for speaker identification and mapping. Handles large audio files
 * by chunking and includes automatic retry logic for reliability.
 *
 * @class TranscriptionService
 * @module vox-chronicle
 */

import { OpenAIClient, OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
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
 * Default timeout for transcription requests (10 minutes)
 * Transcription can take longer than typical API calls
 * @constant {number}
 */
const TRANSCRIPTION_TIMEOUT_MS = 600000;

/**
 * TranscriptionService class for audio transcription with speaker diarization
 *
 * @augments OpenAIClient
 * @example
 * const service = new TranscriptionService('your-api-key');
 * const result = await service.transcribe(audioBlob, {
 *   language: 'en',
 *   speakerMap: { 'SPEAKER_00': 'Game Master', 'SPEAKER_01': 'Player 1' }
 * });
 */
class TranscriptionService extends OpenAIClient {
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
   * Create a new TranscriptionService instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {object} [options] - Configuration options
   * @param {string} [options.defaultLanguage] - Default transcription language (e.g., 'en', 'it')
   * @param {object} [options.defaultSpeakerMap] - Default speaker ID to name mapping
   * @param {number} [options.timeout=600000] - Request timeout in milliseconds
   */
  constructor(apiKey, options = {}) {
    super(apiKey, {
      ...options,
      timeout: options.timeout || TRANSCRIPTION_TIMEOUT_MS
    });

    this._defaultLanguage = options.defaultLanguage || null;
    this._defaultSpeakerMap = options.defaultSpeakerMap || {};
    this._chunker = new AudioChunker();

    this._logger.debug('TranscriptionService initialized');
  }

  /**
   * Transcribe audio with speaker diarization
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

    // If no custom prompt provided, generate one from vocabulary dictionary
    if (!options.prompt) {
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
    }

    // Check if audio exceeds size limit and needs chunking
    if (this._chunker.needsChunking(audioBlob)) {
      return this._transcribeChunked(audioBlob, options);
    }

    return this._transcribeSingle(audioBlob, options);
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
    const speakerMap = options.speakerMap || this._defaultSpeakerMap;
    const language = options.language || this._defaultLanguage;
    const model = options.model || TranscriptionModel.GPT4O_DIARIZE;
    const responseFormat = options.responseFormat || TranscriptionResponseFormat.DIARIZED_JSON;

    this._logger.log(
      `Starting transcription: ${AudioUtils.getBlobSizeMB(audioBlob)}MB, model: ${model}`
    );

    // Build FormData for multipart/form-data request
    const formData = new FormData();

    // Append audio file
    const audioFile = AudioUtils.blobToFile(audioBlob, 'session');
    formData.append('file', audioFile);

    // Append required parameters
    formData.append('model', model);
    formData.append('response_format', responseFormat);

    // Include chunking_strategy for optimal handling of longer audio
    formData.append('chunking_strategy', ChunkingStrategy.AUTO);

    // Optional: specify language for improved accuracy
    if (language) {
      formData.append('language', language);
      this._logger.debug(`Using language: ${language}`);
    }

    // Optional: context prompt
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    try {
      const response = await this.postFormData('/audio/transcriptions', formData);

      // Map speakers to names
      const mappedResult = this._mapSpeakersToNames(response, speakerMap);

      this._logger.log('Transcription completed successfully');
      return mappedResult;
    } catch (error) {
      this._logger.error('Transcription failed:', error.message);
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

    // Combine all chunk results
    const combinedResult = this._combineChunkResults(results, allSpeakers);

    // Apply speaker mapping to final result
    const speakerMap = options.speakerMap || this._defaultSpeakerMap;
    return this._mapSpeakersToNames(combinedResult, speakerMap);
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
      uniqueSpeakers.add(originalSpeaker);

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

    // Preserve chunking metadata if present
    if (result.chunked !== undefined) {
      mappedResult.chunked = result.chunked;
    }
    if (result.chunkCount !== undefined) {
      mappedResult.chunkCount = result.chunkCount;
    }

    return mappedResult;
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
   * Transcribe with basic settings (no diarization)
   * Useful for quick transcription without speaker identification
   *
   * @param {Blob} audioBlob - Audio to transcribe
   * @param {string} [language] - Language code
   * @returns {Promise<object>} Basic transcription result
   */
  async transcribeBasic(audioBlob, language = null) {
    return this.transcribe(audioBlob, {
      model: TranscriptionModel.WHISPER,
      responseFormat: TranscriptionResponseFormat.JSON,
      language: language || this._defaultLanguage
    });
  }

  /**
   * Get supported languages for transcription
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
   * Get available transcription models
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
   * Estimate transcription cost for an audio file
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
 * @property {object} [raw] - Raw API response
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
