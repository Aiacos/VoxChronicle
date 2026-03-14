/**
 * SpeakerUtils - Utility functions for speaker label management
 *
 * Extracted from SpeakerLabeling UI class to avoid layer violation
 * (orchestration → UI dependency). These are pure utility functions
 * that only depend on Settings.
 *
 * @module vox-chronicle
 */

import { Logger } from './Logger.mjs';
import { Settings } from '../core/Settings.mjs';

const logger = Logger.createChild('SpeakerUtils');

/**
 * Register newly detected speaker IDs in Foundry settings
 * @param {Array<string>} speakerIds - Speaker IDs from transcription
 * @returns {Promise<void>}
 */
export async function addKnownSpeakers(speakerIds) {
  if (!speakerIds || !Array.isArray(speakerIds)) return;

  try {
    const knownSpeakers = Settings.get('knownSpeakers') || [];
    const newSpeakers = speakerIds.filter((id) => id && !knownSpeakers.includes(id));

    if (newSpeakers.length > 0) {
      knownSpeakers.push(...newSpeakers);
      await Settings.set('knownSpeakers', knownSpeakers);
      logger.debug(`Added ${newSpeakers.length} known speakers`);
    }
  } catch (error) {
    logger.warn('Failed to add known speakers:', error);
  }
}

/**
 * Get the display label for a speaker ID
 * @param {string} speakerId - The speaker ID (e.g., "SPEAKER_00")
 * @returns {string} The label or the original ID if no label set
 */
export function getSpeakerLabel(speakerId) {
  const labels = Settings.getSpeakerLabels();
  return labels[speakerId] || speakerId;
}

/**
 * Apply saved speaker labels to transcript segments
 * @param {Array} segments - Array of transcript segments with speaker property
 * @returns {Array} Segments with speaker labels applied
 */
export function applyLabelsToSegments(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  const labels = Settings.getSpeakerLabels() || {};

  return segments.map((segment) => {
    const updatedSegment = { ...segment };

    if (segment.speaker && labels[segment.speaker]) {
      updatedSegment.speaker = labels[segment.speaker];
    }

    return updatedSegment;
  });
}
