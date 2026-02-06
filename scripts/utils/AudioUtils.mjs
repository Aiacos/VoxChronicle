/**
 * AudioUtils - Audio Processing Utility for VoxChronicle
 *
 * Provides MIME type detection, blob conversion, and audio format
 * validation for browser-based audio recording and transcription.
 *
 * Supports multiple audio formats with automatic fallback based
 * on browser MediaRecorder support.
 *
 * @class AudioUtils
 * @module vox-chronicle
 */

import { Logger } from './Logger.mjs';

/**
 * Supported audio MIME types in order of preference
 * webm/opus is preferred for OpenAI transcription compatibility
 * @constant {Array<Object>}
 */
const SUPPORTED_MIME_TYPES = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm', name: 'WebM Opus' },
  { mimeType: 'audio/webm', extension: 'webm', name: 'WebM' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', name: 'Ogg Opus' },
  { mimeType: 'audio/ogg', extension: 'ogg', name: 'Ogg' },
  { mimeType: 'audio/mp4', extension: 'mp4', name: 'MP4 AAC' },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', name: 'M4A AAC' },
  { mimeType: 'audio/wav', extension: 'wav', name: 'WAV' },
  { mimeType: 'audio/mpeg', extension: 'mp3', name: 'MP3' }
];

/**
 * Maximum file size for OpenAI transcription API (25MB)
 * @constant {number}
 */
const MAX_TRANSCRIPTION_SIZE = 25 * 1024 * 1024;

/**
 * AudioUtils utility class for audio processing
 * Provides static methods for MIME type detection, format conversion, and validation
 */
class AudioUtils {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  static _logger = Logger.createChild('AudioUtils');

  /**
   * Get the best supported MIME type for audio recording
   * Tests MediaRecorder support and returns the first supported type
   *
   * @returns {string|null} The supported MIME type, or null if none supported
   */
  static getSupportedMimeType() {
    // Check if MediaRecorder is available
    if (typeof MediaRecorder === 'undefined') {
      AudioUtils._logger.error('MediaRecorder API is not available in this browser');
      return null;
    }

    for (const format of SUPPORTED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(format.mimeType)) {
        AudioUtils._logger.debug(`Found supported MIME type: ${format.mimeType}`);
        return format.mimeType;
      }
    }

