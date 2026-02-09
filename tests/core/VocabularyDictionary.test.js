/**
 * VocabularyDictionary Unit Tests
 *
 * Tests for the VocabularyDictionary class that manages campaign-specific
 * vocabulary terms for improved transcription accuracy. Tests cover CRUD
 * operations, import/export, prompt generation, and Foundry compendium integration.
 *
 * @module tests/core/VocabularyDictionary.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSettings, createMockI18n } from '../helpers/foundry-mock.js';

// Mock the MODULE_ID before importing VocabularyDictionary
const MODULE_ID = 'vox-chronicle';

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock main.mjs to provide MODULE_ID export
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock DND_VOCABULARY with minimal test data
vi.mock('../../scripts/data/dnd-vocabulary.mjs', () => ({
  DND_VOCABULARY: {
    spells: ['Fireball', 'Magic Missile', 'Shield'],
    creatures: ['Goblin', 'Dragon', 'Beholder'],
    classes: ['Fighter', 'Wizard', 'Rogue'],
    conditions: ['Blinded', 'Charmed', 'Stunned'],
    abilities: ['Strength', 'Dexterity', 'Constitution']
  }
}));

// Setup global mocks
let mockSettings;
let mockI18n;

beforeEach(() => {
  // Mock Foundry Hooks
  globalThis.Hooks = {
    once: vi.fn(),
    on: vi.fn(),
    call: vi.fn()
  };

  // Create default empty dictionary
  const defaultDict = {
    character_names: [],
    location_names: [],
    items: [],
    terms: [],
    custom: []
  };

  // Create mock settings with default dictionary
  mockSettings = createMockSettings({
    'vox-chronicle.customVocabularyDictionary': defaultDict
  });

  // Create mock i18n
  mockI18n = createMockI18n({});

  // Mock the global game object
  globalThis.game = {
    settings: mockSettings,
    i18n: mockI18n,
    ready: true,
    packs: [] // Empty compendiums by default
  };
});

afterEach(() => {
  vi.clearAllMocks();
  delete globalThis.game;
  delete globalThis.Hooks;
});

describe('VocabularyDictionary', () => {
  let VocabularyDictionary;
  let VocabularyCategory;

  // Dynamically import after mocks are set up
  beforeEach(async () => {
    const module = await import('../../scripts/core/VocabularyDictionary.mjs');
    VocabularyDictionary = module.VocabularyDictionary;
    VocabularyCategory = module.VocabularyCategory;
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance successfully', () => {
      const dictionary = new VocabularyDictionary();
      expect(dictionary).toBeInstanceOf(VocabularyDictionary);
    });

    it('should have a logger instance', () => {
      const dictionary = new VocabularyDictionary();
      expect(dictionary._logger).toBeDefined();
    });
  });

  // ============================================================================
  // initialize() Tests
  // ============================================================================

  describe('initialize', () => {
    it('should initialize successfully with empty dictionary', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.initialize()).resolves.not.toThrow();
    });

    it('should load defaults when dictionary is empty', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.initialize();

      // Should have loaded D&D terms
      const totalCount = dictionary.getTotalTermCount();
      expect(totalCount).toBeGreaterThan(0);
    });

    it('should not load defaults when dictionary already has terms', async () => {
      // Pre-populate with a term
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');

      const initialCount = dictionary.getTotalTermCount();

      // Initialize again
      await dictionary.initialize();

      // Count should remain the same
      const finalCount = dictionary.getTotalTermCount();
      expect(finalCount).toBe(initialCount);
    });

    it('should throw error if initialization fails', async () => {
      const dictionary = new VocabularyDictionary();

      // Mock loadDefaults to throw
      vi.spyOn(dictionary, 'loadDefaults').mockRejectedValueOnce(new Error('Load failed'));

      await expect(dictionary.initialize()).rejects.toThrow('Load failed');
    });
  });

  // ============================================================================
  // getTerms() Tests
  // ============================================================================

  describe('getTerms', () => {
    it('should return empty array for empty category', () => {
      const dictionary = new VocabularyDictionary();
      const terms = dictionary.getTerms(VocabularyCategory.CHARACTER_NAMES);
      expect(terms).toEqual([]);
    });

    it('should return terms from populated category', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sam');

      const terms = dictionary.getTerms(VocabularyCategory.CHARACTER_NAMES);
      expect(terms).toEqual(['Frodo', 'Sam']);
    });

    it('should return a copy of the array', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');

      const terms1 = dictionary.getTerms(VocabularyCategory.CHARACTER_NAMES);
      const terms2 = dictionary.getTerms(VocabularyCategory.CHARACTER_NAMES);

      expect(terms1).toEqual(terms2);
      expect(terms1).not.toBe(terms2); // Different array instances
    });

    it('should throw error for invalid category', () => {
      const dictionary = new VocabularyDictionary();
      expect(() => dictionary.getTerms('invalid_category')).toThrow('Invalid category');
    });
  });

  // ============================================================================
  // getAllTerms() Tests
  // ============================================================================

  describe('getAllTerms', () => {
    it('should return dictionary with all categories', () => {
      const dictionary = new VocabularyDictionary();
      const allTerms = dictionary.getAllTerms();

      expect(allTerms).toHaveProperty('character_names');
      expect(allTerms).toHaveProperty('location_names');
      expect(allTerms).toHaveProperty('items');
      expect(allTerms).toHaveProperty('terms');
      expect(allTerms).toHaveProperty('custom');
    });

    it('should return populated categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Aragorn');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Rivendell');

      const allTerms = dictionary.getAllTerms();

      expect(allTerms.character_names).toContain('Aragorn');
      expect(allTerms.location_names).toContain('Rivendell');
    });
  });

  // ============================================================================
  // addTerm() Tests
  // ============================================================================

  describe('addTerm', () => {
    it('should add a new term successfully', async () => {
      const dictionary = new VocabularyDictionary();
      const result = await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Legolas');

      expect(result).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Legolas')).toBe(true);
    });

    it('should trim whitespace from terms', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, '  Gimli  ');

      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Gimli')).toBe(true);
    });

    it('should return false when adding duplicate term', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Boromir');

      const result = await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Boromir');
      expect(result).toBe(false);
    });

    it('should detect duplicates case-insensitively', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Saruman');

      const result = await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'SARUMAN');
      expect(result).toBe(false);
    });

    it('should throw error for invalid category', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.addTerm('invalid_category', 'Term')).rejects.toThrow(
        'Invalid category'
      );
    });

    it('should throw error for non-string term', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 123)).rejects.toThrow(
        'Term must be a non-empty string'
      );
    });

    it('should throw error for empty term', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, '')).rejects.toThrow(
        'Term must be a non-empty string'
      );
    });

    it('should throw error for whitespace-only term', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, '   ')).rejects.toThrow(
        'Term cannot be empty or whitespace'
      );
    });

    it('should call settings.set after adding term', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Elrond');

      expect(mockSettings.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // removeTerm() Tests
  // ============================================================================

  describe('removeTerm', () => {
    it('should remove existing term successfully', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gollum');

      const result = await dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, 'Gollum');
      expect(result).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Gollum')).toBe(false);
    });

    it('should remove term case-insensitively', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sauron');

      const result = await dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, 'SAURON');
      expect(result).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Sauron')).toBe(false);
    });

    it('should return false when removing non-existent term', async () => {
      const dictionary = new VocabularyDictionary();

      const result = await dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, 'NonExistent');
      expect(result).toBe(false);
    });

    it('should throw error for invalid category', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.removeTerm('invalid_category', 'Term')).rejects.toThrow(
        'Invalid category'
      );
    });

    it('should throw error for non-string term', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, null)).rejects.toThrow(
        'Term must be a non-empty string'
      );
    });

    it('should call settings.set after removing term', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Bilbo');
      mockSettings.set.mockClear();

      await dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, 'Bilbo');
      expect(mockSettings.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // clearCategory() Tests
  // ============================================================================

  describe('clearCategory', () => {
    it('should clear all terms from category', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sam');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Merry');

      const removedCount = await dictionary.clearCategory(VocabularyCategory.CHARACTER_NAMES);

      expect(removedCount).toBe(3);
      expect(dictionary.getTermCount(VocabularyCategory.CHARACTER_NAMES)).toBe(0);
    });

    it('should return 0 when clearing empty category', async () => {
      const dictionary = new VocabularyDictionary();

      const removedCount = await dictionary.clearCategory(VocabularyCategory.CHARACTER_NAMES);
      expect(removedCount).toBe(0);
    });

    it('should not affect other categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Pippin');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Shire');

      await dictionary.clearCategory(VocabularyCategory.CHARACTER_NAMES);

      expect(dictionary.getTermCount(VocabularyCategory.CHARACTER_NAMES)).toBe(0);
      expect(dictionary.getTermCount(VocabularyCategory.LOCATION_NAMES)).toBe(1);
    });

    it('should throw error for invalid category', async () => {
      const dictionary = new VocabularyDictionary();
      await expect(dictionary.clearCategory('invalid_category')).rejects.toThrow(
        'Invalid category'
      );
    });

    it('should call settings.set after clearing', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Test');
      mockSettings.set.mockClear();

      await dictionary.clearCategory(VocabularyCategory.CHARACTER_NAMES);
      expect(mockSettings.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // clearAll() Tests
  // ============================================================================

  describe('clearAll', () => {
    it('should clear all terms from all categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Mordor');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Ring');
      await dictionary.addTerm(VocabularyCategory.TERMS, 'Fireball');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'Custom');

      const removedCount = await dictionary.clearAll();

      expect(removedCount).toBe(5);
      expect(dictionary.getTotalTermCount()).toBe(0);
    });

    it('should return 0 when clearing empty dictionary', async () => {
      const dictionary = new VocabularyDictionary();

      const removedCount = await dictionary.clearAll();
      expect(removedCount).toBe(0);
    });

    it('should call settings.set after clearing', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Test');
      mockSettings.set.mockClear();

      await dictionary.clearAll();
      expect(mockSettings.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // exportDictionary() Tests
  // ============================================================================

  describe('exportDictionary', () => {
    it('should export dictionary as JSON string', () => {
      const dictionary = new VocabularyDictionary();
      const json = dictionary.exportDictionary();

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should export populated dictionary', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Shire');

      const json = dictionary.exportDictionary();
      const parsed = JSON.parse(json);

      expect(parsed.character_names).toContain('Frodo');
      expect(parsed.location_names).toContain('Shire');
    });

    it('should export formatted JSON with indentation', () => {
      const dictionary = new VocabularyDictionary();
      const json = dictionary.exportDictionary();

      // Check for newlines (formatted JSON)
      expect(json).toContain('\n');
    });
  });

  // ============================================================================
  // importDictionary() Tests
  // ============================================================================

  describe('importDictionary', () => {
    it('should import dictionary with replace mode', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'OldName');

      const importData = {
        character_names: ['NewName1', 'NewName2'],
        location_names: ['Place1'],
        items: [],
        terms: [],
        custom: []
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData), false);

      expect(stats.added).toBe(3);
      expect(stats.total).toBe(3);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'OldName')).toBe(false);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'NewName1')).toBe(true);
    });

    it('should import dictionary with merge mode', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'ExistingName');

      const importData = {
        character_names: ['NewName'],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData), true);

      expect(stats.added).toBe(1);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'ExistingName')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'NewName')).toBe(true);
    });

    it('should skip duplicate terms in merge mode', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');

      const importData = {
        character_names: ['Frodo', 'Sam'],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData), true);

      expect(stats.added).toBe(1); // Only Sam added
      expect(stats.skipped).toBe(1); // Frodo skipped
      expect(stats.total).toBe(2);
    });

    it('should throw error for invalid JSON', async () => {
      const dictionary = new VocabularyDictionary();

      await expect(dictionary.importDictionary('not valid json', false)).rejects.toThrow(
        'Invalid JSON'
      );
    });

    it('should throw error for non-string input', async () => {
      const dictionary = new VocabularyDictionary();

      await expect(dictionary.importDictionary(null, false)).rejects.toThrow(
        'JSON must be a non-empty string'
      );
    });

    it('should throw error for empty string', async () => {
      const dictionary = new VocabularyDictionary();

      await expect(dictionary.importDictionary('', false)).rejects.toThrow(
        'JSON must be a non-empty string'
      );
    });

    it('should validate dictionary structure', async () => {
      const dictionary = new VocabularyDictionary();

      const invalidData = {
        character_names: 'not an array'
      };

      await expect(dictionary.importDictionary(JSON.stringify(invalidData), false)).rejects.toThrow(
        'must be an array'
      );
    });

    it('should validate term types', async () => {
      const dictionary = new VocabularyDictionary();

      const invalidData = {
        character_names: [123, 456],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      };

      await expect(dictionary.importDictionary(JSON.stringify(invalidData), false)).rejects.toThrow(
        'must be strings'
      );
    });
  });

  // ============================================================================
  // generatePrompt() Tests
  // ============================================================================

  describe('generatePrompt', () => {
    it('should return empty string for empty dictionary', () => {
      const dictionary = new VocabularyDictionary();
      const prompt = dictionary.generatePrompt();

      expect(prompt).toBe('');
    });

    it('should generate prompt with terms', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Rivendell');

      const prompt = dictionary.generatePrompt();

      expect(prompt).toContain('Gandalf');
      expect(prompt).toContain('Rivendell');
      expect(prompt).toContain('Common terms in this recording');
    });

    it('should limit terms to maxTerms parameter', async () => {
      const dictionary = new VocabularyDictionary();

      // Add 10 terms
      for (let i = 0; i < 10; i++) {
        await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, `Character${i}`);
      }

      const prompt = dictionary.generatePrompt(5);
      const terms = prompt.match(/Character\d+/g);

      expect(terms).toBeDefined();
      expect(terms.length).toBeLessThanOrEqual(5);
    });

    it('should default to MAX_PROMPT_TERMS (50)', async () => {
      const dictionary = new VocabularyDictionary();

      // Add 60 terms
      for (let i = 0; i < 60; i++) {
        await dictionary.addTerm(VocabularyCategory.TERMS, `Term${i}`);
      }

      const prompt = dictionary.generatePrompt();
      const terms = prompt.match(/Term\d+/g);

      expect(terms).toBeDefined();
      expect(terms.length).toBeLessThanOrEqual(50);
    });

    it('should include terms from all categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Hero');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Castle');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');

      const prompt = dictionary.generatePrompt();

      expect(prompt).toContain('Hero');
      expect(prompt).toContain('Castle');
      expect(prompt).toContain('Sword');
    });
  });

  // ============================================================================
  // getTermCount() Tests
  // ============================================================================

  describe('getTermCount', () => {
    it('should return 0 for empty category', () => {
      const dictionary = new VocabularyDictionary();
      const count = dictionary.getTermCount(VocabularyCategory.CHARACTER_NAMES);

      expect(count).toBe(0);
    });

    it('should return correct count for populated category', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sam');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');

      const count = dictionary.getTermCount(VocabularyCategory.CHARACTER_NAMES);
      expect(count).toBe(3);
    });

    it('should throw error for invalid category', () => {
      const dictionary = new VocabularyDictionary();

      expect(() => dictionary.getTermCount('invalid_category')).toThrow('Invalid category');
    });
  });

  // ============================================================================
  // getTotalTermCount() Tests
  // ============================================================================

  describe('getTotalTermCount', () => {
    it('should return 0 for empty dictionary', () => {
      const dictionary = new VocabularyDictionary();
      const total = dictionary.getTotalTermCount();

      expect(total).toBe(0);
    });

    it('should return total count across all categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sam');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Shire');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Ring');

      const total = dictionary.getTotalTermCount();
      expect(total).toBe(4);
    });

    it('should update after adding terms', async () => {
      const dictionary = new VocabularyDictionary();

      expect(dictionary.getTotalTermCount()).toBe(0);

      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');
      expect(dictionary.getTotalTermCount()).toBe(1);

      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Mordor');
      expect(dictionary.getTotalTermCount()).toBe(2);
    });

    it('should update after removing terms', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Sam');

      expect(dictionary.getTotalTermCount()).toBe(2);

      await dictionary.removeTerm(VocabularyCategory.CHARACTER_NAMES, 'Frodo');
      expect(dictionary.getTotalTermCount()).toBe(1);
    });
  });

  // ============================================================================
  // hasTerm() Tests
  // ============================================================================

  describe('hasTerm', () => {
    it('should return false for non-existent term', () => {
      const dictionary = new VocabularyDictionary();
      const result = dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'NonExistent');

      expect(result).toBe(false);
    });

    it('should return true for existing term', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Aragorn');

      const result = dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Aragorn');
      expect(result).toBe(true);
    });

    it('should check case-insensitively', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Legolas');

      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'LEGOLAS')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'legolas')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'LegOLas')).toBe(true);
    });

    it('should throw error for invalid category', () => {
      const dictionary = new VocabularyDictionary();

      expect(() => dictionary.hasTerm('invalid_category', 'Term')).toThrow('Invalid category');
    });
  });

  // ============================================================================
  // loadDefaults() Tests
  // ============================================================================

  describe('loadDefaults', () => {
    it('should load D&D vocabulary when dictionary is empty', async () => {
      const dictionary = new VocabularyDictionary();
      const stats = await dictionary.loadDefaults();

      expect(stats.loaded).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.skipped).toBe(0);
    });

    it('should load terms into TERMS category', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.loadDefaults();

      const termsCount = dictionary.getTermCount(VocabularyCategory.TERMS);
      expect(termsCount).toBeGreaterThan(0);
    });

    it('should skip loading if dictionary already has terms', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Existing');

      const stats = await dictionary.loadDefaults();

      expect(stats.loaded).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.skipped).toBe(1); // The existing term
    });

    it('should load all D&D vocabulary categories', async () => {
      const dictionary = new VocabularyDictionary();
      await dictionary.loadDefaults();

      const terms = dictionary.getTerms(VocabularyCategory.TERMS);

      // Check for terms from different categories
      expect(terms.some((t) => t === 'Fireball')).toBe(true); // spell
      expect(terms.some((t) => t === 'Goblin')).toBe(true); // creature
      expect(terms.some((t) => t === 'Fighter')).toBe(true); // class
    });
  });

  // ============================================================================
  // extractFromFoundryCompendiums() Tests
  // ============================================================================

  describe('extractFromFoundryCompendiums', () => {
    it('should return empty results when game.packs is unavailable', async () => {
      delete globalThis.game.packs;

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results).toEqual({
        character_names: [],
        items: []
      });
    });

    it('should return empty results when game is undefined', async () => {
      const tempGame = globalThis.game;
      delete globalThis.game;

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results).toEqual({
        character_names: [],
        items: []
      });

      globalThis.game = tempGame;
    });

    it('should extract actor names from world Actor compendiums', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor',
            packageType: 'world'
          },
          indexed: true,
          index: new Map([
            ['actor1', { name: 'Hero Warrior', _id: 'actor1' }],
            ['actor2', { name: 'Villain Mage', _id: 'actor2' }]
          ])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toContain('Hero Warrior');
      expect(results.character_names).toContain('Villain Mage');
    });

    it('should extract item names from world Item compendiums', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.items',
          metadata: {
            type: 'Item',
            packageType: 'world'
          },
          indexed: true,
          index: new Map([
            ['item1', { name: 'Magic Sword', _id: 'item1' }],
            ['item2', { name: 'Healing Potion', _id: 'item2' }]
          ])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.items).toContain('Magic Sword');
      expect(results.items).toContain('Healing Potion');
    });

    it('should skip module and system compendiums', async () => {
      globalThis.game.packs = [
        {
          collection: 'dnd5e.spells',
          metadata: {
            type: 'Item',
            packageType: 'system'
          },
          indexed: true,
          index: new Map([['spell1', { name: 'System Spell', _id: 'spell1' }]])
        },
        {
          collection: 'some-module.items',
          metadata: {
            type: 'Item',
            packageType: 'module'
          },
          indexed: true,
          index: new Map([['item1', { name: 'Module Item', _id: 'item1' }]])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.items).not.toContain('System Spell');
      expect(results.items).not.toContain('Module Item');
    });

    it('should remove duplicate names', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor',
            packageType: 'world'
          },
          indexed: true,
          index: new Map([
            ['actor1', { name: 'Duplicate Name', _id: 'actor1' }],
            ['actor2', { name: 'Duplicate Name', _id: 'actor2' }],
            ['actor3', { name: 'Unique Name', _id: 'actor3' }]
          ])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names.filter((n) => n === 'Duplicate Name')).toHaveLength(1);
      expect(results.character_names).toContain('Unique Name');
    });

    it('should sort results alphabetically', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor',
            packageType: 'world'
          },
          indexed: true,
          index: new Map([
            ['actor1', { name: 'Zebra', _id: 'actor1' }],
            ['actor2', { name: 'Apple', _id: 'actor2' }],
            ['actor3', { name: 'Mango', _id: 'actor3' }]
          ])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('should handle compendiums without packageType metadata', async () => {
      globalThis.game.system = { id: 'dnd5e' };
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor'
            // No packageType
          },
          indexed: true,
          index: new Map([['actor1', { name: 'World Actor', _id: 'actor1' }]])
        },
        {
          collection: 'dnd5e.monsters',
          metadata: {
            type: 'Actor'
            // No packageType
          },
          indexed: true,
          index: new Map([['monster1', { name: 'System Monster', _id: 'monster1' }]])
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toContain('World Actor');
      expect(results.character_names).not.toContain('System Monster');
    });

    it('should handle unindexed compendiums', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor',
            packageType: 'world'
          },
          indexed: false,
          index: new Map(),
          getIndex: vi.fn(async function () {
            this.indexed = true;
            this.index = new Map([['actor1', { name: 'Loaded Actor', _id: 'actor1' }]]);
            return this.index;
          })
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toContain('Loaded Actor');
    });

    it('should handle errors gracefully', async () => {
      globalThis.game.packs = [
        {
          collection: 'world.actors',
          metadata: {
            type: 'Actor',
            packageType: 'world'
          },
          indexed: false,
          getIndex: vi.fn().mockRejectedValue(new Error('Failed to load'))
        }
      ];

      const dictionary = new VocabularyDictionary();
      const results = await dictionary.extractFromFoundryCompendiums();

      // Should return empty results instead of throwing
      expect(results).toEqual({
        character_names: [],
        items: []
      });
    });
  });

  // ============================================================================
  // VocabularyCategory Export Tests
  // ============================================================================

  describe('VocabularyCategory', () => {
    it('should export all category constants', () => {
      expect(VocabularyCategory.CHARACTER_NAMES).toBe('character_names');
      expect(VocabularyCategory.LOCATION_NAMES).toBe('location_names');
      expect(VocabularyCategory.ITEMS).toBe('items');
      expect(VocabularyCategory.TERMS).toBe('terms');
      expect(VocabularyCategory.CUSTOM).toBe('custom');
    });
  });
});
