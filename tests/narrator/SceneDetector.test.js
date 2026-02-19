import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SceneDetector, SCENE_TYPES } from '../../scripts/narrator/SceneDetector.mjs';

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

describe('SceneDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new SceneDetector();
  });

  // =========================================================================
  // Exports
  // =========================================================================
  describe('exports', () => {
    it('should export the SceneDetector class', () => {
      expect(SceneDetector).toBeDefined();
      expect(typeof SceneDetector).toBe('function');
    });

    it('should export SCENE_TYPES constant', () => {
      expect(SCENE_TYPES).toBeDefined();
      expect(typeof SCENE_TYPES).toBe('object');
    });

    it('should have all scene types defined', () => {
      expect(SCENE_TYPES.EXPLORATION).toBe('exploration');
      expect(SCENE_TYPES.COMBAT).toBe('combat');
      expect(SCENE_TYPES.SOCIAL).toBe('social');
      expect(SCENE_TYPES.REST).toBe('rest');
      expect(SCENE_TYPES.UNKNOWN).toBe('unknown');
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(detector).toBeInstanceOf(SceneDetector);
      expect(detector.getSensitivity()).toBe('medium');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should accept custom sensitivity', () => {
      const d = new SceneDetector({ sensitivity: 'high' });
      expect(d.getSensitivity()).toBe('high');
    });

    it('should accept custom minimumConfidence', () => {
      const d = new SceneDetector({ minimumConfidence: 0.3 });
      expect(d._minimumConfidence).toBe(0.3);
    });

    it('should enable all detection features by default', () => {
      const features = detector.getFeatures();
      expect(features.combat).toBe(true);
      expect(features.time).toBe(true);
      expect(features.location).toBe(true);
    });

    it('should allow disabling combat detection', () => {
      const d = new SceneDetector({ enableCombatDetection: false });
      expect(d.getFeatures().combat).toBe(false);
    });

    it('should allow disabling time detection', () => {
      const d = new SceneDetector({ enableTimeDetection: false });
      expect(d.getFeatures().time).toBe(false);
    });

    it('should allow disabling location detection', () => {
      const d = new SceneDetector({ enableLocationDetection: false });
      expect(d.getFeatures().location).toBe(false);
    });

    it('should start with empty scene history', () => {
      expect(detector.getTransitionHistory()).toEqual([]);
    });
  });

  // =========================================================================
  // isConfigured
  // =========================================================================
  describe('isConfigured', () => {
    it('should always return true for pattern-based detection', () => {
      expect(detector.isConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // setSensitivity / getSensitivity
  // =========================================================================
  describe('setSensitivity / getSensitivity', () => {
    it('should set sensitivity to low', () => {
      detector.setSensitivity('low');
      expect(detector.getSensitivity()).toBe('low');
    });

    it('should set sensitivity to medium', () => {
      detector.setSensitivity('low');
      detector.setSensitivity('medium');
      expect(detector.getSensitivity()).toBe('medium');
    });

    it('should set sensitivity to high', () => {
      detector.setSensitivity('high');
      expect(detector.getSensitivity()).toBe('high');
    });

    it('should ignore invalid sensitivity values', () => {
      detector.setSensitivity('invalid');
      expect(detector.getSensitivity()).toBe('medium');
    });

    it('should update confidence threshold for low sensitivity', () => {
      detector.setSensitivity('low');
      expect(detector._minimumConfidence).toBe(0.8);
    });

    it('should update confidence threshold for medium sensitivity', () => {
      detector.setSensitivity('medium');
      expect(detector._minimumConfidence).toBe(0.6);
    });

    it('should update confidence threshold for high sensitivity', () => {
      detector.setSensitivity('high');
      expect(detector._minimumConfidence).toBe(0.4);
    });
  });

  // =========================================================================
  // detectSceneTransition
  // =========================================================================
  describe('detectSceneTransition', () => {
    describe('invalid input', () => {
      it('should return no detection for null', () => {
        const result = detector.detectSceneTransition(null);
        expect(result.detected).toBe(false);
        expect(result.type).toBe('none');
        expect(result.confidence).toBe(0);
        expect(result.trigger).toBe('');
        expect(result.sceneType).toBe(SCENE_TYPES.UNKNOWN);
      });

      it('should return no detection for undefined', () => {
        const result = detector.detectSceneTransition(undefined);
        expect(result.detected).toBe(false);
      });

      it('should return no detection for non-string', () => {
        const result = detector.detectSceneTransition(42);
        expect(result.detected).toBe(false);
      });

      it('should return no detection for empty string', () => {
        const result = detector.detectSceneTransition('');
        expect(result.detected).toBe(false);
      });
    });

    describe('location transitions (Italian)', () => {
      it('should detect entering a location', () => {
        const result = detector.detectSceneTransition('Siete entrati nella caverna oscura');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('location');
        expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
      });

      it('should detect arriving at a location', () => {
        const result = detector.detectSceneTransition('Arrivate al villaggio di Nightstone');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('location');
      });

      it('should detect "vi trovate" pattern', () => {
        const result = detector.detectSceneTransition('Vi trovate in una stanza buia');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('location');
      });

      it('should detect tavern location as social scene', () => {
        const result = detector.detectSceneTransition('Entrate nella taverna del villaggio');
        expect(result.detected).toBe(true);
      });

      it('should detect locanda (inn) as social scene', () => {
        const result = detector.detectSceneTransition('Nella locanda trovate molti avventurieri');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.SOCIAL);
      });

      it('should detect encounters as social', () => {
        const result = detector.detectSceneTransition('Incontrate un vecchio mago sulla strada');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.SOCIAL);
      });

      it('should detect rest location', () => {
        const result = detector.detectSceneTransition('Vi riposate nel campo per la notte');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.REST);
      });

      it('should detect accampamento as rest', () => {
        const result = detector.detectSceneTransition("montate l'accampamento per la notte");
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.REST);
      });
    });

    describe('time transitions (Italian)', () => {
      it('should detect "il giorno dopo"', () => {
        const result = detector.detectSceneTransition('Il giorno dopo vi svegliate');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('time');
      });

      it('should detect "l\'indomani"', () => {
        const result = detector.detectSceneTransition("L'indomani partite per il viaggio");
        expect(result.detected).toBe(true);
        expect(result.type).toBe('time');
      });

      it('should detect "dopo ore"', () => {
        const result = detector.detectSceneTransition('Dopo ore di cammino arrivate');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('time');
      });

      it('should detect "dopo giorni"', () => {
        const result = detector.detectSceneTransition('Dopo giorni di viaggio');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('time');
      });

      it('should detect "dopo aver riposato"', () => {
        const result = detector.detectSceneTransition('Dopo aver riposato vi sentite meglio');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('time');
      });
    });

    describe('combat transitions (Italian)', () => {
      it('should detect "tirate l\'iniziativa"', () => {
        const result = detector.detectSceneTransition("Tirate l'iniziativa!");
        expect(result.detected).toBe(true);
        expect(result.type).toBe('combat');
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });

      it('should detect "inizia il combattimento"', () => {
        const result = detector.detectSceneTransition('Inizia il combattimento!');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });

      it('should detect "roll initiative"', () => {
        const result = detector.detectSceneTransition('Roll initiative!');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });

      it('should detect attack patterns', () => {
        const result = detector.detectSceneTransition('Il nemico attacca con la spada');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });

      it('should detect battle/scontro', () => {
        const result = detector.detectSceneTransition('Lo scontro e feroce!');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });
    });

    describe('combat end transitions', () => {
      it('should detect combat end when in combat', () => {
        detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
        const result = detector.detectSceneTransition('Fine del combattimento!');
        expect(result.detected).toBe(true);
        expect(result.type).toBe('combat_end');
        expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
      });

      it('should detect victory when in combat (unambiguous text)', () => {
        detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
        // Use text that only matches combat_end, not combat start patterns
        const result = detector.detectSceneTransition('I nemici sono morti, tutti sconfitti!');
        expect(result.detected).toBe(true);
        expect(result.sceneType).toBe(SCENE_TYPES.EXPLORATION);
      });

      it('should detect "il nemico e morto" when in combat', () => {
        detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
        const result = detector.detectSceneTransition('Il nemico è morto!');
        expect(result.detected).toBe(true);
      });

      it('should not detect combat end when not in combat', () => {
        detector.setCurrentSceneType(SCENE_TYPES.EXPLORATION);
        const result = detector.detectSceneTransition('Fine del combattimento!');
        // combat_end only checked when in combat, but "combattimento" may still trigger combat pattern
        // The key is that combat_end pattern is only checked if currently in combat
        expect(result.type).not.toBe('combat_end');
      });
    });

    describe('sensitivity and confidence', () => {
      it('should apply minimum confidence filter', () => {
        detector.setSensitivity('low'); // threshold = 0.8
        // A low-weight pattern should be filtered
        const result = detector.detectSceneTransition('attraversate il ponte');
        // weight is 0.7, below 0.8 threshold
        expect(result.detected).toBe(false);
      });

      it('should be more lenient with high sensitivity', () => {
        detector.setSensitivity('high'); // threshold = 0.4
        const result = detector.detectSceneTransition('la sera scende sulla citta');
        // time pattern with weight 0.6, above 0.4 threshold
        expect(result.detected).toBe(true);
      });

      it('should pick the highest confidence transition when multiple match', () => {
        // This text may match both location and combat patterns
        const result = detector.detectSceneTransition("Entrate nella caverna e tirate l'iniziativa!");
        expect(result.detected).toBe(true);
        // Initiative has weight 1.0 which should win
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    describe('feature toggling', () => {
      it('should not detect combat when combat detection is disabled', () => {
        detector.setFeatures({ combat: false });
        const result = detector.detectSceneTransition("Tirate l'iniziativa!");
        expect(result.type).not.toBe('combat');
      });

      it('should not detect time when time detection is disabled', () => {
        detector.setFeatures({ time: false });
        const result = detector.detectSceneTransition('Il giorno dopo vi svegliate');
        expect(result.type).not.toBe('time');
      });

      it('should not detect location when location detection is disabled', () => {
        detector.setFeatures({ location: false });
        const result = detector.detectSceneTransition('Siete entrati nella caverna oscura');
        expect(result.type).not.toBe('location');
      });
    });

    describe('scene history update', () => {
      it('should add to scene history on detection', () => {
        detector.detectSceneTransition("Tirate l'iniziativa!");
        const history = detector.getTransitionHistory();
        expect(history.length).toBe(1);
        expect(history[0].type).toBe(SCENE_TYPES.COMBAT);
      });

      it('should update current scene type on detection', () => {
        detector.detectSceneTransition("Tirate l'iniziativa!");
        expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.COMBAT);
      });

      it('should not update history when no transition detected', () => {
        detector.detectSceneTransition('nothing interesting here');
        expect(detector.getTransitionHistory().length).toBe(0);
      });

      it('should preserve current scene type when no transition detected', () => {
        detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
        const result = detector.detectSceneTransition('nothing interesting here');
        expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
      });
    });
  });

  // =========================================================================
  // identifySceneType
  // =========================================================================
  describe('identifySceneType', () => {
    it('should return UNKNOWN for null input', () => {
      expect(detector.identifySceneType(null)).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should return UNKNOWN for non-string input', () => {
      expect(detector.identifySceneType(42)).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should return UNKNOWN for empty string', () => {
      expect(detector.identifySceneType('')).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should identify combat scene', () => {
      const text = 'Il tiro per colpire ha un danno di 15 punti ferita';
      expect(detector.identifySceneType(text)).toBe(SCENE_TYPES.COMBAT);
    });

    it('should identify exploration scene', () => {
      const text = 'Esplorate la caverna e scoprite un passaggio segreto';
      expect(detector.identifySceneType(text)).toBe(SCENE_TYPES.EXPLORATION);
    });

    it('should identify social scene', () => {
      const text = 'La conversazione con il mercante prosegue, cercate di persuadere il venditore';
      expect(detector.identifySceneType(text)).toBe(SCENE_TYPES.SOCIAL);
    });

    it('should identify rest scene', () => {
      const text = 'Dopo un lungo riposo recuperate tutti i punti ferita e rigenerare le risorse';
      expect(detector.identifySceneType(text)).toBe(SCENE_TYPES.REST);
    });

    it('should return UNKNOWN for ambiguous text', () => {
      expect(detector.identifySceneType('ciao a tutti')).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should return UNKNOWN when best score is below threshold', () => {
      const result = detector.identifySceneType('a b c d e f');
      expect(result).toBe(SCENE_TYPES.UNKNOWN);
    });
  });

  // =========================================================================
  // getCurrentSceneType / setCurrentSceneType
  // =========================================================================
  describe('getCurrentSceneType / setCurrentSceneType', () => {
    it('should start as UNKNOWN', () => {
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should set to combat', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.COMBAT);
    });

    it('should set to exploration', () => {
      detector.setCurrentSceneType(SCENE_TYPES.EXPLORATION);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.EXPLORATION);
    });

    it('should set to social', () => {
      detector.setCurrentSceneType(SCENE_TYPES.SOCIAL);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.SOCIAL);
    });

    it('should set to rest', () => {
      detector.setCurrentSceneType(SCENE_TYPES.REST);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.REST);
    });

    it('should ignore invalid scene types', () => {
      detector.setCurrentSceneType('invalid');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });

    it('should add to scene history when set manually', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      const history = detector.getTransitionHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe(SCENE_TYPES.COMBAT);
    });
  });

  // =========================================================================
  // getTransitionHistory / getSceneHistory
  // =========================================================================
  describe('getTransitionHistory / getSceneHistory', () => {
    it('should return empty array initially', () => {
      expect(detector.getTransitionHistory()).toEqual([]);
    });

    it('should return a copy of the history', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      const history1 = detector.getTransitionHistory();
      const history2 = detector.getTransitionHistory();
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // different references
    });

    it('should include timestamp in history entries', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      const history = detector.getTransitionHistory();
      expect(history[0].timestamp).toBeDefined();
      expect(typeof history[0].timestamp).toBe('number');
    });

    it('should include text in history entries (max 100 chars)', () => {
      detector.detectSceneTransition("Tirate l'iniziativa! Questo e un testo molto lungo");
      const history = detector.getTransitionHistory();
      expect(history[0].text.length).toBeLessThanOrEqual(100);
    });

    it('getSceneHistory should be an alias for getTransitionHistory', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      expect(detector.getSceneHistory()).toEqual(detector.getTransitionHistory());
    });

    it('should limit history size to max', () => {
      // Max is 20
      for (let i = 0; i < 25; i++) {
        detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      }
      expect(detector.getTransitionHistory().length).toBeLessThanOrEqual(20);
    });
  });

  // =========================================================================
  // clearHistory
  // =========================================================================
  describe('clearHistory', () => {
    it('should clear scene history', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      expect(detector.getTransitionHistory().length).toBe(1);
      detector.clearHistory();
      expect(detector.getTransitionHistory()).toEqual([]);
    });

    it('should reset current scene type to UNKNOWN', () => {
      detector.setCurrentSceneType(SCENE_TYPES.COMBAT);
      detector.clearHistory();
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });
  });

  // =========================================================================
  // setFeatures / getFeatures
  // =========================================================================
  describe('setFeatures / getFeatures', () => {
    it('should set combat feature', () => {
      detector.setFeatures({ combat: false });
      expect(detector.getFeatures().combat).toBe(false);
    });

    it('should set time feature', () => {
      detector.setFeatures({ time: false });
      expect(detector.getFeatures().time).toBe(false);
    });

    it('should set location feature', () => {
      detector.setFeatures({ location: false });
      expect(detector.getFeatures().location).toBe(false);
    });

    it('should set multiple features at once', () => {
      detector.setFeatures({ combat: false, time: false, location: false });
      const features = detector.getFeatures();
      expect(features.combat).toBe(false);
      expect(features.time).toBe(false);
      expect(features.location).toBe(false);
    });

    it('should not change features not specified', () => {
      detector.setFeatures({ combat: false });
      expect(detector.getFeatures().time).toBe(true);
      expect(detector.getFeatures().location).toBe(true);
    });

    it('should ignore non-boolean values', () => {
      detector.setFeatures({ combat: 'yes' });
      expect(detector.getFeatures().combat).toBe(true); // unchanged
    });

    it('should re-enable features', () => {
      detector.setFeatures({ combat: false });
      expect(detector.getFeatures().combat).toBe(false);
      detector.setFeatures({ combat: true });
      expect(detector.getFeatures().combat).toBe(true);
    });
  });

  // =========================================================================
  // _checkPatterns (private, tested via public methods)
  // =========================================================================
  describe('_checkPatterns', () => {
    it('should return detected=false when no patterns match', () => {
      const result = detector._checkPatterns('nothing matches', [], 'test');
      expect(result.detected).toBe(false);
      expect(result.type).toBe('test');
      expect(result.confidence).toBe(0);
    });

    it('should return best match among multiple matches', () => {
      const patterns = [
        { pattern: /test/i, sceneType: SCENE_TYPES.EXPLORATION, weight: 0.5 },
        { pattern: /test/i, sceneType: SCENE_TYPES.COMBAT, weight: 0.9 }
      ];
      const result = detector._checkPatterns('this is a test', patterns, 'location');
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.sceneType).toBe(SCENE_TYPES.COMBAT);
    });
  });

  // =========================================================================
  // _updateSceneHistory (private, tested via public methods)
  // =========================================================================
  describe('_updateSceneHistory', () => {
    it('should truncate text to 100 characters', () => {
      const longText = 'a'.repeat(200);
      detector._updateSceneHistory(SCENE_TYPES.COMBAT, longText);
      const history = detector.getTransitionHistory();
      expect(history[0].text.length).toBe(100);
    });

    it('should trim history when exceeding max size', () => {
      for (let i = 0; i < 25; i++) {
        detector._updateSceneHistory(SCENE_TYPES.COMBAT, `entry ${i}`);
      }
      expect(detector.getTransitionHistory().length).toBe(20);
    });

    it('should keep most recent entries when trimming', () => {
      for (let i = 0; i < 25; i++) {
        detector._updateSceneHistory(SCENE_TYPES.COMBAT, `entry ${i}`);
      }
      const history = detector.getTransitionHistory();
      expect(history[history.length - 1].text).toBe('entry 24');
    });
  });

  // =========================================================================
  // Integration scenarios
  // =========================================================================
  describe('integration scenarios', () => {
    it('should track a full combat encounter lifecycle', () => {
      // Enter combat
      let result = detector.detectSceneTransition("Tirate l'iniziativa!");
      expect(result.detected).toBe(true);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.COMBAT);

      // End combat
      result = detector.detectSceneTransition('Fine del combattimento!');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('combat_end');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.EXPLORATION);

      // Should have 2 history entries
      expect(detector.getTransitionHistory().length).toBe(2);
    });

    it('should handle exploration -> social -> rest sequence', () => {
      detector.detectSceneTransition('Siete entrati nella foresta');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.EXPLORATION);

      detector.detectSceneTransition('Nella taverna incontrate il mercante');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.SOCIAL);

      detector.detectSceneTransition('Vi riposate per la notte');
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.REST);

      expect(detector.getTransitionHistory().length).toBe(3);
    });

    it('should handle clearing and restarting', () => {
      detector.detectSceneTransition("Tirate l'iniziativa!");
      expect(detector.getTransitionHistory().length).toBe(1);

      detector.clearHistory();
      expect(detector.getTransitionHistory().length).toBe(0);
      expect(detector.getCurrentSceneType()).toBe(SCENE_TYPES.UNKNOWN);
    });
  });
});
