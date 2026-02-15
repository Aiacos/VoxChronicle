/**
 * RulesReference Unit Tests
 *
 * Tests for the RulesReference class covering rules question detection,
 * mechanic term recognition, topic extraction, compendium searching,
 * and confidence scoring in both English and Italian.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing RulesReference
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

// Mock constants
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks
import { RulesReference } from '../../scripts/narrator/RulesReference.mjs';

describe('RulesReference', () => {
  let service;

  beforeEach(() => {
    service = new RulesReference();
  });

  // ==============================================
  // Constructor & Configuration
  // ==============================================

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(service.getLanguage()).toBe('en');
      expect(service.getResultLimit()).toBe(5);
      expect(service.isConfigured()).toBe(false);
    });

    it('should accept custom options', () => {
      const custom = new RulesReference({ language: 'en', resultLimit: 10 });
      expect(custom.getLanguage()).toBe('en');
      expect(custom.getResultLimit()).toBe(10);
    });
  });

  describe('configuration methods', () => {
    it('should set and get language', () => {
      service.setLanguage('en');
      expect(service.getLanguage()).toBe('en');
    });

    it('should default to "it" when setting null language', () => {
      service.setLanguage(null);
      expect(service.getLanguage()).toBe('it');
    });

    it('should set and get result limit', () => {
      service.setResultLimit(10);
      expect(service.getResultLimit()).toBe(10);
    });

    it('should enforce minimum result limit of 1', () => {
      service.setResultLimit(0);
      expect(service.getResultLimit()).toBe(5); // falls back to default
      service.setResultLimit(-1);
      expect(service.getResultLimit()).toBe(1); // Math.max(1, -1) = 1
    });

    it('should mark as configured after loadRules', async () => {
      expect(service.isConfigured()).toBe(false);
      await service.loadRules();
      expect(service.isConfigured()).toBe(true);
    });

    it('should reset state on reloadRules', async () => {
      await service.loadRules();
      expect(service.isConfigured()).toBe(true);
      await service.reloadRules();
      // reloadRules clears cache and calls loadRules, so isConfigured should be true again
      expect(service.isConfigured()).toBe(true);
    });
  });

  // ==============================================
  // detectRulesQuestion — Edge Cases
  // ==============================================

  describe('detectRulesQuestion - edge cases', () => {
    it('should return false for null input', () => {
      const result = service.detectRulesQuestion(null);
      expect(result.isRulesQuestion).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.detectedTerms).toEqual([]);
      expect(result.questionType).toBe('general');
    });

    it('should return false for empty string', () => {
      const result = service.detectRulesQuestion('');
      expect(result.isRulesQuestion).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return false for whitespace-only string', () => {
      const result = service.detectRulesQuestion('   \t\n  ');
      expect(result.isRulesQuestion).toBe(false);
    });

    it('should return false for non-string input', () => {
      const result = service.detectRulesQuestion(42);
      expect(result.isRulesQuestion).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return false for unrelated text', () => {
      const result = service.detectRulesQuestion('The weather is nice today');
      expect(result.isRulesQuestion).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  // ==============================================
  // detectRulesQuestion — English Patterns
  // ==============================================

  describe('detectRulesQuestion - English patterns', () => {
    it('should detect "how does X work" pattern', () => {
      const result = service.detectRulesQuestion('how does grappling work?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.detectedTerms).toContain('how_does_work');
      expect(result.questionType).toBe('combat');
    });

    it('should detect "can I" pattern', () => {
      const result = service.detectRulesQuestion('can I cast a spell while grappling?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('can_i');
      expect(result.questionType).toBe('combat'); // grappling overrides action type
    });

    it('should detect "what happens when" pattern', () => {
      const result = service.detectRulesQuestion('what happens when you fall prone?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('what_happens');
      expect(result.questionType).toBe('condition'); // prone overrides mechanic
    });

    it('should detect general rules keyword', () => {
      const result = service.detectRulesQuestion('I want to check the rules');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('rules_keyword');
    });

    it('should detect mechanics keyword', () => {
      const result = service.detectRulesQuestion('what are the mechanics of combat?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('rules_keyword');
    });
  });

  // ==============================================
  // detectRulesQuestion — Italian Patterns
  // ==============================================

  describe('detectRulesQuestion - Italian patterns', () => {
    it('should detect "come funziona" pattern', () => {
      const result = service.detectRulesQuestion('come funziona la lotta?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('come_funziona');
      expect(result.questionType).toBe('combat'); // lotta mechanic
    });

    it('should detect "posso" pattern', () => {
      const result = service.detectRulesQuestion('posso lanciare un incantesimo?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('posso');
    });

    it('should detect "cosa succede" pattern', () => {
      const result = service.detectRulesQuestion('cosa succede quando sei stordito?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('cosa_succede');
      expect(result.questionType).toBe('condition'); // stordito condition
    });

    it('should detect "quanto costa" pattern', () => {
      const result = service.detectRulesQuestion('quanti slot servono per fireball?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('quanto_costa');
    });

    it('should detect Italian rules keywords', () => {
      const result = service.detectRulesQuestion('quali sono le regole per il combattimento?');
      expect(result.isRulesQuestion).toBe(true);
      expect(result.detectedTerms).toContain('come_funziona');
    });
  });

  // ==============================================
  // detectRulesQuestion — Confidence Scoring
  // ==============================================

  describe('detectRulesQuestion - confidence scoring', () => {
    it('should cap confidence at 1.0', () => {
      // A question with both pattern match and question word boost
      const result = service.detectRulesQuestion('how does grappling work?');
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should have higher confidence for explicit question patterns than generic keywords', () => {
      const explicitResult = service.detectRulesQuestion('how does grappling work?');
      const genericResult = service.detectRulesQuestion('grappling is fun');
      expect(explicitResult.confidence).toBeGreaterThan(genericResult.confidence);
    });

    it('should boost confidence when question words are present with detected terms', () => {
      // "what" is a question word, "advantage" is a mechanic term
      const withQuestion = service.detectRulesQuestion('what is advantage?');
      // Just the term with no question word
      const withoutQuestion = service.detectRulesQuestion('advantage in combat');
      expect(withQuestion.confidence).toBeGreaterThan(withoutQuestion.confidence);
    });

    it('should not exceed threshold for text with no rules content', () => {
      const result = service.detectRulesQuestion('let us go to the tavern');
      expect(result.confidence).toBe(0);
      expect(result.isRulesQuestion).toBe(false);
    });
  });

  // ==============================================
  // isKnownMechanic
  // ==============================================

  describe('isKnownMechanic', () => {
    it('should recognize English combat mechanics', () => {
      expect(service.isKnownMechanic('grappling')).toBe(true);
      expect(service.isKnownMechanic('opportunity attack')).toBe(true);
      expect(service.isKnownMechanic('advantage')).toBe(true);
      expect(service.isKnownMechanic('critical hit')).toBe(true);
      expect(service.isKnownMechanic('initiative')).toBe(true);
    });

    it('should recognize Italian combat mechanics', () => {
      expect(service.isKnownMechanic('lotta')).toBe(true);
      expect(service.isKnownMechanic('attacco di opportunità')).toBe(true);
      expect(service.isKnownMechanic('vantaggio')).toBe(true);
      expect(service.isKnownMechanic('colpo critico')).toBe(true);
    });

    it('should recognize spell mechanics', () => {
      expect(service.isKnownMechanic('concentration')).toBe(true);
      expect(service.isKnownMechanic('concentrazione')).toBe(true);
      expect(service.isKnownMechanic('spell slot')).toBe(true);
      expect(service.isKnownMechanic('cantrip')).toBe(true);
      expect(service.isKnownMechanic('ritual')).toBe(true);
    });

    it('should recognize conditions', () => {
      expect(service.isKnownMechanic('prone')).toBe(true);
      expect(service.isKnownMechanic('stunned')).toBe(true);
      expect(service.isKnownMechanic('paralyzed')).toBe(true);
      expect(service.isKnownMechanic('blinded')).toBe(true);
      expect(service.isKnownMechanic('charmed')).toBe(true);
      expect(service.isKnownMechanic('frightened')).toBe(true);
    });

    it('should recognize ability/check mechanics', () => {
      expect(service.isKnownMechanic('saving throw')).toBe(true);
      expect(service.isKnownMechanic('ability check')).toBe(true);
      expect(service.isKnownMechanic('skill check')).toBe(true);
    });

    it('should recognize movement mechanics', () => {
      expect(service.isKnownMechanic('difficult terrain')).toBe(true);
      expect(service.isKnownMechanic('jump')).toBe(true);
      expect(service.isKnownMechanic('climb')).toBe(true);
    });

    it('should recognize rest mechanics', () => {
      expect(service.isKnownMechanic('short rest')).toBe(true);
      expect(service.isKnownMechanic('long rest')).toBe(true);
      expect(service.isKnownMechanic('riposo breve')).toBe(true);
      expect(service.isKnownMechanic('riposo lungo')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(service.isKnownMechanic('GRAPPLING')).toBe(true);
      expect(service.isKnownMechanic('Concentration')).toBe(true);
      expect(service.isKnownMechanic('SHORT REST')).toBe(true);
    });

    it('should return false for unknown terms', () => {
      expect(service.isKnownMechanic('pizza')).toBe(false);
      expect(service.isKnownMechanic('flying carpet')).toBe(false);
      expect(service.isKnownMechanic('teleportation')).toBe(false);
    });

    it('should return false for null/undefined/non-string input', () => {
      expect(service.isKnownMechanic(null)).toBe(false);
      expect(service.isKnownMechanic(undefined)).toBe(false);
      expect(service.isKnownMechanic(123)).toBe(false);
      expect(service.isKnownMechanic('')).toBe(false);
    });
  });

  // ==============================================
  // extractRulesTopic
  // ==============================================

  describe('extractRulesTopic', () => {
    it('should extract topic from English question pattern', () => {
      const topic = service.extractRulesTopic('how does grappling work?');
      expect(topic).toBeTruthy();
      // Should extract "grappling" from the pattern or the mechanic term
      expect(typeof topic).toBe('string');
    });

    it('should extract topic from Italian question pattern', () => {
      const topic = service.extractRulesTopic('come funziona la concentrazione?');
      expect(topic).toBeTruthy();
    });

    it('should extract mechanic term as topic when no pattern match captures', () => {
      const topic = service.extractRulesTopic('I have a question about concentration');
      expect(topic).toBe('concentration');
    });

    it('should return null for non-rules text', () => {
      const topic = service.extractRulesTopic('let us buy some bread');
      expect(topic).toBeNull();
    });

    it('should return null for empty input', () => {
      const topic = service.extractRulesTopic('');
      expect(topic).toBeNull();
    });

    it('should return null for null input', () => {
      const topic = service.extractRulesTopic(null);
      expect(topic).toBeNull();
    });
  });

  // ==============================================
  // searchCompendiums
  // ==============================================

  describe('searchCompendiums', () => {
    let mockPacks;

    beforeEach(() => {
      // Create mock compendium packs
      mockPacks = [
        {
          collection: 'dnd5e.spells',
          documentName: 'Item',
          metadata: { label: 'Spells (SRD)' },
          getIndex: vi.fn().mockResolvedValue([
            { _id: 'spell1', name: 'Fireball' },
            { _id: 'spell2', name: 'Fire Bolt' },
            { _id: 'spell3', name: 'Shield' }
          ]),
          getDocument: vi.fn().mockImplementation(async (id) => {
            const docs = {
              spell1: {
                name: 'Fireball',
                type: 'spell',
                system: {
                  description: { value: '<p>A bright streak flashes from your finger.</p>' },
                  school: 'evocation',
                  source: 'PHB pg. 241'
                },
                flags: {}
              },
              spell2: {
                name: 'Fire Bolt',
                type: 'spell',
                system: {
                  description: { value: '<p>You hurl a mote of fire.</p>' },
                  school: 'evocation',
                  source: 'PHB pg. 242'
                },
                flags: {}
              }
            };
            return docs[id] || null;
          })
        },
        {
          collection: 'dnd5e.rules',
          documentName: 'JournalEntry',
          metadata: { label: 'Rules (SRD)' },
          getIndex: vi.fn().mockResolvedValue([
            { _id: 'rule1', name: 'Conditions' },
            { _id: 'rule2', name: 'Combat' }
          ]),
          getDocument: vi.fn().mockImplementation(async (id) => {
            const docs = {
              rule1: {
                name: 'Conditions',
                type: 'text',
                pages: [
                  { type: 'text', text: { content: '<p>Blinded, Charmed, Deafened...</p>' } }
                ],
                system: {},
                flags: {}
              }
            };
            return docs[id] || null;
          })
        }
      ];

      // Mock game.packs as iterable
      globalThis.game = {
        packs: mockPacks
      };
    });

    afterEach(() => {
      delete globalThis.game;
    });

    it('should return empty array for empty query', async () => {
      const results = await service.searchCompendiums('');
      expect(results).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const results = await service.searchCompendiums(null);
      expect(results).toEqual([]);
    });

    it('should search across all packs and find matching entries', async () => {
      const results = await service.searchCompendiums('fire');
      expect(results.length).toBeGreaterThan(0);
      // Should find Fireball and Fire Bolt
      const titles = results.map(r => r.rule.title);
      expect(titles).toContain('Fireball');
      expect(titles).toContain('Fire Bolt');
    });

    it('should give exact match highest relevance', async () => {
      const results = await service.searchCompendiums('fireball');
      const fireball = results.find(r => r.rule.title === 'Fireball');
      expect(fireball).toBeTruthy();
      expect(fireball.relevance).toBe(1.0);
    });

    it('should give starts-with match high relevance', async () => {
      const results = await service.searchCompendiums('fire');
      const fireBolt = results.find(r => r.rule.title === 'Fire Bolt');
      expect(fireBolt).toBeTruthy();
      // "fire bolt" starts with "fire"
      expect(fireBolt.relevance).toBe(0.8);
    });

    it('should sort results by relevance descending', async () => {
      const results = await service.searchCompendiums('fire');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance);
      }
    });

    it('should filter by packNames option', async () => {
      const results = await service.searchCompendiums('conditions', {
        packNames: ['dnd5e.rules']
      });
      // Should only search rules pack
      expect(mockPacks[0].getIndex).not.toHaveBeenCalled();
      expect(mockPacks[1].getIndex).toHaveBeenCalled();
    });

    it('should filter by documentTypes option', async () => {
      const results = await service.searchCompendiums('fire', {
        documentTypes: ['Item']
      });
      // Should only search Item packs (spells), not JournalEntry (rules)
      expect(mockPacks[0].getIndex).toHaveBeenCalled();
      expect(mockPacks[1].getIndex).not.toHaveBeenCalled();
    });

    it('should respect limit option', async () => {
      const results = await service.searchCompendiums('fire', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should extract citation with sourcebook and page', async () => {
      const results = await service.searchCompendiums('fireball');
      const fireball = results.find(r => r.rule.title === 'Fireball');
      expect(fireball).toBeTruthy();
      expect(fireball.rule.citation).toBeTruthy();
      expect(fireball.rule.citation.sourcebook).toBe('PHB');
      expect(fireball.rule.citation.page).toBe(241);
      expect(fireball.rule.citation.formatted).toContain('PHB');
      expect(fireball.rule.citation.formatted).toContain('241');
    });

    it('should handle pack search errors gracefully', async () => {
      mockPacks[0].getIndex.mockRejectedValue(new Error('Pack unavailable'));
      const results = await service.searchCompendiums('fire');
      // Should not throw, and should still search other packs
      expect(results).toBeDefined();
    });

    it('should extract tags from Item documents', async () => {
      const results = await service.searchCompendiums('fireball');
      const fireball = results.find(r => r.rule.title === 'Fireball');
      expect(fireball).toBeTruthy();
      expect(fireball.rule.tags).toContain('spell');
      expect(fireball.rule.tags).toContain('evocation');
    });

    it('should handle JournalEntry documents with pages', async () => {
      const results = await service.searchCompendiums('conditions');
      const conditions = results.find(r => r.rule.title === 'Conditions');
      expect(conditions).toBeTruthy();
      expect(conditions.rule.category).toBe('rules');
      expect(conditions.rule.content).toContain('Blinded');
    });
  });

  // ==============================================
  // Stub Methods
  // ==============================================

  describe('stub methods', () => {
    it('searchRules should return empty array', async () => {
      const results = await service.searchRules('test');
      expect(results).toEqual([]);
    });

    it('getRuleById should return null', async () => {
      const result = await service.getRuleById('some-id');
      expect(result).toBeNull();
    });

    it('getRecentRules should return empty array', () => {
      expect(service.getRecentRules()).toEqual([]);
    });

    it('getCategories should return empty array', () => {
      expect(service.getCategories()).toEqual([]);
    });

    it('getRulesByCategory should return empty array', () => {
      expect(service.getRulesByCategory('combat')).toEqual([]);
    });
  });

  // ==============================================
  // Question Type Detection
  // ==============================================

  describe('question type categorization', () => {
    it('should categorize combat-related questions', () => {
      const result = service.detectRulesQuestion('how does grappling work?');
      expect(result.questionType).toBe('combat');
    });

    it('should categorize spell-related questions', () => {
      const result = service.detectRulesQuestion('what are the rules for concentration?');
      expect(result.questionType).toBe('spell');
    });

    it('should categorize condition-related questions', () => {
      const result = service.detectRulesQuestion('what does stunned mean?');
      expect(result.questionType).toBe('condition');
    });

    it('should categorize ability-related questions', () => {
      const result = service.detectRulesQuestion('how does saving throw work?');
      expect(result.questionType).toBe('ability');
    });

    it('should categorize movement-related questions', () => {
      const result = service.detectRulesQuestion('how does difficult terrain work?');
      expect(result.questionType).toBe('movement');
    });

    it('should categorize rest-related questions', () => {
      const result = service.detectRulesQuestion('what happens during a short rest?');
      expect(result.questionType).toBe('rest');
    });
  });
});
