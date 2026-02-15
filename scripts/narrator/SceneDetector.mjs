/**
 * SceneDetector - Analyzes conversation text to detect scene transitions
 *
 * Ported from Narrator Master's scene-detector.js.
 * Uses regex pattern matching to identify location changes, time skips,
 * combat transitions, and scene types from conversation text.
 * Supports both Italian and English language patterns.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Scene type constants
 * @constant {Object}
 */
export const SCENE_TYPES = {
  EXPLORATION: 'exploration',
  COMBAT: 'combat',
  SOCIAL: 'social',
  REST: 'rest',
  UNKNOWN: 'unknown'
};

/**
 * @typedef {Object} SceneTransition
 * @property {boolean} detected - Whether a scene transition was detected
 * @property {string} type - The type of transition (location, time, combat, combat_end, none)
 * @property {number} confidence - Confidence score 0-1
 * @property {string} trigger - The text pattern that triggered the detection
 * @property {string} sceneType - The identified scene type
 */

/**
 * @typedef {Object} SceneDetectionOptions
 * @property {string} [sensitivity='medium'] - Detection sensitivity (low, medium, high)
 * @property {number} [minimumConfidence=0.6] - Minimum confidence to report transition
 * @property {boolean} [enableCombatDetection=true] - Enable combat scene detection
 * @property {boolean} [enableTimeDetection=true] - Enable time skip detection
 * @property {boolean} [enableLocationDetection=true] - Enable location change detection
 */

/**
 * SceneDetector - Analyzes conversation text to detect scene transitions and types.
 *
 * Uses pattern matching to identify location changes, time skips, and combat
 * transitions. Supports Italian language patterns with configurable sensitivity.
 */
export class SceneDetector {
  /**
   * Creates a new SceneDetector instance
   * @param {SceneDetectionOptions} [options={}] - Configuration options
   */
  constructor(options = {}) {
    /** @private */
    this._log = Logger.createChild('SceneDetector');

    /** @private */
    this._sensitivity = options.sensitivity || 'medium';

    /** @private */
    this._minimumConfidence = options.minimumConfidence || 0.6;

    /** @private */
    this._enableCombatDetection = options.enableCombatDetection !== false;

    /** @private */
    this._enableTimeDetection = options.enableTimeDetection !== false;

    /** @private */
    this._enableLocationDetection = options.enableLocationDetection !== false;

    /** @private */
    this._currentSceneType = SCENE_TYPES.UNKNOWN;

    /** @private */
    this._sceneHistory = [];

    /** @private */
    this._maxHistorySize = 20;

    // Initialize pattern sets
    this._initializePatterns();

    this._log.debug('SceneDetector initialized', { sensitivity: this._sensitivity });
  }

  /**
   * Checks if the detector is configured (always true for pattern-based detection)
   * @returns {boolean} True if the detector is ready to use
   */
  isConfigured() {
    return true;
  }

  /**
   * Sets the detection sensitivity level
   * @param {string} sensitivity - 'low', 'medium', or 'high'
   */
  setSensitivity(sensitivity) {
    if (['low', 'medium', 'high'].includes(sensitivity)) {
      this._sensitivity = sensitivity;
      this._updateConfidenceThreshold();
      this._log.debug('Sensitivity updated', { sensitivity, threshold: this._minimumConfidence });
    }
  }

  /**
   * Gets the current sensitivity setting
   * @returns {string} The sensitivity level
   */
  getSensitivity() {
    return this._sensitivity;
  }

