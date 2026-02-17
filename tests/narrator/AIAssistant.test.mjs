/**
 * AIAssistant Unit Tests
 *
 * Tests for the AIAssistant class with mocked OpenAIClient.
 * Covers configuration, context analysis, off-track detection,
 * suggestion generation, NPC dialogue, rules detection, chapter
 * context management, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger before importing AIAssistant
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
  }
}));

// Mock constants
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

import { AIAssistant, DEFAULT_MODEL, MAX_CONTEXT_TOKENS } from '../../scripts/narrator/AIAssistant.mjs';

// ---------------------------------------------------------------------------
// Helper: create a mock OpenAIClient
// ---------------------------------------------------------------------------

/**
 * Creates a mock OpenAIClient with configurable post() behavior
 *
 * @param {Object} [responseOverride] - Custom response for the post method
 * @returns {Object} Mock OpenAIClient instance
 */
function createMockClient(responseOverride) {
  const defaultResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          suggestions: [
            { type: 'narration', content: 'Describe the dark hallway', confidence: 0.8, pageReference: 'Chapter 1' }
          ],
          offTrackStatus: { isOffTrack: false, severity: 0, reason: 'Players are on track' },
          relevantPages: ['page-1'],
          summary: 'Players enter the dungeon'
        })
      }
    }]
  };

  return {
    isConfigured: true,
    post: vi.fn().mockResolvedValue(responseOverride || defaultResponse),
    request: vi.fn().mockResolvedValue(responseOverride || defaultResponse)
  };
}

/**
 * Creates a mock API response wrapping a JSON content string
 *
 * @param {Object} data - The data to include in the response
 * @returns {Object} Mock API response
 */
