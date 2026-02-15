import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneDetector, SCENE_TYPES } from '../../scripts/narrator/SceneDetector.mjs';

describe('SceneDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new SceneDetector();
  });

  // ---------------------------------------------------------------------------
  // SCENE_TYPES constant
  // ---------------------------------------------------------------------------
  describe('SCENE_TYPES constant', () => {
    it('exports all expected scene type values', () => {
      expect(SCENE_TYPES.EXPLORATION).toBe('exploration');
      expect(SCENE_TYPES.COMBAT).toBe('combat');
      expect(SCENE_TYPES.SOCIAL).toBe('social');
      expect(SCENE_TYPES.REST).toBe('rest');
      expect(SCENE_TYPES.UNKNOWN).toBe('unknown');
    });
  });

  // ---------------------------------------------------------------------------
  // Constructor and configuration
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('creates with default options', () => {
      expect(detector.isConfigured()).toBe(true);
      expect(detector.getSensitivity()).toBe('medium');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('accepts custom sensitivity option', () => {
      const d = new SceneDetector({ sensitivity: 'high' });
      expect(d.getSensitivity()).toBe('high');
    });

    it('accepts feature toggle options', () => {
      const d = new SceneDetector({
        enableCombatDetection: false,
        enableTimeDetection: false,
        enableLocationDetection: false
      });
      const features = d.getFeatures();
      expect(features.combat).toBe(false);
      expect(features.time).toBe(false);
      expect(features.location).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isConfigured
  // ---------------------------------------------------------------------------
  describe('isConfigured', () => {
    it('always returns true for pattern-based detection', () => {
      expect(detector.isConfigured()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Sensitivity levels
  // ---------------------------------------------------------------------------
  describe('setSensitivity', () => {
    it('changes sensitivity to low (threshold 0.8)', () => {
      detector.setSensitivity('low');
      expect(detector.getSensitivity()).toBe('low');
      // Low sensitivity should NOT detect a 0.7 weight pattern
      const result = detector.detectSceneTransition('attraversate il ponte');
      // 0.7 weight < 0.8 threshold
      expect(result.detected).toBe(false);
    });

    it('changes sensitivity to high (threshold 0.4)', () => {
      detector.setSensitivity('high');
      expect(detector.getSensitivity()).toBe('high');
      // High sensitivity should detect low-weight time pattern (0.6)
      const result = detector.detectSceneTransition('la mattina sorge luminosa');
      expect(result.detected).toBe(true);
    });

    it('ignores invalid sensitivity values', () => {
      detector.setSensitivity('extreme');
      expect(detector.getSensitivity()).toBe('medium');
    });
  });

  // ---------------------------------------------------------------------------
  // Scene transition detection - Location changes (Italian)
  // ---------------------------------------------------------------------------
  describe('detectSceneTransition - location changes', () => {
    it('detects entering a location (entrate nel)', () => {
      const result = detector.detectSceneTransition('Entrate nel dungeon oscuro');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('location');
      expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('detects arrival at a location (arrivate a)', () => {
      const result = detector.detectSceneTransition('Arrivate al villaggio dei nani');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('location');
      expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
    });

    it('detects social locations (taverna)', () => {
      const result = detector.detectSceneTransition('La taverna è piena di avventurieri');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.SOCIAL);
    });

    it('detects rest locations (accampamento)', () => {
      const result = detector.detectSceneTransition('Preparate il campo per la notte');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.REST);
    });

    it('detects "vi trovate" location pattern', () => {
      const result = detector.detectSceneTransition('Vi trovate in una caverna buia');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('location');
      expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
    });
  });

  // ---------------------------------------------------------------------------
  // Scene transition detection - Time skips (Italian)
  // ---------------------------------------------------------------------------
  describe('detectSceneTransition - time skips', () => {
    it('detects "il giorno dopo" time skip', () => {
      const result = detector.detectSceneTransition('Il giorno dopo vi svegliate riposati');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('time');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('detects "dopo giorni" time skip', () => {
      const result = detector.detectSceneTransition('Dopo giorni di viaggio arrivate');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('time');
    });

    it('detects "dopo aver riposato" time skip', () => {
      const result = detector.detectSceneTransition('Dopo aver riposato proseguite il cammino');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('time');
      expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
    });
  });

  // ---------------------------------------------------------------------------
  // Scene transition detection - Combat (Italian)
  // ---------------------------------------------------------------------------
  describe('detectSceneTransition - combat', () => {
    it('detects initiative roll', () => {
      const result = detector.detectSceneTransition('Tirate l\'iniziativa!');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('combat');
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      expect(result.confidence).toBe(1.0);
    });

    it('detects "roll initiative" in English', () => {
      const result = detector.detectSceneTransition('Roll initiative!');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('combat');
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });

    it('detects combat start (entra in combattimento)', () => {
      const result = detector.detectSceneTransition('Inizia il combattimento con i goblin');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });

    it('detects attack patterns', () => {
      const result = detector.detectSceneTransition('I nemici attaccano il gruppo');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });

    it('detects combat end only when in combat scene type', () => {
      // Not in combat: combat end should not be detected through combat_end type
      const result1 = detector.detectSceneTransition('Fine del combattimento');
      // It may detect via location or other patterns, but the combat_end check
      // only runs when currentSceneType is COMBAT
      expect(result1.type).not.toBe('combat_end');

      // Set to combat and try again
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      const result2 = detector.detectSceneTransition('Fine del combattimento');
      expect(result2.detected).toBe(true);
      expect(result2.type).toBe('combat_end');
      expect(result2.sceneType).toBe(SCENE_TYPES.EXPLORATION);
    });
  });

  // ---------------------------------------------------------------------------
  // identifySceneType
  // ---------------------------------------------------------------------------
  describe('identifySceneType', () => {
    it('identifies exploration scene', () => {
      const type = detector.identifySceneType('Esplorate la caverna e trovate un sentiero nascosto');
      expect(type).toBe(SCENE_TYPES.EXPLORATION);
    });

    it('identifies combat scene', () => {
      const type = detector.identifySceneType('Il tiro per colpire causa 8 danni');
      expect(type).toBe(SCENE_TYPES.COMBAT);
    });

    it('identifies social scene', () => {
      const type = detector.identifySceneType('Iniziate una conversazione con il mercante per negoziare');
      expect(type).toBe(SCENE_TYPES.SOCIAL);
    });

    it('identifies rest scene', () => {
      const type = detector.identifySceneType('Fate un lungo riposo per recuperare le forze');
      expect(type).toBe(SCENE_TYPES.REST);
    });

    it('returns unknown for ambiguous text', () => {
      const type = detector.identifySceneType('Il sole splende alto nel cielo');
      expect(type).toBe(SCENE_TYPES.UNKNOWN);
    });
  });

  // ---------------------------------------------------------------------------
  // setCurrentSceneType and getCurrentSceneType
  // ---------------------------------------------------------------------------
  describe('setCurrentSceneType / getCurrentSceneType', () => {
    it('sets and gets the current scene type', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.COMBAT);
    });

    it('ignores invalid scene types', () => {
      detector.setCurrentSceneType('invalid_type');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('adds entry to history when manually setting scene type', () => {
      detector.setCurrentSceneType(SCENE_TYPES.SOCIAL);
      const history = detector.getTransitionHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe(SCENE_TYPES.SOCIAL);
    });
  });

  // ---------------------------------------------------------------------------
  // Transition history
  // ---------------------------------------------------------------------------
  describe('getTransitionHistory / getSceneHistory', () => {
    it('starts with empty history', () => {
      expect(detector.getTransitionHistory()).toEqual([]);
    });

    it('records transitions in history', () => {
      detector.detectSceneTransition('Tirate l\'iniziativa!');
      const history = detector.getTransitionHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe(SCENE_TYPES.COMBAT);
      expect(history[0].timestamp).toBeGreaterThan(0);
    });

    it('getSceneHistory is an alias for getTransitionHistory', () => {
      detector.detectSceneTransition('Entrate nel dungeon');
      expect(detector.getSceneHistory()).toEqual(detector.getTransitionHistory());
    });

    it('returns a copy (not a reference) of history', () => {
      detector.detectSceneTransition('Tirate l\'iniziativa!');
      const history = detector.getTransitionHistory();
      history.push({ type: 'fake', timestamp: 0, text: '' });
      expect(detector.getTransitionHistory().length).toBe(1);
    });

    it('trims history to max size', () => {
      // Force 25 transitions to exceed the 20-entry max
      for (let i = 0; i < 25; i++) {
        detector.setCurrentSceneType(SCENE_TYPES.EXPLORATION);
      }
      const history = detector.getTransitionHistory();
      expect(history.length).toBeLessThanOrEqual(20);
    });

    it('truncates text to 100 characters in history entries', () => {
      const longText = 'Tirate l\'iniziativa! ' + 'A'.repeat(200);
      detector.detectSceneTransition(longText);
      const history = detector.getTransitionHistory();
      expect(history[0].text.length).toBeLessThanOrEqual(100);
    });
  });

  // ---------------------------------------------------------------------------
  // clearHistory
  // ---------------------------------------------------------------------------
  describe('clearHistory', () => {
    it('clears history and resets scene type', () => {
      detector.detectSceneTransition('Tirate l\'iniziativa!');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.COMBAT);

      detector.clearHistory();
      expect(detector.getTransitionHistory()).toEqual([]);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature toggles
  // ---------------------------------------------------------------------------
  describe('setFeatures / getFeatures', () => {
    it('can disable combat detection', () => {
      detector.setFeatures({ combat: false });
      const result = detector.detectSceneTransition('Tirate l\'iniziativa!');
      expect(result.detected).toBe(false);
    });

    it('can disable time detection', () => {
      detector.setFeatures({ time: false });
      const result = detector.detectSceneTransition('Il giorno dopo vi svegliate');
      // Might still detect location patterns, but time type should not appear
      if (result.detected) {
        expect(result.type).not.toBe('time');
      }
    });

    it('can disable location detection', () => {
      detector.setFeatures({ location: false });
      const result = detector.detectSceneTransition('Entrate nel dungeon');
      // Without location patterns, may not detect
      if (result.detected) {
        expect(result.type).not.toBe('location');
      }
    });

    it('reports current feature flags correctly', () => {
      detector.setFeatures({ combat: false, time: true, location: false });
      const features = detector.getFeatures();
      expect(features.combat).toBe(false);
      expect(features.time).toBe(true);
      expect(features.location).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('returns no detection for empty string', () => {
      const result = detector.detectSceneTransition('');
      expect(result.detected).toBe(false);
      expect(result.type).toBe('none');
      expect(result.sceneType).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('returns no detection for null input', () => {
      const result = detector.detectSceneTransition(null);
      expect(result.detected).toBe(false);
    });

    it('returns no detection for undefined input', () => {
      const result = detector.detectSceneTransition(undefined);
      expect(result.detected).toBe(false);
    });

    it('returns no detection for non-string input', () => {
      const result = detector.detectSceneTransition(42);
      expect(result.detected).toBe(false);
    });

    it('identifySceneType returns unknown for empty string', () => {
      expect(detector.identifySceneType('')).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('identifySceneType returns unknown for null', () => {
      expect(detector.identifySceneType(null)).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('returns no detection for text without matching patterns', () => {
      const result = detector.detectSceneTransition('Hello, how are you today?');
      expect(result.detected).toBe(false);
    });

    it('preserves current scene type in non-detected result', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      const result = detector.detectSceneTransition('Nothing special here');
      expect(result.detected).toBe(false);
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });
  });

  // ---------------------------------------------------------------------------
  // Italian language pattern specifics
  // ---------------------------------------------------------------------------
  describe('Italian language patterns', () => {
    it('detects "raggiungete" (reach) location pattern', () => {
      const result = detector.detectSceneTransition('Raggiungete la torre abbandonata');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
    });

    it('detects "vi riposate" rest pattern', () => {
      const result = detector.detectSceneTransition('Vi riposate sotto le stelle');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.REST);
    });

    it('detects "l\'indomani" time pattern', () => {
      const result = detector.detectSceneTransition("L'indomani partite all'alba");
      expect(result.detected).toBe(true);
      expect(result.type).toBe('time');
    });

    it('detects "battaglia" combat keyword', () => {
      const result = detector.detectSceneTransition('La battaglia infuria nella pianura');
      expect(result.detected).toBe(true);
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });

    it('identifies "short rest" and "long rest" English D&D terms', () => {
      expect(detector.identifySceneType('We take a long rest')).toBe(SCENE_TYPES.REST);
      expect(detector.identifySceneType('Short rest before continuing')).toBe(SCENE_TYPES.REST);
    });
  });

  // ---------------------------------------------------------------------------
  // Highest confidence selection
  // ---------------------------------------------------------------------------
  describe('highest confidence selection', () => {
    it('selects highest confidence when multiple patterns match', () => {
      // This text matches both location (taverna=0.8) and combat could match
      // "Tirate l'iniziativa" has weight 1.0 vs taverna at 0.8
      const result = detector.detectSceneTransition(
        "Nella taverna tirate l'iniziativa contro i briganti"
      );
      expect(result.detected).toBe(true);
      // Combat pattern (1.0) should win over social/location (0.8)
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });
});