  /**
   * Detects scene transitions from conversation text
   * @param {string} text - The current conversation text
   * @param {string} [_previousText=''] - Previous text for context (reserved for future use)
   * @returns {SceneTransition} The scene transition detection result
   */
  detectSceneTransition(text, _previousText = '') {
    if (!text || typeof text !== 'string') {
      return {
        detected: false,
        type: 'none',
        confidence: 0,
        trigger: '',
        sceneType: SCENE_TYPES.UNKNOWN
      };
    }

    const transitions = [];

    // Check location changes
    if (this._enableLocationDetection) {
      const locationTransition = this._checkPatterns(text, this._locationPatterns, 'location');
      if (locationTransition.detected) {
        transitions.push(locationTransition);
      }
    }

    // Check time skips
    if (this._enableTimeDetection) {
      const timeTransition = this._checkPatterns(text, this._timePatterns, 'time');
      if (timeTransition.detected) {
        transitions.push(timeTransition);
      }
    }

    // Check combat transitions
    if (this._enableCombatDetection) {
      const combatTransition = this._checkPatterns(text, this._combatPatterns, 'combat');
      if (combatTransition.detected) {
        transitions.push(combatTransition);
      }

      // Check combat end (only if currently in combat)
      if (this._currentSceneType === SCENE_TYPES.COMBAT) {
        const combatEndTransition = this._checkPatterns(text, this._combatEndPatterns, 'combat_end');
        if (combatEndTransition.detected) {
          transitions.push(combatEndTransition);
        }
      }
    }

    // Return highest confidence transition
    if (transitions.length > 0) {
      const bestTransition = transitions.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      if (bestTransition.confidence >= this._minimumConfidence) {
        this._updateSceneHistory(bestTransition.sceneType, text);
        this._currentSceneType = bestTransition.sceneType;
        this._log.debug('Scene transition detected', {
          type: bestTransition.type,
          sceneType: bestTransition.sceneType,
          confidence: bestTransition.confidence
        });
        return bestTransition;
      }
    }

    return {
      detected: false,
      type: 'none',
      confidence: 0,
      trigger: '',
      sceneType: this._currentSceneType
    };
  }

  /**
   * Identifies the scene type from conversation text
   * @param {string} text - The conversation text to analyze
   * @returns {string} The identified scene type (exploration, combat, social, rest, unknown)
   */
  identifySceneType(text) {
    if (!text || typeof text !== 'string') {
      return SCENE_TYPES.UNKNOWN;
    }

    const scores = {
      [SCENE_TYPES.EXPLORATION]: 0,
      [SCENE_TYPES.COMBAT]: 0,
      [SCENE_TYPES.SOCIAL]: 0,
      [SCENE_TYPES.REST]: 0
    };

    // Score each scene type based on keyword matches
    for (const [sceneType, patterns] of Object.entries(this._sceneTypeKeywords)) {
      for (const { pattern, weight } of patterns) {
        if (pattern.test(text)) {
          scores[sceneType] += weight;
        }
      }
    }

    // Find the scene type with highest score
    let bestType = SCENE_TYPES.UNKNOWN;
    let bestScore = 0;

    for (const [sceneType, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = sceneType;
      }
    }

    // Require minimum score to classify
    if (bestScore < 0.5) {
      return SCENE_TYPES.UNKNOWN;
    }

    return bestType;
  }

  /**
   * Gets the current scene type
   * @returns {string} The current scene type
   */
  getCurrentSceneType() {
    return this._currentSceneType;
  }

  /**
   * Manually sets the current scene type
   * @param {string} sceneType - The scene type to set
   */
  setCurrentSceneType(sceneType) {
    if (Object.values(SCENE_TYPES).includes(sceneType)) {
      this._currentSceneType = sceneType;
      this._updateSceneHistory(sceneType, '');
      this._log.debug('Scene type manually set', { sceneType });
    }
  }

  /**
   * Gets the scene transition history
   * @returns {Array<{type: string, timestamp: number, text: string}>} The scene history
   */
  getTransitionHistory() {
    return [...this._sceneHistory];
  }

  /**
   * Alias for getTransitionHistory (backward compatibility)
   * @returns {Array<{type: string, timestamp: number, text: string}>} The scene history
   */
  getSceneHistory() {
    return this.getTransitionHistory();
  }

  /**
   * Clears the scene history and resets current scene type
   */
  clearHistory() {
    this._sceneHistory = [];
    this._currentSceneType = SCENE_TYPES.UNKNOWN;
    this._log.debug('Scene history cleared');
  }

  /**
   * Enables or disables specific detection features
   * @param {Object} features - Feature flags
   * @param {boolean} [features.combat] - Enable combat detection
   * @param {boolean} [features.time] - Enable time detection
   * @param {boolean} [features.location] - Enable location detection
   */
  setFeatures(features) {
    if (typeof features.combat === 'boolean') {
      this._enableCombatDetection = features.combat;
    }
    if (typeof features.time === 'boolean') {
      this._enableTimeDetection = features.time;
    }
    if (typeof features.location === 'boolean') {
      this._enableLocationDetection = features.location;
    }
  }