function createApiResponse(data) {
  return {
    choices: [{
      message: {
        content: JSON.stringify(data)
      }
    }]
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIAssistant', () => {
  let assistant;
  let mockClient;

  beforeEach(() => {
    mockClient = createMockClient();
    assistant = new AIAssistant({ openaiClient: mockClient });
  });

  // =========================================================================
  // Construction and configuration
  // =========================================================================

  describe('constructor and configuration', () => {
    it('should create an instance with default options', () => {
      const a = new AIAssistant();
      expect(a.getModel()).toBe(DEFAULT_MODEL);
      expect(a.getSensitivity()).toBe('medium');
      expect(a.getPrimaryLanguage()).toBe('it');
      expect(a.isConfigured()).toBe(false);
    });

    it('should accept custom options', () => {
      const a = new AIAssistant({
        openaiClient: mockClient,
        model: 'gpt-4o',
        sensitivity: 'high',
        primaryLanguage: 'en'
      });
      expect(a.getModel()).toBe('gpt-4o');
      expect(a.getSensitivity()).toBe('high');
      expect(a.getPrimaryLanguage()).toBe('en');
      expect(a.isConfigured()).toBe(true);
    });

    it('should report configured when openaiClient.isConfigured is true', () => {
      expect(assistant.isConfigured()).toBe(true);
    });

    it('should report not configured when openaiClient is null', () => {
      const a = new AIAssistant();
      expect(a.isConfigured()).toBe(false);
    });

    it('should report not configured when openaiClient.isConfigured is false', () => {
      const a = new AIAssistant({ openaiClient: { isConfigured: false } });
      expect(a.isConfigured()).toBe(false);
    });
  });

  // =========================================================================
  // Setter/getter methods
  // =========================================================================

  describe('setter and getter methods', () => {
    it('should set and get the model', () => {
      assistant.setModel('gpt-4o');
      expect(assistant.getModel()).toBe('gpt-4o');
    });

    it('should fall back to default model when null is passed', () => {
      assistant.setModel(null);
      expect(assistant.getModel()).toBe(DEFAULT_MODEL);
    });

    it('should set and get sensitivity', () => {
      assistant.setSensitivity('high');
      expect(assistant.getSensitivity()).toBe('high');

      assistant.setSensitivity('low');
      expect(assistant.getSensitivity()).toBe('low');
    });

    it('should ignore invalid sensitivity values', () => {
      assistant.setSensitivity('extreme');
      expect(assistant.getSensitivity()).toBe('medium'); // unchanged
    });

    it('should set and get adventure context', () => {
      assistant.setAdventureContext('A dark dungeon awaits...');
      expect(assistant.getAdventureContext()).toBe('A dark dungeon awaits...');
    });

    it('should handle null adventure context', () => {
      assistant.setAdventureContext(null);
      expect(assistant.getAdventureContext()).toBe('');
    });

    it('should set and get primary language', () => {
      assistant.setPrimaryLanguage('en');
      expect(assistant.getPrimaryLanguage()).toBe('en');
    });

    it('should set the OpenAI client via setOpenAIClient', () => {
      const a = new AIAssistant();
      expect(a.isConfigured()).toBe(false);
      a.setOpenAIClient(mockClient);
      expect(a.isConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // analyzeContext
  // =========================================================================

  describe('analyzeContext', () => {
    it('should throw if not configured', async () => {
      const a = new AIAssistant();
      await expect(a.analyzeContext('hello')).rejects.toThrow('not configured');
    });

    it('should throw if transcription is empty', async () => {
      await expect(assistant.analyzeContext('')).rejects.toThrow('No transcription');
    });

    it('should throw if transcription is not a string', async () => {
      await expect(assistant.analyzeContext(123)).rejects.toThrow('No transcription');
    });

    it('should return a valid ContextAnalysis object', async () => {
      const result = await assistant.analyzeContext('The players enter the tavern');

      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('offTrackStatus');
      expect(result).toHaveProperty('relevantPages');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('sceneInfo');
      expect(result).toHaveProperty('rulesQuestions');
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.relevantPages)).toBe(true);
      expect(Array.isArray(result.rulesQuestions)).toBe(true);
    });

    it('should call openaiClient.post with correct endpoint', async () => {
      await assistant.analyzeContext('Test transcription');

      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: DEFAULT_MODEL,
          messages: expect.any(Array),
          temperature: 0.7,
          max_tokens: 1000
        })
      );
    });

    it('should include adventure context in messages when set', async () => {
      assistant.setAdventureContext('The heroes must find the lost artifact');
      await assistant.analyzeContext('We search the room');

      const callArgs = mockClient.post.mock.calls[0][1];
      const systemMessages = callArgs.messages.filter(m => m.role === 'system');
      const contextMsg = systemMessages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain('lost artifact');
    });

    it('should detect rules questions when detectRules is true', async () => {
      const response = createApiResponse({
        suggestions: [],
        offTrackStatus: { isOffTrack: false, severity: 0, reason: '' },
        relevantPages: [],
        summary: 'Rules question detected'
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('How does grappling work?');

      expect(result.rulesQuestions.length).toBeGreaterThan(0);
      expect(result.rulesQuestions[0].type).toBe('combat');
    });

    it('should not detect rules questions when detectRules is false', async () => {
      const response = createApiResponse({
        suggestions: [],
        offTrackStatus: { isOffTrack: false, severity: 0, reason: '' },
        relevantPages: [],
        summary: 'No rules'
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('How does grappling work?', { detectRules: false });

      expect(result.rulesQuestions).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockClient.post.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(assistant.analyzeContext('test')).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle malformed JSON in API response', async () => {
      const response = {
        choices: [{
          message: {
            content: 'This is not valid JSON'
          }
        }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('test transcription');

      // Should fallback gracefully
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('narration');
      expect(result.suggestions[0].confidence).toBe(0.5);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const response = {
        choices: [{
          message: {
            content: '```json\n{"suggestions": [{"type": "action", "content": "Check for traps", "confidence": 0.9}], "offTrackStatus": {"isOffTrack": false, "severity": 0, "reason": ""}, "relevantPages": [], "summary": "Exploring"}\n```'
          }
        }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('We enter the room');

      expect(result.suggestions[0].type).toBe('action');
      expect(result.suggestions[0].content).toBe('Check for traps');
    });

    it('should update session state after analysis', async () => {
      const stats1 = assistant.getStats();
      expect(stats1.suggestionsGenerated).toBe(0);

      await assistant.analyzeContext('test');

      const stats2 = assistant.getStats();
      expect(stats2.suggestionsGenerated).toBe(1);
    });
  });

  // =========================================================================
  // detectOffTrack
  // =========================================================================

  describe('detectOffTrack', () => {
    it('should throw if not configured', async () => {
      const a = new AIAssistant();
      await expect(a.detectOffTrack('hello')).rejects.toThrow('not configured');
    });

    it('should return on-track when no adventure context is set', async () => {
      const result = await assistant.detectOffTrack('We discuss our weekend plans');

      expect(result.isOffTrack).toBe(false);
      expect(result.severity).toBe(0);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should call API when adventure context is set', async () => {
      assistant.setAdventureContext('The heroes must defeat the dragon');

      const offTrackResponse = createApiResponse({
        isOffTrack: true,
        severity: 0.8,
        reason: 'Players are discussing sports',
        narrativeBridge: 'A messenger arrives with urgent news'
      });
      mockClient.post.mockResolvedValue(offTrackResponse);

      const result = await assistant.detectOffTrack('Did you see the game last night?');

      expect(mockClient.post).toHaveBeenCalled();
      expect(result.isOffTrack).toBe(true);
      expect(result.severity).toBe(0.8);
      expect(result.reason).toBe('Players are discussing sports');
      expect(result.narrativeBridge).toBe('A messenger arrives with urgent news');
    });

    it('should return on-track result for on-track transcription', async () => {
      assistant.setAdventureContext('The heroes explore the dungeon');

      const response = createApiResponse({
        isOffTrack: false,
        severity: 0.1,
        reason: 'Players are following the adventure'
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.detectOffTrack('Let us explore the next room');

      expect(result.isOffTrack).toBe(false);
      expect(result.severity).toBe(0.1);
    });

    it('should handle API errors in detectOffTrack', async () => {
      assistant.setAdventureContext('context');
      mockClient.post.mockRejectedValue(new Error('Network error'));

      await expect(assistant.detectOffTrack('test')).rejects.toThrow('Network error');
    });
  });

  // =========================================================================
  // generateSuggestions
  // =========================================================================

  describe('generateSuggestions', () => {
    it('should throw if not configured', async () => {
      const a = new AIAssistant();
      await expect(a.generateSuggestions('hello')).rejects.toThrow('not configured');
    });

    it('should return an array of suggestions', async () => {
      const response = createApiResponse({
        suggestions: [
          { type: 'narration', content: 'Describe the eerie silence', confidence: 0.9, pageReference: 'Ch 3' },
          { type: 'action', content: 'Ask for perception check', confidence: 0.7 }
        ]
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateSuggestions('The party waits');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('narration');
      expect(result[0].content).toBe('Describe the eerie silence');
      expect(result[0].pageReference).toBe('Ch 3');
      expect(result[1].type).toBe('action');
    });

    it('should respect maxSuggestions option', async () => {
      const response = createApiResponse({
        suggestions: [
          { type: 'narration', content: 'Suggestion 1', confidence: 0.9 },
          { type: 'action', content: 'Suggestion 2', confidence: 0.8 },
          { type: 'dialogue', content: 'Suggestion 3', confidence: 0.7 },
          { type: 'reference', content: 'Suggestion 4', confidence: 0.6 }
        ]
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateSuggestions('test', { maxSuggestions: 2 });

      expect(result).toHaveLength(2);
    });

    it('should handle malformed suggestions response', async () => {
      const response = {
        choices: [{ message: { content: 'Not JSON at all' } }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateSuggestions('test');

      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.3);
    });
  });

  // =========================================================================
  // generateNPCDialogue
  // =========================================================================

  describe('generateNPCDialogue', () => {
    it('should throw if not configured', async () => {
      const a = new AIAssistant();
      await expect(a.generateNPCDialogue('Bob', 'ctx', 'text')).rejects.toThrow('not configured');
    });

    it('should throw if npcName is empty', async () => {
      await expect(assistant.generateNPCDialogue('', 'ctx', 'text')).rejects.toThrow('NPC name is required');
    });

    it('should throw if npcName is not a string', async () => {
      await expect(assistant.generateNPCDialogue(42, 'ctx', 'text')).rejects.toThrow('NPC name is required');
    });

    it('should return dialogue options', async () => {
      const response = createApiResponse({
        dialogueOptions: [
          'Welcome, travelers! What brings you to my humble inn?',
          'I have heard strange noises from the cellar lately...',
          'Perhaps you can help me with a problem?'
        ]
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateNPCDialogue('Innkeeper Greta', 'Friendly innkeeper', 'We enter the inn');

      expect(result).toHaveLength(3);
      expect(result[0]).toContain('Welcome');
    });

    it('should respect maxOptions parameter', async () => {
      const response = createApiResponse({
        dialogueOptions: [
          'Option 1',
          'Option 2',
          'Option 3',
          'Option 4'
        ]
      });
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateNPCDialogue('NPC', 'ctx', 'text', { maxOptions: 2 });

      expect(result).toHaveLength(2);
    });

    it('should include NPC context in system messages', async () => {
      const response = createApiResponse({ dialogueOptions: ['Hello!'] });
      mockClient.post.mockResolvedValue(response);

      await assistant.generateNPCDialogue('Elara', 'An elven mage specializing in fire magic', 'Who are you?');

      const callArgs = mockClient.post.mock.calls[0][1];
      const systemMessages = callArgs.messages.filter(m => m.role === 'system');
      const npcMsg = systemMessages.find(m => m.content.includes('NPC PROFILE'));
      expect(npcMsg).toBeDefined();
      expect(npcMsg.content).toContain('Elara');
      expect(npcMsg.content).toContain('fire magic');
    });

    it('should handle empty dialogue response', async () => {
      const response = {
        choices: [{ message: { content: 'Invalid response' } }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateNPCDialogue('NPC', 'ctx', 'text');

      // Fallback: returns the raw content as a single option if parseable
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // =========================================================================
  // generateNarrativeBridge
  // =========================================================================

  describe('generateNarrativeBridge', () => {
    it('should throw if not configured', async () => {
      const a = new AIAssistant();
      await expect(a.generateNarrativeBridge('sit', 'target')).rejects.toThrow('not configured');
    });

    it('should return a narrative bridge string', async () => {
      const response = {
        choices: [{
          message: {
            content: 'A sudden rumble shakes the ground, drawing attention back to the ancient ruins.'
          }
        }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateNarrativeBridge(
        'Players are shopping',
        'The ancient ruins'
      );

      expect(typeof result).toBe('string');
      expect(result).toContain('rumble');
    });

    it('should return empty string when API returns empty content', async () => {
      const response = { choices: [{ message: { content: '' } }] };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.generateNarrativeBridge('sit', 'target');

      expect(result).toBe('');
    });
  });

  // =========================================================================
  // detectNPCMentions
  // =========================================================================

  describe('detectNPCMentions', () => {
    it('should detect mentioned NPCs', () => {
      const npcList = [
        { name: 'Gandalf' },
        { name: 'Frodo' },
        { name: 'Sauron' }
      ];

      const result = assistant.detectNPCMentions('Gandalf told Frodo to be careful', npcList);

      expect(result).toContain('Gandalf');
      expect(result).toContain('Frodo');
      expect(result).not.toContain('Sauron');
    });

    it('should be case-insensitive', () => {
      const npcList = [{ name: 'GANDALF' }];
      const result = assistant.detectNPCMentions('gandalf speaks', npcList);
      expect(result).toContain('GANDALF');
    });

    it('should use word boundaries to avoid partial matches', () => {
      const npcList = [{ name: 'Smith' }];
      const result = assistant.detectNPCMentions('The blacksmith forges a sword', npcList);
      // "Smith" should NOT match "blacksmith" due to word boundary
      expect(result).not.toContain('Smith');
    });

    it('should return empty array for invalid transcription', () => {
      expect(assistant.detectNPCMentions(null, [{ name: 'Test' }])).toEqual([]);
      expect(assistant.detectNPCMentions(123, [{ name: 'Test' }])).toEqual([]);
    });

    it('should return empty array for empty NPC list', () => {
      expect(assistant.detectNPCMentions('some text', [])).toEqual([]);
      expect(assistant.detectNPCMentions('some text', null)).toEqual([]);
    });

    it('should skip NPCs with no name', () => {
      const npcList = [{ name: '' }, { name: null }, {}, { name: 'Valid' }];
      const result = assistant.detectNPCMentions('Valid appears', npcList);
      expect(result).toEqual(['Valid']);
    });
  });

  // =========================================================================
  // Chapter context
  // =========================================================================

  describe('chapter context', () => {
    it('should set and get chapter context', () => {
      const chapter = {
        chapterName: 'The Dark Forest',
        subsections: ['Entrance', 'The Clearing'],
        pageReferences: [{ pageId: 'p1', pageName: 'Forest Map', journalName: 'Maps' }],
        summary: 'Players navigate through a dark forest'
      };

      assistant.setChapterContext(chapter);
      const ctx = assistant.getChapterContext();

      expect(ctx.chapterName).toBe('The Dark Forest');
      expect(ctx.subsections).toEqual(['Entrance', 'The Clearing']);
      expect(ctx.pageReferences).toHaveLength(1);
      expect(ctx.summary).toContain('dark forest');
    });

    it('should clear chapter context with null', () => {
      assistant.setChapterContext({ chapterName: 'Test' });
      assistant.setChapterContext(null);
      expect(assistant.getChapterContext()).toBeNull();
    });

    it('should clear chapter context with undefined', () => {
      assistant.setChapterContext({ chapterName: 'Test' });
      assistant.setChapterContext(undefined);
      expect(assistant.getChapterContext()).toBeNull();
    });

    it('should validate and truncate long chapter names', () => {
      const longName = 'A'.repeat(300);
      assistant.setChapterContext({ chapterName: longName });
      expect(assistant.getChapterContext().chapterName.length).toBe(200);
    });
  });

  // =========================================================================
  // generateChapterRecoveryOptions
  // =========================================================================

  describe('generateChapterRecoveryOptions', () => {
    it('should return empty array for null chapter', () => {
      const result = assistant.generateChapterRecoveryOptions(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for non-object chapter', () => {
      const result = assistant.generateChapterRecoveryOptions('not an object');
      expect(result).toEqual([]);
    });

    it('should generate subsection options', () => {
      const chapter = {
        chapterName: 'The Dungeon',
        subsections: ['Entry Hall', 'Trap Room', 'Boss Chamber']
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('subsection');
      expect(result[0].label).toBe('Entry Hall');
      expect(result[0].description).toContain('The Dungeon');
    });

    it('should generate page reference options', () => {
      const chapter = {
        pageReferences: [
          { pageId: 'p1', pageName: 'Dungeon Map', journalName: 'Maps Journal' },
          { pageId: 'p2', pageName: 'NPC List' }
        ]
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('page');
      expect(result[0].label).toBe('Dungeon Map');
      expect(result[0].pageId).toBe('p1');
      expect(result[0].journalName).toBe('Maps Journal');
      expect(result[1].journalName).toBeUndefined();
    });

    it('should add summary option when summary and other options exist', () => {
      const chapter = {
        chapterName: 'Chapter 1',
        subsections: ['Section A'],
        summary: 'This is a chapter about exploring the castle.'
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);

      // summary + 1 subsection = 2
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('summary');
      expect(result[0].label).toBe('Chapter 1');
    });

    it('should not add summary option when there are no other options', () => {
      const chapter = {
        summary: 'Only summary, no subsections or pages'
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);

      expect(result).toHaveLength(0);
    });

    it('should truncate long summary descriptions', () => {
      const longSummary = 'A'.repeat(200);
      const chapter = {
        subsections: ['Section'],
        summary: longSummary
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);
      const summaryOption = result.find(o => o.type === 'summary');

      expect(summaryOption.description.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('should skip invalid page references', () => {
      const chapter = {
        pageReferences: [null, 'invalid', { pageName: 'Valid Page' }]
      };

      const result = assistant.generateChapterRecoveryOptions(chapter);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Valid Page');
    });
  });

  // =========================================================================
  // Rules question detection
  // =========================================================================

  describe('rules question detection', () => {
    it('should detect English mechanic questions', () => {
      const result = assistant._detectRulesQuestions('How does grappling work?');
      expect(result.hasRulesQuestions).toBe(true);
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('should detect Italian mechanic questions', () => {
      const result = assistant._detectRulesQuestions('Come funziona la lotta?');
      expect(result.hasRulesQuestions).toBe(true);
    });

    it('should detect action questions', () => {
      const result = assistant._detectRulesQuestions('Can I use concentration on two spells?');
      expect(result.hasRulesQuestions).toBe(true);
      const actionQ = result.questions.find(q => q.type === 'action' || q.type === 'spell');
      expect(actionQ).toBeDefined();
    });

    it('should detect D&D mechanic terms with question words', () => {
      const result = assistant._detectRulesQuestions('How does advantage work in combat?');
      expect(result.hasRulesQuestions).toBe(true);
    });

    it('should return no questions for non-rules text', () => {
      const result = assistant._detectRulesQuestions('The merchant offers a fair price for the gem.');
      expect(result.hasRulesQuestions).toBe(false);
      expect(result.questions).toEqual([]);
    });

    it('should handle null or empty transcription', () => {
      expect(assistant._detectRulesQuestions(null).hasRulesQuestions).toBe(false);
      expect(assistant._detectRulesQuestions('').hasRulesQuestions).toBe(false);
    });

    it('should cap confidence at 1.0', () => {
      // A question that matches patterns and multiple mechanic terms
      const result = assistant._detectRulesQuestions('How does grappling with advantage work?');
      for (const q of result.questions) {
        expect(q.confidence).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // =========================================================================
  // Session management
  // =========================================================================

  describe('session management', () => {
    it('should reset session state', async () => {
      await assistant.analyzeContext('test data');
      expect(assistant.getStats().suggestionsGenerated).toBe(1);

      assistant.resetSession();

      const stats = assistant.getStats();
      expect(stats.suggestionsGenerated).toBe(0);
      expect(stats.conversationHistorySize).toBe(0);
      expect(stats.lastOffTrackCheck).toBeNull();
    });

    it('should return comprehensive stats', () => {
      assistant.setAdventureContext('some context');
      const stats = assistant.getStats();

      expect(stats.model).toBe(DEFAULT_MODEL);
      expect(stats.sensitivity).toBe('medium');
      expect(stats.primaryLanguage).toBe('it');
      expect(stats.hasContext).toBe(true);
      expect(stats.contextLength).toBeGreaterThan(0);
      expect(stats.isConfigured).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases and validation
  // =========================================================================

  describe('edge cases and validation', () => {
    it('should truncate very long adventure context', async () => {
      const longContext = 'A'.repeat(MAX_CONTEXT_TOKENS * 4 + 1000);
      assistant.setAdventureContext(longContext);

      await assistant.analyzeContext('test');

      const callArgs = mockClient.post.mock.calls[0][1];
      const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content.length).toBeLessThan(longContext.length);
      expect(contextMsg.content).toContain('[... content truncated ...]');
    });

    it('should validate numbers and clamp to range', () => {
      const response = createApiResponse({
        suggestions: [
          { type: 'narration', content: 'Test', confidence: 5.0 }
        ],
        offTrackStatus: { isOffTrack: false, severity: -1, reason: '' },
        relevantPages: [],
        summary: ''
      });

      const parsed = assistant._parseAnalysisResponse(response);

      // confidence should be clamped to 1.0
      expect(parsed.suggestions[0].confidence).toBe(1.0);
      // severity should be clamped to 0
      expect(parsed.offTrackStatus.severity).toBe(0);
    });

    it('should handle empty choices array in response', async () => {
      const response = { choices: [] };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('test');

      // Should fallback gracefully
      expect(result.suggestions).toBeDefined();
    });

    it('should handle missing message content in response', async () => {
      const response = { choices: [{ message: {} }] };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('test');
      expect(result.suggestions).toBeDefined();
    });

    it('should extract JSON from response even if wrapped in text', async () => {
      const response = {
        choices: [{
          message: {
            content: 'Here is the analysis:\n{"suggestions": [{"type": "action", "content": "Roll initiative", "confidence": 0.95}], "offTrackStatus": {"isOffTrack": false, "severity": 0, "reason": ""}, "relevantPages": [], "summary": "Combat starting"}'
          }
        }]
      };
      mockClient.post.mockResolvedValue(response);

      const result = await assistant.analyzeContext('Goblins attack!');

      expect(result.suggestions[0].content).toBe('Roll initiative');
      expect(result.suggestions[0].confidence).toBe(0.95);
    });

    it('should use word boundary regex escaping for special characters in NPC names', () => {
      const npcList = [{ name: 'Mr. Smith (Jr.)' }];
      // Should not throw due to unescaped regex characters
      expect(() => assistant.detectNPCMentions('Mr. Smith (Jr.) arrives', npcList)).not.toThrow();
    });

    it('should match NPC names with simple special characters', () => {
      const npcList = [{ name: "O'Brien" }];
      // Word boundary after apostrophe should work
      expect(() => assistant.detectNPCMentions("O'Brien speaks", npcList)).not.toThrow();
    });

    it('should handle conversation history overflow gracefully', async () => {
      // Make many calls to fill history
      for (let i = 0; i < 25; i++) {
        await assistant.analyzeContext(`Transcription ${i}`);
      }

      const stats = assistant.getStats();
      // History should be capped at maxHistorySize (20)
      expect(stats.conversationHistorySize).toBeLessThanOrEqual(20);
    });
  });

  // =========================================================================
  // System prompt construction
  // =========================================================================

  describe('system prompt construction', () => {
    it('should include sensitivity guide based on setting', () => {
      assistant.setSensitivity('high');
      const prompt = assistant._buildSystemPrompt();
      expect(prompt).toContain('Closely monitor');
    });

    it('should include chapter context when set', () => {
      assistant.setChapterContext({
        chapterName: 'The Dragon Lair',
        summary: 'Heroes confront the dragon'
      });
      const prompt = assistant._buildSystemPrompt();
      expect(prompt).toContain('The Dragon Lair');
      expect(prompt).toContain('CURRENT CHAPTER');
    });

    it('should not include chapter section when no chapter context', () => {
      const prompt = assistant._buildSystemPrompt();
      expect(prompt).not.toContain('CURRENT CHAPTER');
    });

    it('should include the primary language in the prompt', () => {
      assistant.setPrimaryLanguage('en');
      const prompt = assistant._buildSystemPrompt();
      expect(prompt).toContain('English');
    });

    it('should fall back to English for unknown language codes', () => {
      assistant.setPrimaryLanguage('xx');
      const prompt = assistant._buildSystemPrompt();
      expect(prompt).toContain('English');
    });
  });

  // =========================================================================
  // Exported constants
  // =========================================================================

  describe('exported constants', () => {
    it('should export DEFAULT_MODEL as gpt-4o-mini', () => {
      expect(DEFAULT_MODEL).toBe('gpt-4o-mini');
    });

    it('should export MAX_CONTEXT_TOKENS as 8000', () => {
      expect(MAX_CONTEXT_TOKENS).toBe(8000);
    });
  });

  // =========================================================================
  // Silence Detection Integration
  // =========================================================================

  describe('silence detection integration', () => {
    /**
     * Creates a mock SilenceDetector
     */
    function createMockSilenceDetector(options = {}) {
      return {
        start: vi.fn(),
        stop: vi.fn(),
        recordActivity: vi.fn().mockReturnValue(true),
        setOnSilenceCallback: vi.fn(),
        getThreshold: vi.fn().mockReturnValue(options.threshold ?? 30000),
        isEnabled: vi.fn().mockReturnValue(options.isEnabled ?? false),
        getStats: vi.fn().mockReturnValue({
          isEnabled: options.isEnabled ?? false,
          thresholdMs: options.threshold ?? 30000,
          silenceCount: options.silenceCount ?? 0
        })
      };
    }

    describe('setSilenceDetector', () => {
      it('should set the silence detector', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        expect(assistant.getSilenceDetector()).toBe(mockDetector);
      });

      it('should stop existing monitoring when detector changes', () => {
        const mockDetector1 = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector1);
        assistant.startSilenceMonitoring();

        expect(assistant.isSilenceMonitoringActive()).toBe(true);

        const mockDetector2 = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector2);

        expect(mockDetector1.stop).toHaveBeenCalled();
        expect(assistant.isSilenceMonitoringActive()).toBe(false);
      });
    });

    describe('startSilenceMonitoring', () => {
      it('should return false when no silence detector configured', () => {
        const result = assistant.startSilenceMonitoring();
        expect(result).toBe(false);
      });

      it('should return false when OpenAI client not configured', () => {
        const a = new AIAssistant({ silenceDetector: createMockSilenceDetector() });
        const result = a.startSilenceMonitoring();
        expect(result).toBe(false);
      });

      it('should start monitoring and return true when properly configured', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);

        const result = assistant.startSilenceMonitoring();

        expect(result).toBe(true);
        expect(mockDetector.setOnSilenceCallback).toHaveBeenCalled();
        expect(mockDetector.start).toHaveBeenCalled();
        expect(assistant.isSilenceMonitoringActive()).toBe(true);
      });

      it('should return true if already monitoring', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        const result = assistant.startSilenceMonitoring();

        expect(result).toBe(true);
        // Only called once
        expect(mockDetector.start).toHaveBeenCalledTimes(1);
      });
    });

    describe('stopSilenceMonitoring', () => {
      it('should do nothing if not monitoring', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);

        assistant.stopSilenceMonitoring();

        expect(mockDetector.stop).not.toHaveBeenCalled();
      });

      it('should stop monitoring when active', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        assistant.stopSilenceMonitoring();

        expect(mockDetector.stop).toHaveBeenCalled();
        expect(assistant.isSilenceMonitoringActive()).toBe(false);
      });
    });

    describe('recordActivityForSilenceDetection', () => {
      it('should return false when monitoring not active', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);

        const result = assistant.recordActivityForSilenceDetection();

        expect(result).toBe(false);
        expect(mockDetector.recordActivity).not.toHaveBeenCalled();
      });

      it('should record activity when monitoring is active', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        const result = assistant.recordActivityForSilenceDetection();

        expect(result).toBe(true);
        expect(mockDetector.recordActivity).toHaveBeenCalled();
      });
    });

    describe('setOnAutonomousSuggestionCallback', () => {
      it('should set the callback function', () => {
        const callback = vi.fn();
        assistant.setOnAutonomousSuggestionCallback(callback);
        expect(assistant.getOnAutonomousSuggestionCallback()).toBe(callback);
      });

      it('should accept null to clear callback', () => {
        assistant.setOnAutonomousSuggestionCallback(vi.fn());
        assistant.setOnAutonomousSuggestionCallback(null);
        expect(assistant.getOnAutonomousSuggestionCallback()).toBeNull();
      });

      it('should ignore non-function values', () => {
        const callback = vi.fn();
        assistant.setOnAutonomousSuggestionCallback(callback);
        assistant.setOnAutonomousSuggestionCallback('not a function');
        expect(assistant.getOnAutonomousSuggestionCallback()).toBe(callback);
      });
    });

    describe('silence event handling', () => {
      it('should generate suggestion and invoke callback on silence', async () => {
        const suggestionResponse = createApiResponse({
          suggestions: [
            { type: 'narration', content: 'The tavern falls silent...', confidence: 0.85 }
          ]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        const suggestionCallback = vi.fn();

        assistant.setSilenceDetector(mockDetector);
        assistant.setOnAutonomousSuggestionCallback(suggestionCallback);
        assistant.startSilenceMonitoring();

        // Capture the callback set on silence detector
        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];

        // Trigger the silence event
        await silenceHandler({
          silenceDurationMs: 35000,
          lastActivityTime: Date.now() - 35000,
          silenceCount: 1
        });

        // Verify suggestion was generated
        expect(mockClient.post).toHaveBeenCalled();

        // Verify callback was invoked with suggestion
        expect(suggestionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            suggestion: expect.objectContaining({
              type: 'narration',
              content: 'The tavern falls silent...'
            }),
            silenceEvent: expect.objectContaining({
              silenceDurationMs: 35000,
              silenceCount: 1
            })
          })
        );
      });

      it('should track silence suggestion count', async () => {
        const suggestionResponse = createApiResponse({
          suggestions: [{ type: 'action', content: 'Roll for initiative', confidence: 0.9 }]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];

        expect(assistant.getStats().silenceSuggestionCount).toBe(0);

        await silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 });

        expect(assistant.getStats().silenceSuggestionCount).toBe(1);

        await silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 2 });

        expect(assistant.getStats().silenceSuggestionCount).toBe(2);
      });

      it('should use chapter context in autonomous suggestions', async () => {
        const suggestionResponse = createApiResponse({
          suggestions: [{ type: 'dialogue', content: 'The innkeeper speaks', confidence: 0.8 }]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.setChapterContext({
          chapterName: 'The Haunted Inn',
          summary: 'Players investigate ghostly occurrences'
        });
        assistant.startSilenceMonitoring();

        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];
        await silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 });

        const callArgs = mockClient.post.mock.calls[0][1];
        const userMessage = callArgs.messages.find(m => m.role === 'user');
        expect(userMessage.content).toContain('The Haunted Inn');
      });

      it('should use RAG context for autonomous suggestions when available', async () => {
        const mockRetriever = {
          isConfigured: vi.fn().mockReturnValue(true),
          hasKeywordFallback: vi.fn().mockReturnValue(true),
          hasIndex: vi.fn().mockReturnValue(true),
          retrieveForAI: vi.fn().mockResolvedValue({
            context: '[Adventure > Chapter 5]\nThe ghost appears at midnight.',
            sources: ['[Adventure > Chapter 5]']
          })
        };

        const suggestionResponse = createApiResponse({
          suggestions: [{ type: 'narration', content: 'The clock strikes twelve...', confidence: 0.9 }]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.setRAGRetriever(mockRetriever);
        assistant.startSilenceMonitoring();

        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];
        await silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 });

        expect(mockRetriever.retrieveForAI).toHaveBeenCalled();

        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('RELEVANT SOURCES');
        expect(contextMsg.content).toContain('ghost appears at midnight');
      });

      it('should handle callback errors gracefully', async () => {
        const suggestionResponse = createApiResponse({
          suggestions: [{ type: 'action', content: 'Test', confidence: 0.9 }]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        const errorCallback = vi.fn().mockImplementation(() => {
          throw new Error('Callback error');
        });

        assistant.setSilenceDetector(mockDetector);
        assistant.setOnAutonomousSuggestionCallback(errorCallback);
        assistant.startSilenceMonitoring();

        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];

        // Should not throw
        await expect(
          silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 })
        ).resolves.not.toThrow();

        // Callback should have been called despite error
        expect(errorCallback).toHaveBeenCalled();

        // Suggestion count should still be tracked
        expect(assistant.getStats().silenceSuggestionCount).toBe(1);
      });

      it('should not generate suggestion when not configured', async () => {
        const a = new AIAssistant(); // No OpenAI client
        const mockDetector = createMockSilenceDetector();

        a.setSilenceDetector(mockDetector);
        // Can't start monitoring without OpenAI client
        a.startSilenceMonitoring();

        // Manually test _handleSilenceEvent
        await a._handleSilenceEvent({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 });

        // No stats increment since no suggestion was generated
        expect(a.getStats().silenceSuggestionCount).toBe(0);
      });
    });

    describe('silence stats in getStats', () => {
      it('should include silence-related stats', () => {
        const stats = assistant.getStats();

        expect(stats).toHaveProperty('silenceDetectorConfigured');
        expect(stats).toHaveProperty('silenceMonitoringActive');
        expect(stats).toHaveProperty('silenceSuggestionCount');
        expect(stats).toHaveProperty('hasAutonomousSuggestionCallback');
      });

      it('should reflect current silence monitoring state', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);

        let stats = assistant.getStats();
        expect(stats.silenceDetectorConfigured).toBe(true);
        expect(stats.silenceMonitoringActive).toBe(false);

        assistant.startSilenceMonitoring();

        stats = assistant.getStats();
        expect(stats.silenceMonitoringActive).toBe(true);

        assistant.stopSilenceMonitoring();

        stats = assistant.getStats();
        expect(stats.silenceMonitoringActive).toBe(false);
      });

      it('should track autonomous suggestion callback state', () => {
        expect(assistant.getStats().hasAutonomousSuggestionCallback).toBe(false);

        assistant.setOnAutonomousSuggestionCallback(vi.fn());

        expect(assistant.getStats().hasAutonomousSuggestionCallback).toBe(true);
      });
    });

    describe('silence state on session reset', () => {
      it('should stop monitoring on session reset', () => {
        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        expect(assistant.isSilenceMonitoringActive()).toBe(true);

        assistant.resetSession();

        expect(mockDetector.stop).toHaveBeenCalled();
        expect(assistant.isSilenceMonitoringActive()).toBe(false);
      });

      it('should reset silence suggestion count on session reset', async () => {
        const suggestionResponse = createApiResponse({
          suggestions: [{ type: 'action', content: 'Test', confidence: 0.9 }]
        });
        mockClient.post.mockResolvedValue(suggestionResponse);

        const mockDetector = createMockSilenceDetector();
        assistant.setSilenceDetector(mockDetector);
        assistant.startSilenceMonitoring();

        const silenceHandler = mockDetector.setOnSilenceCallback.mock.calls[0][0];
        await silenceHandler({ silenceDurationMs: 30000, lastActivityTime: Date.now(), silenceCount: 1 });

        expect(assistant.getStats().silenceSuggestionCount).toBe(1);

        assistant.resetSession();

        expect(assistant.getStats().silenceSuggestionCount).toBe(0);
      });
    });

    describe('constructor options for silence', () => {
      it('should accept silence detector in constructor', () => {
        const mockDetector = createMockSilenceDetector();
        const a = new AIAssistant({
          openaiClient: mockClient,
          silenceDetector: mockDetector
        });

        expect(a.getSilenceDetector()).toBe(mockDetector);
      });

      it('should accept autonomous suggestion callback in constructor', () => {
        const callback = vi.fn();
        const a = new AIAssistant({
          openaiClient: mockClient,
          onAutonomousSuggestion: callback
        });

        expect(a.getOnAutonomousSuggestionCallback()).toBe(callback);
      });
    });
  });

  // =========================================================================
  // RAG Integration
  // =========================================================================

  describe('RAG integration', () => {
    /**
     * Creates a mock RAGRetriever with configurable behavior
     */
    function createMockRAGRetriever(options = {}) {
      return {
        isConfigured: vi.fn().mockReturnValue(options.isConfigured ?? true),
        hasKeywordFallback: vi.fn().mockReturnValue(options.hasKeywordFallback ?? true),
        hasIndex: vi.fn().mockReturnValue(options.hasIndex ?? true),
        retrieveForAI: vi.fn().mockResolvedValue(options.retrieveResult ?? {
          context: '[Test Journal > Test Page]\nRelevant content about the dungeon entrance.\n\n',
          sources: ['[Test Journal > Test Page]']
        })
      };
    }

    describe('setRAGRetriever', () => {
      it('should set the RAG retriever', () => {
        const mockRetriever = createMockRAGRetriever();
        assistant.setRAGRetriever(mockRetriever);
        expect(assistant.getRAGRetriever()).toBe(mockRetriever);
      });

      it('should clear cached RAG context when retriever changes', () => {
        assistant._cachedRAGContext = { context: 'old', sources: [] };
        assistant.setRAGRetriever(createMockRAGRetriever());
        expect(assistant.getCachedRAGContext()).toBeNull();
      });
    });

    describe('isRAGConfigured', () => {
      it('should return false when no RAG retriever is set', () => {
        expect(assistant.isRAGConfigured()).toBe(false);
      });

      it('should return false when RAG is disabled via setUseRAG', () => {
        assistant.setRAGRetriever(createMockRAGRetriever());
        assistant.setUseRAG(false);
        expect(assistant.isRAGConfigured()).toBe(false);
      });

      it('should return false when retriever has no index', () => {
        assistant.setRAGRetriever(createMockRAGRetriever({ hasIndex: false }));
        expect(assistant.isRAGConfigured()).toBe(false);
      });

      it('should return true when retriever is configured with index', () => {
        assistant.setRAGRetriever(createMockRAGRetriever({
          isConfigured: true,
          hasIndex: true
        }));
        expect(assistant.isRAGConfigured()).toBe(true);
      });

      it('should return true when retriever has keyword fallback and index', () => {
        assistant.setRAGRetriever(createMockRAGRetriever({
          isConfigured: false,
          hasKeywordFallback: true,
          hasIndex: true
        }));
        expect(assistant.isRAGConfigured()).toBe(true);
      });
    });

    describe('RAG context retrieval in analyzeContext', () => {
      it('should use RAG context when configured', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: '[Adventure Journal > Chapter 1]\nThe heroes enter the ancient dungeon.',
            sources: ['[Adventure Journal > Chapter 1]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        await assistant.analyzeContext('We enter the dungeon');

        expect(mockRetriever.retrieveForAI).toHaveBeenCalledWith(
          'We enter the dungeon',
          expect.objectContaining({ maxResults: 5, maxChars: 5000 })
        );

        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg).toBeDefined();
        expect(contextMsg.content).toContain('RELEVANT SOURCES');
        expect(contextMsg.content).toContain('Adventure Journal > Chapter 1');
      });

      it('should fall back to adventure context when RAG retrieval returns empty', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: { context: '', sources: [] }
        });
        assistant.setRAGRetriever(mockRetriever);
        assistant.setAdventureContext('The ancient dungeon awaits...');

        await assistant.analyzeContext('Test');

        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('ancient dungeon awaits');
        expect(contextMsg.content).not.toContain('RELEVANT SOURCES');
      });

      it('should fall back to adventure context when RAG retrieval fails', async () => {
        const mockRetriever = createMockRAGRetriever();
        mockRetriever.retrieveForAI.mockRejectedValue(new Error('Embedding API error'));
        assistant.setRAGRetriever(mockRetriever);
        assistant.setAdventureContext('Fallback adventure context');

        await assistant.analyzeContext('Test');

        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('Fallback adventure context');
      });

      it('should use adventure context when RAG is not configured', async () => {
        assistant.setAdventureContext('Non-RAG adventure context');

        await assistant.analyzeContext('Test');

        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('Non-RAG adventure context');
      });

      it('should cache RAG context after retrieval', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: 'Cached content',
            sources: ['[Source 1]', '[Source 2]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        await assistant.analyzeContext('Test');

        const cached = assistant.getCachedRAGContext();
        expect(cached).toEqual({
          context: 'Cached content',
          sources: ['[Source 1]', '[Source 2]']
        });
      });
    });

    describe('RAG context in detectOffTrack', () => {
      it('should use RAG context for off-track detection', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: '[Adventure > Plot]\nThe heroes should investigate the temple.',
            sources: ['[Adventure > Plot]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        const offTrackResponse = createApiResponse({
          isOffTrack: true,
          severity: 0.7,
          reason: 'Players are discussing unrelated topics'
        });
        mockClient.post.mockResolvedValue(offTrackResponse);

        await assistant.detectOffTrack('What should we have for dinner?');

        expect(mockRetriever.retrieveForAI).toHaveBeenCalled();
        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('RELEVANT SOURCES');
      });

      it('should allow off-track detection with only RAG (no adventure context)', async () => {
        const mockRetriever = createMockRAGRetriever();
        assistant.setRAGRetriever(mockRetriever);
        // Don't set adventure context

        const offTrackResponse = createApiResponse({
          isOffTrack: false,
          severity: 0,
          reason: 'On track'
        });
        mockClient.post.mockResolvedValue(offTrackResponse);

        const result = await assistant.detectOffTrack('Test');

        expect(mockClient.post).toHaveBeenCalled();
        expect(result.reason).toBe('On track');
      });
    });

    describe('RAG context in generateSuggestions', () => {
      it('should use RAG context for suggestions', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: '[NPC Guide > Tavern Keeper]\nGreta is a friendly innkeeper.',
            sources: ['[NPC Guide > Tavern Keeper]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        const response = createApiResponse({
          suggestions: [
            { type: 'dialogue', content: 'Welcome travelers!', confidence: 0.9 }
          ]
        });
        mockClient.post.mockResolvedValue(response);

        await assistant.generateSuggestions('We speak to the innkeeper');

        expect(mockRetriever.retrieveForAI).toHaveBeenCalled();
        const callArgs = mockClient.post.mock.calls[0][1];
        const contextMsg = callArgs.messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
        expect(contextMsg.content).toContain('Greta');
      });
    });

    describe('RAG context in generateNarrativeBridge', () => {
      it('should use RAG context for narrative bridge', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: '[Locations > Temple]\nThe ancient temple holds many secrets.',
            sources: ['[Locations > Temple]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        const response = {
          choices: [{
            message: {
              content: 'A mysterious light emanates from the temple entrance...'
            }
          }]
        };
        mockClient.post.mockResolvedValue(response);

        await assistant.generateNarrativeBridge('Players are shopping', 'The ancient temple');

        expect(mockRetriever.retrieveForAI).toHaveBeenCalledWith(
          'Players are shopping The ancient temple',
          expect.any(Object)
        );
      });
    });

    describe('_formatRAGContext', () => {
      it('should format RAG context with sources header', () => {
        const ragResult = {
          context: 'Retrieved content from journals.',
          sources: ['[Journal A > Page 1]', '[Journal B > Page 2]']
        };

        const formatted = assistant._formatRAGContext(ragResult);

        expect(formatted).toContain('RELEVANT SOURCES: [Journal A > Page 1], [Journal B > Page 2]');
        expect(formatted).toContain('---');
        expect(formatted).toContain('Retrieved content from journals.');
      });

      it('should return context without header when no sources', () => {
        const ragResult = {
          context: 'Just some content.',
          sources: []
        };

        const formatted = assistant._formatRAGContext(ragResult);

        expect(formatted).toBe('Just some content.');
        expect(formatted).not.toContain('RELEVANT SOURCES');
      });

      it('should return empty string for null ragResult', () => {
        expect(assistant._formatRAGContext(null)).toBe('');
        expect(assistant._formatRAGContext({})).toBe('');
        expect(assistant._formatRAGContext({ context: '' })).toBe('');
      });
    });

    describe('RAG configuration options', () => {
      it('should accept RAG options in constructor', () => {
        const a = new AIAssistant({
          openaiClient: mockClient,
          ragRetriever: createMockRAGRetriever(),
          useRAG: true,
          ragMaxResults: 10,
          ragMaxChars: 8000
        });

        const stats = a.getStats();
        expect(stats.ragEnabled).toBe(true);
        expect(stats.ragMaxResults).toBe(10);
        expect(stats.ragMaxChars).toBe(8000);
      });

      it('should toggle RAG usage via setUseRAG', () => {
        assistant.setRAGRetriever(createMockRAGRetriever());
        expect(assistant.getUseRAG()).toBe(true);

        assistant.setUseRAG(false);
        expect(assistant.getUseRAG()).toBe(false);
        expect(assistant.isRAGConfigured()).toBe(false);

        assistant.setUseRAG(true);
        expect(assistant.getUseRAG()).toBe(true);
      });
    });

    describe('RAG stats', () => {
      it('should include RAG stats in getStats', () => {
        const stats = assistant.getStats();

        expect(stats).toHaveProperty('ragConfigured');
        expect(stats).toHaveProperty('ragEnabled');
        expect(stats).toHaveProperty('ragMaxResults');
        expect(stats).toHaveProperty('ragMaxChars');
        expect(stats).toHaveProperty('ragHasCachedContext');
        expect(stats).toHaveProperty('ragCachedSourceCount');
      });

      it('should report cached RAG context stats', async () => {
        const mockRetriever = createMockRAGRetriever({
          retrieveResult: {
            context: 'Some content',
            sources: ['[S1]', '[S2]', '[S3]']
          }
        });
        assistant.setRAGRetriever(mockRetriever);

        await assistant.analyzeContext('Test');

        const stats = assistant.getStats();
        expect(stats.ragHasCachedContext).toBe(true);
        expect(stats.ragCachedSourceCount).toBe(3);
      });
    });

    describe('RAG with session reset', () => {
      it('should clear RAG cache on session reset', async () => {
        const mockRetriever = createMockRAGRetriever();
        assistant.setRAGRetriever(mockRetriever);

        await assistant.analyzeContext('Test');
        expect(assistant.getCachedRAGContext()).not.toBeNull();

        assistant.resetSession();

        expect(assistant.getCachedRAGContext()).toBeNull();
      });
    });
  });
});
