import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RulesReference } from '../../scripts/narrator/RulesReference.mjs';

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

describe('RulesReference', () => {
  let rules;

  beforeEach(() => {
    rules = new RulesReference();
  });

  // =========================================================================
  // Exports
  // =========================================================================
  describe('exports', () => {
    it('should export the RulesReference class', () => {
      expect(RulesReference).toBeDefined();
      expect(typeof RulesReference).toBe('function');
    });

    it('should be constructable', () => {
      expect(rules).toBeInstanceOf(RulesReference);
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should use default language "en" when no options provided', () => {
      expect(rules.getLanguage()).toBe('en');
    });

    it('should accept a custom language option', () => {
      const r = new RulesReference({ language: 'it' });
      expect(r.getLanguage()).toBe('it');
    });

    it('should use default result limit of 5', () => {
      expect(rules.getResultLimit()).toBe(5);
    });

    it('should accept a custom resultLimit option', () => {
      const r = new RulesReference({ resultLimit: 10 });
      expect(r.getResultLimit()).toBe(10);
    });

    it('should not be loaded initially', () => {
      expect(rules.isConfigured()).toBe(false);
    });
  });

  // =========================================================================
  // isConfigured
  // =========================================================================
  describe('isConfigured', () => {
    it('should return false before loadRules', () => {
      expect(rules.isConfigured()).toBe(false);
    });

    it('should return true after loadRules', async () => {
      await rules.loadRules();
      expect(rules.isConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // setLanguage / getLanguage
  // =========================================================================
  describe('setLanguage / getLanguage', () => {
    it('should set the language', () => {
      rules.setLanguage('de');
      expect(rules.getLanguage()).toBe('de');
    });

    it('should default to "it" when given falsy value', () => {
      rules.setLanguage(null);
      expect(rules.getLanguage()).toBe('it');
    });

    it('should default to "it" when given empty string', () => {
      rules.setLanguage('');
      expect(rules.getLanguage()).toBe('it');
    });
  });

  // =========================================================================
  // setResultLimit / getResultLimit
  // =========================================================================
  describe('setResultLimit / getResultLimit', () => {
    it('should set a positive limit', () => {
      rules.setResultLimit(10);
      expect(rules.getResultLimit()).toBe(10);
    });

    it('should use default for zero (falsy)', () => {
      rules.setResultLimit(0);
      expect(rules.getResultLimit()).toBe(5);
    });

    it('should enforce minimum of 1 for negative numbers', () => {
      rules.setResultLimit(-5);
      expect(rules.getResultLimit()).toBe(1);
    });

    it('should use default when given falsy value', () => {
      rules.setResultLimit(null);
      expect(rules.getResultLimit()).toBe(5);
    });
  });

  // =========================================================================
  // loadRules
  // =========================================================================
  describe('loadRules', () => {
    it('should set isLoaded to true', async () => {
      await rules.loadRules();
      expect(rules.isConfigured()).toBe(true);
    });

    it('should return a promise', () => {
      const result = rules.loadRules();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  // =========================================================================
  // searchRules (stub)
  // =========================================================================
  describe('searchRules', () => {
    it('should return an empty array', async () => {
      const results = await rules.searchRules('grappling');
      expect(results).toEqual([]);
    });

    it('should accept options parameter', async () => {
      const results = await rules.searchRules('grappling', { categories: ['combat'], limit: 3 });
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // getRuleById (stub)
  // =========================================================================
  describe('getRuleById', () => {
    it('should return null', async () => {
      const result = await rules.getRuleById('some-id');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getRecentRules (stub)
  // =========================================================================
  describe('getRecentRules', () => {
    it('should return an empty array', () => {
      expect(rules.getRecentRules()).toEqual([]);
    });
  });

  // =========================================================================
  // reloadRules
  // =========================================================================
  describe('reloadRules', () => {
    it('should clear cache and reload', async () => {
      await rules.loadRules();
      expect(rules.isConfigured()).toBe(true);

      // After reload, should still be configured
      await rules.reloadRules();
      expect(rules.isConfigured()).toBe(true);
    });

    it('should return a promise', () => {
      const result = rules.reloadRules();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  // =========================================================================
  // getCategories (stub)
  // =========================================================================
  describe('getCategories', () => {
    it('should return an empty array', () => {
      expect(rules.getCategories()).toEqual([]);
    });
  });

  // =========================================================================
  // getRulesByCategory (stub)
  // =========================================================================
  describe('getRulesByCategory', () => {
    it('should return an empty array', () => {
      expect(rules.getRulesByCategory('combat')).toEqual([]);
    });
  });

  // =========================================================================
  // detectRulesQuestion
  // =========================================================================
  describe('detectRulesQuestion', () => {
    describe('invalid input', () => {
      it('should return not a rules question for null', () => {
        const result = rules.detectRulesQuestion(null);
        expect(result.isRulesQuestion).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.detectedTerms).toEqual([]);
        expect(result.questionType).toBe('general');
      });

      it('should return not a rules question for undefined', () => {
        const result = rules.detectRulesQuestion(undefined);
        expect(result.isRulesQuestion).toBe(false);
      });

      it('should return not a rules question for empty string', () => {
        const result = rules.detectRulesQuestion('');
        expect(result.isRulesQuestion).toBe(false);
      });

      it('should return not a rules question for whitespace-only string', () => {
        const result = rules.detectRulesQuestion('   ');
        expect(result.isRulesQuestion).toBe(false);
      });

      it('should return not a rules question for non-string input', () => {
        const result = rules.detectRulesQuestion(42);
        expect(result.isRulesQuestion).toBe(false);
      });
    });

    describe('English question patterns', () => {
      it('should detect "how does grappling work"', () => {
        const result = rules.detectRulesQuestion('how does grappling work?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.3);
        expect(result.detectedTerms.length).toBeGreaterThan(0);
      });

      it('should detect "what is the rule for opportunity attack"', () => {
        const result = rules.detectRulesQuestion('what is the rule for opportunity attack?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('combat');
      });

      it('should detect "can i dodge and dash on same turn"', () => {
        const result = rules.detectRulesQuestion('can i dodge and dash on same turn?');
        expect(result.isRulesQuestion).toBe(true);
      });

      it('should detect "what happens when you are stunned"', () => {
        const result = rules.detectRulesQuestion('what happens when you are stunned?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('condition');
      });
    });

    describe('Italian question patterns', () => {
      it('should detect "come funziona la concentrazione"', () => {
        const result = rules.detectRulesQuestion('come funziona la concentrazione?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('spell');
      });

      it('should detect "posso attaccare due volte"', () => {
        const result = rules.detectRulesQuestion('posso attaccare due volte?');
        expect(result.isRulesQuestion).toBe(true);
      });

      it('should detect "cosa succede quando sei prono"', () => {
        const result = rules.detectRulesQuestion('cosa succede quando sei prono?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('condition');
      });

      it('should detect "quanti slot incantesimo"', () => {
        const result = rules.detectRulesQuestion('quanti slot incantesimo ho?');
        expect(result.isRulesQuestion).toBe(true);
      });
    });

    describe('mechanic term detection', () => {
      it('should detect "grappling" as a combat mechanic', () => {
        const result = rules.detectRulesQuestion('I want to use grappling on the goblin');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('combat');
        expect(result.detectedTerms).toContain('grappling');
      });

      it('should detect "concentration" as a spell mechanic', () => {
        const result = rules.detectRulesQuestion('does concentration break?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('spell');
      });

      it('should detect "saving throw" as an ability mechanic', () => {
        const result = rules.detectRulesQuestion('what saving throw do I make?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('ability');
      });

      it('should detect "difficult terrain" as a movement mechanic', () => {
        const result = rules.detectRulesQuestion('how does difficult terrain affect movement?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('movement');
      });

      it('should detect "long rest" as a rest mechanic', () => {
        const result = rules.detectRulesQuestion('what happens during a long rest?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('rest');
      });

      it('should detect "short rest" as a rest mechanic', () => {
        const result = rules.detectRulesQuestion('can we take a short rest?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('rest');
      });

      it('should detect Italian mechanic terms', () => {
        const result = rules.detectRulesQuestion('il vantaggio come funziona?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('combat');
      });

      it('should detect condition terms like "paralyzed"', () => {
        const result = rules.detectRulesQuestion('the monster is paralyzed, what does that mean?');
        expect(result.isRulesQuestion).toBe(true);
        expect(result.questionType).toBe('condition');
      });
    });

    describe('rules keywords', () => {
      it('should detect "rules" keyword', () => {
        const result = rules.detectRulesQuestion('what are the rules here?');
        expect(result.isRulesQuestion).toBe(true);
      });

      it('should detect "regola" keyword (Italian)', () => {
        const result = rules.detectRulesQuestion('qual e la regola?');
        expect(result.isRulesQuestion).toBe(true);
      });

      it('should detect "mechanics" keyword', () => {
        const result = rules.detectRulesQuestion('how do the mechanics work?');
        expect(result.isRulesQuestion).toBe(true);
      });
    });

    describe('confidence scoring', () => {
      it('should have higher confidence for explicit question patterns', () => {
        const explicit = rules.detectRulesQuestion('how does grappling work?');
        const implicit = rules.detectRulesQuestion('grappling is interesting');
        expect(explicit.confidence).toBeGreaterThanOrEqual(implicit.confidence);
      });

      it('should boost confidence when question word is present with mechanic term', () => {
        const withQuestion = rules.detectRulesQuestion('how does advantage work?');
        const withoutQuestion = rules.detectRulesQuestion('advantage is great');
        expect(withQuestion.confidence).toBeGreaterThan(withoutQuestion.confidence);
      });

      it('should not exceed 1.0 confidence', () => {
        const result = rules.detectRulesQuestion('how does grappling work? what are the rules for advantage?');
        expect(result.confidence).toBeLessThanOrEqual(1.0);
      });

      it('should have 0 confidence for unrelated text', () => {
        const result = rules.detectRulesQuestion('the weather is nice today');
        expect(result.confidence).toBe(0);
        expect(result.isRulesQuestion).toBe(false);
      });
    });

    describe('extractedTopic', () => {
      it('should extract topic from "how does X work" pattern', () => {
        const result = rules.detectRulesQuestion('how does grappling work?');
        expect(result.extractedTopic).toBeTruthy();
      });

      it('should extract topic from mechanic term when no pattern match', () => {
        const result = rules.detectRulesQuestion('tell me about concentration');
        expect(result.extractedTopic).toBe('concentration');
      });

      it('should be null for unrelated text', () => {
        const result = rules.detectRulesQuestion('the weather is nice today');
        expect(result.extractedTopic).toBeNull();
      });
    });

    describe('questionType classification', () => {
      it('should classify mechanic questions', () => {
        const result = rules.detectRulesQuestion('how does grappling work?');
        expect(result.questionType).toBe('combat');
      });

      it('should classify spell questions', () => {
        const result = rules.detectRulesQuestion('what is concentration?');
        expect(result.questionType).toBe('spell');
      });

      it('should classify condition questions', () => {
        const result = rules.detectRulesQuestion('what does stunned mean?');
        expect(result.questionType).toBe('condition');
      });

      it('should return "general" for unknown types', () => {
        const result = rules.detectRulesQuestion('weather is nice');
        expect(result.questionType).toBe('general');
      });

      it('should classify action questions from pattern', () => {
        const result = rules.detectRulesQuestion('can i fly over the wall?');
        expect(result.questionType).toBe('action');
      });
    });
  });

  // =========================================================================
  // extractRulesTopic
  // =========================================================================
  describe('extractRulesTopic', () => {
    it('should extract topic from a rules question', () => {
      const topic = rules.extractRulesTopic('how does grappling work?');
      expect(topic).toBeTruthy();
    });

    it('should return null for non-rules text', () => {
      const topic = rules.extractRulesTopic('the weather is nice today');
      expect(topic).toBeNull();
    });

    it('should return null for null input', () => {
      const topic = rules.extractRulesTopic(null);
      expect(topic).toBeNull();
    });

    it('should return null for empty string', () => {
      const topic = rules.extractRulesTopic('');
      expect(topic).toBeNull();
    });

    it('should extract mechanic term as topic', () => {
      const topic = rules.extractRulesTopic('tell me about concentration');
      expect(topic).toBe('concentration');
    });
  });

  // =========================================================================
  // isKnownMechanic
  // =========================================================================
  describe('isKnownMechanic', () => {
    it('should return true for known English combat mechanic', () => {
      expect(rules.isKnownMechanic('grappling')).toBe(true);
    });

    it('should return true for known Italian combat mechanic', () => {
      expect(rules.isKnownMechanic('lotta')).toBe(true);
    });

    it('should return true for spell mechanics', () => {
      expect(rules.isKnownMechanic('concentration')).toBe(true);
    });

    it('should return true for condition mechanics', () => {
      expect(rules.isKnownMechanic('stunned')).toBe(true);
    });

    it('should return true for ability mechanics', () => {
      expect(rules.isKnownMechanic('saving throw')).toBe(true);
    });

    it('should return true for movement mechanics', () => {
      expect(rules.isKnownMechanic('difficult terrain')).toBe(true);
    });

    it('should return true for rest mechanics', () => {
      expect(rules.isKnownMechanic('short rest')).toBe(true);
    });

    it('should return false for unknown terms', () => {
      expect(rules.isKnownMechanic('pizza')).toBe(false);
    });

    it('should return false for null', () => {
      expect(rules.isKnownMechanic(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(rules.isKnownMechanic(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(rules.isKnownMechanic('')).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(rules.isKnownMechanic(42)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(rules.isKnownMechanic('GRAPPLING')).toBe(true);
      expect(rules.isKnownMechanic('Concentration')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(rules.isKnownMechanic('  grappling  ')).toBe(true);
    });
  });

  // =========================================================================
  // searchCompendiums
  // =========================================================================
  describe('searchCompendiums', () => {
    let mockPack;

    beforeEach(() => {
      mockPack = {
        collection: 'dnd5e.spells',
        documentName: 'Item',
        metadata: { label: 'Spells' },
        getIndex: vi.fn().mockResolvedValue([
          { _id: 'spell1', name: 'Fireball' },
          { _id: 'spell2', name: 'Fire Bolt' },
          { _id: 'spell3', name: 'Shield' }
        ]),
        getDocument: vi.fn().mockImplementation((id) => {
          const docs = {
            spell1: { name: 'Fireball', type: 'spell', system: { description: { value: 'A bright streak' }, school: 'evocation', source: 'PHB pg. 241' } },
            spell2: { name: 'Fire Bolt', type: 'spell', system: { description: { value: 'A cantrip' }, school: 'evocation', source: 'PHB' } },
            spell3: { name: 'Shield', type: 'spell', system: { description: { value: 'A barrier' }, school: 'abjuration', source: 'PHB pg. 275' } }
          };
          return Promise.resolve(docs[id] || null);
        })
      };
      game.packs = [mockPack];
    });

    it('should return empty array for null query', async () => {
      const results = await rules.searchCompendiums(null);
      expect(results).toEqual([]);
    });

    it('should return empty array for empty string query', async () => {
      const results = await rules.searchCompendiums('');
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const results = await rules.searchCompendiums('   ');
      expect(results).toEqual([]);
    });

    it('should return empty array for non-string query', async () => {
      const results = await rules.searchCompendiums(42);
      expect(results).toEqual([]);
    });

    it('should search packs and return matching results', async () => {
      const results = await rules.searchCompendiums('fire');
      expect(results.length).toBe(2);
      expect(results[0].rule.title).toBe('Fireball');
      expect(results[1].rule.title).toBe('Fire Bolt');
    });

    it('should give exact match highest relevance', async () => {
      const results = await rules.searchCompendiums('fireball');
      expect(results.length).toBe(1);
      expect(results[0].relevance).toBe(1.0);
    });

    it('should give starts-with match high relevance', async () => {
      const results = await rules.searchCompendiums('fire');
      const fireball = results.find(r => r.rule.title === 'Fireball');
      expect(fireball.relevance).toBe(0.8); // starts with "fire"
    });

    it('should respect result limit', async () => {
      rules.setResultLimit(1);
      const results = await rules.searchCompendiums('fire');
      expect(results.length).toBe(1);
    });

    it('should respect options.limit override', async () => {
      const results = await rules.searchCompendiums('fire', { limit: 1 });
      expect(results.length).toBe(1);
    });

    it('should filter by pack names', async () => {
      const results = await rules.searchCompendiums('fire', { packNames: ['other.pack'] });
      expect(results.length).toBe(0);
    });

    it('should filter by document types', async () => {
      const results = await rules.searchCompendiums('fire', { documentTypes: ['JournalEntry'] });
      expect(results.length).toBe(0);
    });

    it('should include matching document types', async () => {
      const results = await rules.searchCompendiums('fire', { documentTypes: ['Item'] });
      expect(results.length).toBe(2);
    });

    it('should sort results by relevance descending', async () => {
      const results = await rules.searchCompendiums('fire');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance);
      }
    });

    it('should handle pack errors gracefully', async () => {
      mockPack.getIndex.mockRejectedValue(new Error('Pack error'));
      const results = await rules.searchCompendiums('fire');
      expect(results).toEqual([]);
    });

    it('should handle empty packs', async () => {
      game.packs = [];
      const results = await rules.searchCompendiums('fire');
      expect(results).toEqual([]);
    });

    it('should return empty array when game.packs is unavailable', async () => {
      const savedPacks = game.packs;
      game.packs = null;
      const result = await rules.searchCompendiums('dragon');
      expect(result).toEqual([]);
      game.packs = savedPacks;
    });

    it('should include citation information', async () => {
      const results = await rules.searchCompendiums('fireball');
      expect(results[0].rule.citation).toBeDefined();
      expect(results[0].rule.citation.compendiumName).toBe('dnd5e.spells');
    });

    it('should include tags from document', async () => {
      const results = await rules.searchCompendiums('fireball');
      expect(results[0].rule.tags).toContain('spell');
      expect(results[0].rule.tags).toContain('evocation');
    });
  });

  // =========================================================================
  // _extractCompendiumEntry
  // =========================================================================
  describe('_extractCompendiumEntry', () => {
    it('should extract JournalEntry content from pages', async () => {
      const pack = {
        collection: 'world.rules',
        documentName: 'JournalEntry',
        metadata: { label: 'Rules' },
        getDocument: vi.fn().mockResolvedValue({
          name: 'Combat Rules',
          pages: [
            { type: 'text', text: { content: '<p>Combat is exciting</p>' } },
            { type: 'text', text: { content: '<p>Roll initiative</p>' } }
          ],
          system: {},
          flags: {}
        })
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Combat Rules' });
      expect(entry.title).toBe('Combat Rules');
      expect(entry.content).toContain('Combat is exciting');
      expect(entry.content).toContain('Roll initiative');
      expect(entry.category).toBe('rules');
    });

    it('should extract Item content from system.description', async () => {
      const pack = {
        collection: 'dnd5e.items',
        documentName: 'Item',
        metadata: { label: 'Items' },
        getDocument: vi.fn().mockResolvedValue({
          name: 'Longsword',
          type: 'weapon',
          system: { description: { value: '<p>A versatile weapon</p>' } },
          flags: {}
        })
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Longsword' });
      expect(entry.title).toBe('Longsword');
      expect(entry.content).toContain('versatile weapon');
      expect(entry.category).toBe('weapon');
    });

    it('should extract Actor content from biography', async () => {
      const pack = {
        collection: 'dnd5e.monsters',
        documentName: 'Actor',
        metadata: { label: 'Monsters' },
        getDocument: vi.fn().mockResolvedValue({
          name: 'Goblin',
          type: 'npc',
          system: { details: { biography: { value: '<p>Small but fierce</p>' } } },
          flags: {}
        })
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Goblin' });
      expect(entry.title).toBe('Goblin');
      expect(entry.content).toContain('Small but fierce');
      expect(entry.category).toBe('creature');
    });

    it('should return null when document is not found', async () => {
      const pack = {
        collection: 'world.rules',
        documentName: 'JournalEntry',
        metadata: { label: 'Rules' },
        getDocument: vi.fn().mockResolvedValue(null)
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Missing' });
      expect(entry).toBeNull();
    });

    it('should return null on error', async () => {
      const pack = {
        collection: 'world.rules',
        documentName: 'JournalEntry',
        metadata: { label: 'Rules' },
        getDocument: vi.fn().mockRejectedValue(new Error('Failed'))
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Bad' });
      expect(entry).toBeNull();
    });

    it('should handle generic document types with fallback', async () => {
      const pack = {
        collection: 'custom.pack',
        documentName: 'RollTable',
        metadata: { label: 'Tables' },
        getDocument: vi.fn().mockResolvedValue({
          name: 'Treasure',
          system: { description: { value: '<p>Roll for treasure</p>' } },
          flags: {}
        })
      };
      const entry = await rules._extractCompendiumEntry(pack, { _id: '1', name: 'Treasure' });
      expect(entry.content).toContain('Roll for treasure');
      expect(entry.category).toBe('general');
    });
  });


  // =========================================================================
  // _extractTags
  // =========================================================================
  describe('_extractTags', () => {
    it('should extract type as a tag', () => {
      const tags = rules._extractTags({ type: 'spell' });
      expect(tags).toContain('spell');
    });

    it('should extract system tags', () => {
      const tags = rules._extractTags({ system: { tags: ['fire', 'damage'] } });
      expect(tags).toContain('fire');
      expect(tags).toContain('damage');
    });

    it('should extract actionType', () => {
      const tags = rules._extractTags({ system: { actionType: 'rsak' } });
      expect(tags).toContain('rsak');
    });

    it('should extract spell school', () => {
      const tags = rules._extractTags({ system: { school: 'evocation' } });
      expect(tags).toContain('evocation');
    });

    it('should filter out null/undefined tags', () => {
      const tags = rules._extractTags({ type: null, system: { tags: [null, undefined, 'valid'] } });
      expect(tags).toContain('valid');
      expect(tags).not.toContain(null);
    });

    it('should return empty array for document with no tag data', () => {
      const tags = rules._extractTags({});
      expect(tags).toEqual([]);
    });
  });

  // =========================================================================
  // _extractCitation
  // =========================================================================
  describe('_extractCitation', () => {
    it('should extract basic citation from pack', () => {
      const pack = { collection: 'dnd5e.spells', metadata: { label: 'Spells (SRD)' } };
      const doc = { system: {}, flags: {} };
      const citation = rules._extractCitation(pack, doc);
      expect(citation.compendiumName).toBe('dnd5e.spells');
      expect(citation.compendiumLabel).toBe('Spells (SRD)');
      expect(citation.formatted).toBeTruthy();
    });

    it('should extract sourcebook from string source', () => {
      const pack = { collection: 'dnd5e.spells', metadata: { label: 'Spells' } };
      const doc = { system: { source: 'PHB pg. 241' }, flags: {} };
      const citation = rules._extractCitation(pack, doc);
      expect(citation.sourcebook).toBe('PHB');
      expect(citation.page).toBe(241);
    });

    it('should extract sourcebook from object source', () => {
      const pack = { collection: 'dnd5e.spells', metadata: { label: 'Spells' } };
      const doc = { system: { source: { book: 'PHB', page: '241' } }, flags: {} };
      const citation = rules._extractCitation(pack, doc);
      expect(citation.sourcebook).toBe('PHB');
      expect(citation.page).toBe(241);
    });

    it('should extract source from flags.core.sourceId', () => {
      const pack = { collection: 'test.pack', metadata: { label: 'Test' } };
      const doc = { system: {}, flags: { core: { sourceId: 'Compendium.dnd5e-phb.spells.abc' } } };
      const citation = rules._extractCitation(pack, doc);
      expect(citation.sourcebook).toBeTruthy();
    });

    it('should extract page from system.details.page', () => {
      const pack = { collection: 'test.pack', metadata: { label: 'Test' } };
      const doc = { system: { details: { page: '42' } }, flags: {} };
      const citation = rules._extractCitation(pack, doc);
      expect(citation.page).toBe(42);
    });
  });

  // =========================================================================
  // _parseSourcebookAbbreviation
  // =========================================================================
  describe('_parseSourcebookAbbreviation', () => {
    it('should return null for null', () => {
      expect(rules._parseSourcebookAbbreviation(null)).toBeNull();
    });

    it('should return null for non-string', () => {
      expect(rules._parseSourcebookAbbreviation(42)).toBeNull();
    });

    it('should recognize PHB', () => {
      expect(rules._parseSourcebookAbbreviation('PHB')).toBe('PHB');
    });

    it('should recognize DMG', () => {
      expect(rules._parseSourcebookAbbreviation('DMG')).toBe('DMG');
    });

    it('should recognize MM', () => {
      expect(rules._parseSourcebookAbbreviation('MM')).toBe('MM');
    });

    it('should recognize "Player" as PHB', () => {
      expect(rules._parseSourcebookAbbreviation('Player')).toBe('PHB');
    });

    it('should recognize "Xanathar" as XGtE', () => {
      expect(rules._parseSourcebookAbbreviation('Xanathar')).toBe('XGtE');
    });

    it('should recognize SRD', () => {
      expect(rules._parseSourcebookAbbreviation('SRD')).toBe('SRD');
    });

    it('should recognize "Basic" as SRD', () => {
      expect(rules._parseSourcebookAbbreviation('Basic')).toBe('SRD');
    });

    it('should find abbreviation in longer string', () => {
      expect(rules._parseSourcebookAbbreviation('dnd5e-phb-content')).toBe('PHB');
    });

    it('should extract uppercase abbreviation as fallback', () => {
      const result = rules._parseSourcebookAbbreviation('some XYZW content');
      expect(result).toBe('XYZW');
    });

    it('should return null when no abbreviation found', () => {
      expect(rules._parseSourcebookAbbreviation('no abbreviations here')).toBeNull();
    });
  });

  // =========================================================================
  // _formatCitation
  // =========================================================================
  describe('_formatCitation', () => {
    it('should format citation with label and source and page', () => {
      const result = rules._formatCitation({
        compendiumLabel: 'Spells',
        sourcebook: 'PHB',
        page: 241
      });
      expect(result).toBe('Spells - PHB p. 241');
    });

    it('should format citation with label and source without page', () => {
      const result = rules._formatCitation({
        compendiumLabel: 'Spells',
        sourcebook: 'PHB',
        page: null
      });
      expect(result).toBe('Spells - PHB');
    });

    it('should format citation with label only', () => {
      const result = rules._formatCitation({
        compendiumLabel: 'Spells',
        sourcebook: null,
        page: null
      });
      expect(result).toBe('Spells');
    });

    it('should format citation with page only', () => {
      const result = rules._formatCitation({
        compendiumLabel: null,
        sourcebook: null,
        page: 42
      });
      expect(result).toBe('p. 42');
    });

    it('should return empty string for empty citation', () => {
      const result = rules._formatCitation({
        compendiumLabel: null,
        sourcebook: null,
        page: null
      });
      expect(result).toBe('');
    });
  });

  // =========================================================================
  // _hasQuestionWord
  // =========================================================================
  describe('_hasQuestionWord', () => {
    it('should return true for English question words', () => {
      expect(rules._hasQuestionWord('how does it work')).toBe(true);
      expect(rules._hasQuestionWord('what is this')).toBe(true);
      expect(rules._hasQuestionWord('can i do this')).toBe(true);
    });

    it('should return true for Italian question words', () => {
      expect(rules._hasQuestionWord('come funziona')).toBe(true);
      expect(rules._hasQuestionWord('cosa succede')).toBe(true);
      expect(rules._hasQuestionWord('posso farlo')).toBe(true);
    });

    it('should return false for no question words', () => {
      expect(rules._hasQuestionWord('the sun shines bright')).toBe(false);
    });
  });
});