  /**
   * Gets the current feature flags
   * @returns {Object} The feature flags
   */
  getFeatures() {
    return {
      combat: this._enableCombatDetection,
      time: this._enableTimeDetection,
      location: this._enableLocationDetection
    };
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Updates confidence threshold based on sensitivity
   * @private
   */
  _updateConfidenceThreshold() {
    switch (this._sensitivity) {
      case 'low':
        this._minimumConfidence = 0.8;
        break;
      case 'medium':
        this._minimumConfidence = 0.6;
        break;
      case 'high':
        this._minimumConfidence = 0.4;
        break;
    }
  }

  /**
   * Checks text against a set of patterns and returns the best match
   * @param {string} text - The text to check
   * @param {Array<{pattern: RegExp, sceneType: string, weight: number}>} patterns - Patterns to match
   * @param {string} transitionType - The type of transition being checked
   * @returns {SceneTransition} The transition detection result
   * @private
   */
  _checkPatterns(text, patterns, transitionType) {
    let bestMatch = null;
    let highestWeight = 0;

    for (const { pattern, sceneType, weight } of patterns) {
      const match = text.match(pattern);
      if (match && weight > highestWeight) {
        highestWeight = weight;
        bestMatch = {
          detected: true,
          type: transitionType,
          confidence: weight,
          trigger: match[0],
          sceneType
        };
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    return {
      detected: false,
      type: transitionType,
      confidence: 0,
      trigger: '',
      sceneType: SCENE_TYPES.UNKNOWN
    };
  }

  /**
   * Updates scene history with a new scene entry
   * @param {string} sceneType - The scene type
   * @param {string} text - The text that triggered the scene
   * @private
   */
  _updateSceneHistory(sceneType, text) {
    this._sceneHistory.push({
      type: sceneType,
      timestamp: Date.now(),
      text: text.substring(0, 100) // Store first 100 chars for context
    });

    // Trim history if needed
    if (this._sceneHistory.length > this._maxHistorySize) {
      this._sceneHistory.shift();
    }
  }

  /**
   * Initializes all pattern sets for scene detection
   * @private
   */
  _initializePatterns() {
    // Location change patterns (Italian)
    this._locationPatterns = [
      // Entering locations
      {
        pattern: /\b(entrat[eio]|entrano|entri)\s+(nel|nella|in|al|alla)\s+\w+/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.9
      },
      {
        pattern: /\b(arriv(at[eio]|ano|i))\s+(a|al|alla|nel|nella)\s+\w+/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.9
      },
      {
        pattern: /\b(raggiung(ete|ono|i))\s+(il|la|l')\s*\w+/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.8
      },
      {
        pattern: /\b(vi trovate|ti trovi|ci troviamo)\s+(in|a|nel|nella)\s+\w+/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.8
      },
      {
        pattern: /\b(attraversat[eio]|attraversano|attraversi)\s+\w+/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.7
      },
      // Social locations
      {
        pattern: /\b(taverna|locanda|inn|osteria|bar)/i,
        sceneType: SCENE_TYPES.SOCIAL,
        weight: 0.8
      },
      {
        pattern: /\b(incontr(ate|ano|i)|incontro)\s+(un|una|il|la|dei|delle)\s+\w+/i,
        sceneType: SCENE_TYPES.SOCIAL,
        weight: 0.7
      },
      {
        pattern: /\b(parl(ate|ano|i)|parla|conversazione|dialogo)\s+con\s+\w+/i,
        sceneType: SCENE_TYPES.SOCIAL,
        weight: 0.7
      },
      // Rest locations
      {
        pattern: /\b(campo|accampamento|riposo|dormire|sonno)/i,
        sceneType: SCENE_TYPES.REST,
        weight: 0.8
      },
      {
        pattern: /\b(vi riposat[eio]|ti riposi|ci riposiamo)/i,
        sceneType: SCENE_TYPES.REST,
        weight: 0.9
      }
    ];

    // Time skip patterns (Italian)
    this._timePatterns = [
      {
        pattern: /\b(il giorno dopo|l'indomani|il mattino seguente|la mattina dopo)/i,
        sceneType: SCENE_TYPES.REST,
        weight: 0.9
      },
      {
        pattern: /\b(dopo\s+(ore|giorni|settimane|mesi))/i,
        sceneType: SCENE_TYPES.UNKNOWN,
        weight: 0.8
      },
      {
        pattern: /\b(ore dopo|ore più tardi|più tardi)/i,
        sceneType: SCENE_TYPES.UNKNOWN,
        weight: 0.7
      },
      {
        pattern: /\b(la mattina|il pomeriggio|la sera|la notte|l'alba|il tramonto)/i,
        sceneType: SCENE_TYPES.UNKNOWN,
        weight: 0.6
      },
      {
        pattern: /\b(passa(no|te)?\s+(il|la|i|le)\s+(tempo|ore|giorni))/i,
        sceneType: SCENE_TYPES.UNKNOWN,
        weight: 0.7
      },
      {
        pattern: /\b(dopo un riposo|dopo aver riposato|al risveglio)/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.8
      }
    ];

    // Combat start patterns (Italian)
    this._combatPatterns = [
      {
        pattern: /\b(tira(te)? l'iniziativa|roll initiative|iniziativa)/i,
        sceneType: SCENE_TYPES.COMBAT,
        weight: 1.0
      },
      {
        pattern: /\b(entra(te|no|no)? in combattimento|inizia il combattimento)/i,
        sceneType: SCENE_TYPES.COMBAT,
        weight: 1.0
      },
      {
        pattern: /\b(attacc(ate|ano|a)|attacco)/i,
        sceneType: SCENE_TYPES.COMBAT,
        weight: 0.9
      },
      {
        pattern: /\b(combat(te|ti|tiamo)|battaglia|scontro)/i,
        sceneType: SCENE_TYPES.COMBAT,
        weight: 0.8
      },
      {
        pattern: /\b(il nemico|i nemici|il mostro|i mostri)\s+(attacc(a|ano)|si avvicin(a|ano))/i,
        sceneType: SCENE_TYPES.COMBAT,
        weight: 0.9
      }
    ];

    // Combat end patterns (Italian)
    this._combatEndPatterns = [
      {
        pattern: /\b(fine del combattimento|combattimento terminato|battaglia finita)/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 1.0
      },
      {
        pattern: /\b(vince(te)?|vincono|vittoria|sconfitt[oi])/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.8
      },
      {
        pattern: /\b(il nemico è morto|i nemici sono morti|tutti i nemici sono)/i,
        sceneType: SCENE_TYPES.EXPLORATION,
        weight: 0.9
      }
    ];

    // Scene type keywords for classification
    this._sceneTypeKeywords = {
      [SCENE_TYPES.EXPLORATION]: [
        { pattern: /\b(esplor(are|ate|ano|a)|scoprire|cercare|investigare)/i, weight: 0.7 },
        { pattern: /\b(dungeon|caverna|foresta|montagna|sentiero|strada)/i, weight: 0.6 },
        { pattern: /\b(trova(te|no|re)|scopr(ite|ono|ire))/i, weight: 0.6 }
      ],
      [SCENE_TYPES.COMBAT]: [
        { pattern: /\b(danno|danni|colp(ire|isce|ito)|tiro per colpire)/i, weight: 0.8 },
        { pattern: /\b(arm(atura|i|a)|scudo|spada|arco|magia)/i, weight: 0.5 },
        { pattern: /\b(punt[oi] ferita|hp|salute)/i, weight: 0.7 }
      ],
      [SCENE_TYPES.SOCIAL]: [
        { pattern: /\b(conversazione|dialogo|negoziare|persuadere|ingannare)/i, weight: 0.8 },
        { pattern: /\b(mercante|venditore|PNG|personaggio|villico)/i, weight: 0.6 },
        { pattern: /\b(compra(re|te)|vende(re|te)|commercio|scambio)/i, weight: 0.7 }
      ],
      [SCENE_TYPES.REST]: [
        { pattern: /\b(riposo|dormire|sonno|ripristinare|guarire)/i, weight: 0.9 },
        { pattern: /\b(lungo riposo|riposo breve|short rest|long rest)/i, weight: 1.0 },
        { pattern: /\b(recuperare|recupero|rigenerare)/i, weight: 0.7 }
      ]
    };
  }
}