    AudioUtils._logger.warn('No preferred MIME type supported, falling back to browser default');
    return null;
  }

  /**
   * Check if a specific MIME type is supported by MediaRecorder
   *
   * @param {string} mimeType - The MIME type to check
   * @returns {boolean} True if the MIME type is supported
   */
  static isTypeSupported(mimeType) {
    if (typeof MediaRecorder === 'undefined') {
      return false;
    }
    return MediaRecorder.isTypeSupported(mimeType);
  }

  /**
   * Get all supported MIME types for the current browser
   *
   * @returns {Array<Object>} Array of supported format objects with mimeType, extension, and name
   */
  static getAllSupportedTypes() {
    if (typeof MediaRecorder === 'undefined') {
      return [];
    }

    return SUPPORTED_MIME_TYPES.filter(format =>
      MediaRecorder.isTypeSupported(format.mimeType)
    );
  }

  /**
   * Get file extension for a MIME type
   *
   * @param {string} mimeType - The MIME type
   * @returns {string} The file extension (without dot)
   */
  static getExtensionForMimeType(mimeType) {
    // Extract base type without codecs
    const baseType = mimeType.split(';')[0].toLowerCase();

    for (const format of SUPPORTED_MIME_TYPES) {
      if (format.mimeType.startsWith(baseType)) {
        return format.extension;
      }
    }

    // Default extensions for common types
    const defaultExtensions = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/wave': 'wav'
    };

    return defaultExtensions[baseType] || 'audio';
  }

  /**
   * Create a Blob from audio chunks with proper MIME type
   *
   * @param {Array<Blob|ArrayBuffer>} chunks - Array of audio data chunks
   * @param {string} [mimeType] - The MIME type for the blob (defaults to detected type)
   * @returns {Blob} The combined audio Blob
   */
  static createAudioBlob(chunks, mimeType = null) {
    const effectiveMimeType = mimeType || AudioUtils.getSupportedMimeType() || 'audio/webm';

    AudioUtils._logger.debug(`Creating audio blob with ${chunks.length} chunks, type: ${effectiveMimeType}`);

    return new Blob(chunks, { type: effectiveMimeType });
  }

  /**
   * Convert an audio Blob to a File object with proper naming
   *
   * @param {Blob} blob - The audio Blob
   * @param {string} [baseName='recording'] - The base filename (without extension)
   * @returns {File} The File object
   */
  static blobToFile(blob, baseName = 'recording') {
    const extension = AudioUtils.getExtensionForMimeType(blob.type);
    const filename = `${baseName}.${extension}`;

    return new File([blob], filename, { type: blob.type });
  }

  /**
   * Convert a Blob to a base64 data URL
   *
   * @param {Blob} blob - The Blob to convert
   * @returns {Promise<string>} The base64 data URL
   */
  static async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(new Error('Failed to convert blob to base64'));
      };

      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert a Blob to an ArrayBuffer
   *
   * @param {Blob} blob - The Blob to convert
   * @returns {Promise<ArrayBuffer>} The ArrayBuffer
   */
  static async blobToArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(new Error('Failed to convert blob to ArrayBuffer'));
      };

      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Convert a base64 data URL to a Blob
   *
   * @param {string} dataUrl - The base64 data URL
   * @returns {Blob} The Blob object
   */
  static base64ToBlob(dataUrl) {
    // Extract MIME type and base64 data
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Decode base64
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Check if a blob size is within the OpenAI transcription limit
   *
   * @param {Blob} blob - The audio Blob
   * @returns {boolean} True if within size limit
   */
  static isWithinSizeLimit(blob) {
    return blob.size <= MAX_TRANSCRIPTION_SIZE;
  }

  /**
   * Get the size of a blob in megabytes
   *
   * @param {Blob} blob - The Blob
   * @returns {number} Size in megabytes (rounded to 2 decimal places)
   */
  static getBlobSizeMB(blob) {
    return Math.round((blob.size / (1024 * 1024)) * 100) / 100;
  }

  /**
   * Calculate approximate recording duration from blob size
   * Based on typical bitrates for different formats
   *
   * @param {Blob} blob - The audio Blob
   * @returns {number} Estimated duration in seconds
   */
  static estimateDuration(blob) {
    // Approximate bitrates in bytes per second
    const bitrates = {
      'audio/webm': 16000,   // ~128 kbps
      'audio/ogg': 16000,    // ~128 kbps
      'audio/mp4': 16000,    // ~128 kbps
      'audio/mpeg': 16000,   // ~128 kbps
      'audio/wav': 176400    // 16-bit 44.1kHz stereo
    };

    const baseType = blob.type.split(';')[0];
    const bitrate = bitrates[baseType] || 16000;

    return Math.round(blob.size / bitrate);
  }

  /**
   * Format duration in seconds to human-readable string
   *
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration (e.g., "1:23:45" or "23:45")
   */
  static formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Validate that a blob contains audio data
   *
   * @param {Blob} blob - The Blob to validate
   * @returns {boolean} True if the blob appears to contain valid audio
   */
  static isValidAudioBlob(blob) {
    if (!blob || !(blob instanceof Blob)) {
      return false;
    }

    if (blob.size === 0) {
      return false;
    }

    // Check MIME type
    const type = blob.type.toLowerCase();
    return type.startsWith('audio/') || type === 'application/ogg';
  }

  /**
   * Get MediaRecorder options for optimal recording quality
   *
   * @param {Object} [options] - Override options
   * @param {string} [options.mimeType] - Specific MIME type to use
   * @param {number} [options.audioBitsPerSecond] - Audio bitrate
   * @returns {Object} MediaRecorder options
   */
  static getRecorderOptions(options = {}) {
    const mimeType = options.mimeType || AudioUtils.getSupportedMimeType();

    const recorderOptions = {
      audioBitsPerSecond: options.audioBitsPerSecond || 128000 // 128 kbps default
    };

    if (mimeType) {
      recorderOptions.mimeType = mimeType;
    }

    return recorderOptions;
  }

  /**
   * Create an audio element for playback from a blob
   *
   * @param {Blob} blob - The audio Blob
   * @returns {HTMLAudioElement} The audio element
   */
  static createAudioElement(blob) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    // Clean up object URL when audio is no longer needed
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
    }, { once: true });

    return audio;
  }

  /**
   * Get the maximum file size for transcription (in bytes)
   *
   * @returns {number} Maximum file size
   */
  static getMaxTranscriptionSize() {
    return MAX_TRANSCRIPTION_SIZE;
  }

  /**
   * Get browser audio capabilities report
   *
   * @returns {Object} Browser capabilities report
   */
  static getBrowserCapabilities() {
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const supportedTypes = AudioUtils.getAllSupportedTypes();
    const preferredType = AudioUtils.getSupportedMimeType();

    return {
      mediaRecorderSupported: hasMediaRecorder,
      getUserMediaSupported: hasGetUserMedia,
      supportedFormats: supportedTypes,
      preferredFormat: preferredType,
      canRecord: hasMediaRecorder && hasGetUserMedia && supportedTypes.length > 0
    };
  }
}

// Export the AudioUtils class and constants
export { AudioUtils, SUPPORTED_MIME_TYPES, MAX_TRANSCRIPTION_SIZE };
