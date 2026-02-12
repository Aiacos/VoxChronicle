/**
 * NarrativeExporter Unit Tests
 *
 * Tests for the NarrativeExporter class with proper mocking.
 * Covers chronicle formatting, AI summaries, transcript formatting,
 * and export functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing NarrativeExporter
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

// Mock HtmlUtils
vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}));

// Mock OpenAIClient
const mockPost = vi.fn();

vi.mock('../../scripts/ai/OpenAIClient.mjs', () => {
  class MockOpenAIClient {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    post(endpoint, data) {
      return mockPost(endpoint, data);
    }
  }

  return {
    OpenAIClient: MockOpenAIClient,
    OpenAIError: class OpenAIError extends Error {
      constructor(message, type, details = {}) {
        super(message);
        this.name = 'OpenAIError';
        this.type = type;
        this.details = details;
      }
    },
    OpenAIErrorType: {
      AUTHENTICATION: 'authentication',
      RATE_LIMIT: 'rate_limit',
      INVALID_REQUEST: 'invalid_request',
      API_ERROR: 'api_error',
      NETWORK_ERROR: 'network_error'
    }
  };
});

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  NarrativeExporter,
  ChronicleFormat,
  FormattingStyle
} from '../../scripts/kanka/NarrativeExporter.mjs';
import { OpenAIClient } from '../../scripts/ai/OpenAIClient.mjs';

/**
 * Create mock transcript segments
 */
function createMockSegments(overrides = []) {
  const defaults = [
    { speaker: 'GM', text: 'Welcome to the adventure!', start: 0, end: 3 },
    { speaker: 'Player1', text: 'I look around the tavern.', start: 3, end: 6 },
    { speaker: 'Player2', text: 'I order a drink from the bartender.', start: 6, end: 9 },
    { speaker: 'GM', text: 'You see a mysterious figure in the corner.', start: 9, end: 13 }
  ];

  return overrides.length > 0 ? overrides : defaults;
}

/**
 * Create mock session data
 */
function createMockSessionData(overrides = {}) {
  return {
    title: 'Session 1 - The Beginning',
    date: '2024-01-15',
    segments: createMockSegments(),
    entities: {
      characters: [{ name: 'Grognard', isNPC: true, description: 'A brave warrior' }],
      locations: [{ name: 'The Rusty Dragon', type: 'Tavern', description: 'A popular inn' }],
      items: [{ name: 'Magic Sword', type: 'Weapon', description: 'A glowing blade' }]
    },
    moments: [
      { title: 'First encounter', context: 'The party meets the mysterious figure', dramaScore: 8 }
    ],
    summary: 'The party begins their adventure in a tavern.',
    ...overrides
  };
}

/**
 * Create mock AI response
 */
function createMockAIResponse(content) {
  return {
    choices: [
      {
        message: {
          content
        }
      }
    ]
  };
}

describe('NarrativeExporter', () => {
  let exporter;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockPost.mockReset();

    // Create exporter instance
    exporter = new NarrativeExporter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with default settings', () => {
      const exp = new NarrativeExporter();

      expect(exp._campaignName).toBe('');
      expect(exp._defaultStyle).toBe(FormattingStyle.RICH);
      expect(exp._defaultFormat).toBe(ChronicleFormat.FULL);
      expect(exp._aiSummaryEnabled).toBe(false);
      expect(exp._openAIClient).toBeNull();
    });

    it('should accept campaign name option', () => {
      const exp = new NarrativeExporter({ campaignName: 'My Campaign' });

      expect(exp._campaignName).toBe('My Campaign');
    });

    it('should accept default style option', () => {
      const exp = new NarrativeExporter({ defaultStyle: FormattingStyle.MINIMAL });

      expect(exp._defaultStyle).toBe(FormattingStyle.MINIMAL);
    });

    it('should accept default format option', () => {
      const exp = new NarrativeExporter({ defaultFormat: ChronicleFormat.TRANSCRIPT });

      expect(exp._defaultFormat).toBe(ChronicleFormat.TRANSCRIPT);
    });

    it('should initialize OpenAI client with API key', () => {
      const exp = new NarrativeExporter({ openAIApiKey: 'test-key' });

      expect(exp._aiSummaryEnabled).toBe(true);
      expect(exp._openAIClient).toBeInstanceOf(OpenAIClient);
      expect(exp._openAIClient.apiKey).toBe('test-key');
    });

    it('should accept existing OpenAI client', () => {
      const client = new OpenAIClient('existing-key');
      const exp = new NarrativeExporter({ openAIClient: client });

      expect(exp._aiSummaryEnabled).toBe(true);
      expect(exp._openAIClient).toBe(client);
    });
  });

  describe('configuration methods', () => {
    it('should set campaign name', () => {
      exporter.setCampaignName('New Campaign');

      expect(exporter._campaignName).toBe('New Campaign');
    });

    it('should handle empty campaign name', () => {
      exporter.setCampaignName('');

      expect(exporter._campaignName).toBe('');
    });

    it('should set default style', () => {
      exporter.setDefaultStyle(FormattingStyle.MARKDOWN);

      expect(exporter._defaultStyle).toBe(FormattingStyle.MARKDOWN);
    });

    it('should ignore invalid style', () => {
      const original = exporter._defaultStyle;
      exporter.setDefaultStyle('invalid-style');

      expect(exporter._defaultStyle).toBe(original);
    });

    it('should set default format', () => {
      exporter.setDefaultFormat(ChronicleFormat.SUMMARY);

      expect(exporter._defaultFormat).toBe(ChronicleFormat.SUMMARY);
    });

    it('should ignore invalid format', () => {
      const original = exporter._defaultFormat;
      exporter.setDefaultFormat('invalid-format');

      expect(exporter._defaultFormat).toBe(original);
    });

    it('should get current config', () => {
      exporter.setCampaignName('Test Campaign');
      exporter.setDefaultStyle(FormattingStyle.MINIMAL);
      exporter.setDefaultFormat(ChronicleFormat.TRANSCRIPT);

      const config = exporter.getConfig();

      expect(config).toEqual({
        campaignName: 'Test Campaign',
        defaultStyle: FormattingStyle.MINIMAL,
        defaultFormat: ChronicleFormat.TRANSCRIPT
      });
    });
  });

  describe('OpenAI client configuration', () => {
    it('should check if AI summary is enabled', () => {
      const exp1 = new NarrativeExporter();
      expect(exp1.isAISummaryEnabled()).toBe(false);

      const exp2 = new NarrativeExporter({ openAIApiKey: 'test-key' });
      expect(exp2.isAISummaryEnabled()).toBe(true);
    });

    it('should set OpenAI client from API key', () => {
      exporter.setOpenAIClient('new-api-key');

      expect(exporter.isAISummaryEnabled()).toBe(true);
      expect(exporter._openAIClient).toBeInstanceOf(OpenAIClient);
    });

    it('should set OpenAI client from instance', () => {
      const client = new OpenAIClient('test-key');
      exporter.setOpenAIClient(client);

      expect(exporter.isAISummaryEnabled()).toBe(true);
      expect(exporter._openAIClient).toBe(client);
    });

    it('should disable AI summary with null', () => {
      exporter.setOpenAIClient('test-key');
      expect(exporter.isAISummaryEnabled()).toBe(true);

      exporter.setOpenAIClient(null);
      expect(exporter.isAISummaryEnabled()).toBe(false);
    });
  });

  // ============================================================================
  // formatChronicle Tests
  // ============================================================================

  describe('formatChronicle', () => {
    it('should throw error if sessionData is missing', () => {
      expect(() => exporter.formatChronicle(null)).toThrow('Session data is required');
    });

    it('should format chronicle with default settings', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Session 1 - The Beginning');
      expect(result.type).toBe('Session Chronicle');
      expect(result.date).toBe('2024-01-15');
      expect(result.is_private).toBe(false);
      expect(result.entry).toContain('Summary');
      expect(result.entry).toContain('Full Transcript');
      expect(result.meta).toEqual({
        segmentCount: 4,
        entityCount: 3,
        momentCount: 1,
        format: ChronicleFormat.FULL,
        style: FormattingStyle.RICH,
        generatedAt: expect.any(String)
      });
    });

    it('should use custom title', () => {
      const sessionData = createMockSessionData({ title: 'Custom Session' });
      const result = exporter.formatChronicle(sessionData);

      expect(result.name).toBe('Custom Session');
    });

    it('should default to Untitled Session if no title', () => {
      const sessionData = createMockSessionData({ title: undefined });
      const result = exporter.formatChronicle(sessionData);

      expect(result.name).toBe('Untitled Session');
    });

    it('should respect is_private option', () => {
      const sessionData = createMockSessionData({ is_private: true });
      const result = exporter.formatChronicle(sessionData);

      expect(result.is_private).toBe(true);
    });

    it('should format as TRANSCRIPT only', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        format: ChronicleFormat.TRANSCRIPT
      });

      expect(result.entry).not.toContain('Summary');
      expect(result.entry).toContain('GM:');
      expect(result.entry).toContain('Player1:');
      expect(result.meta.format).toBe(ChronicleFormat.TRANSCRIPT);
    });

    it('should format as SUMMARY only', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        format: ChronicleFormat.SUMMARY
      });

      expect(result.entry).toContain('Summary');
      expect(result.entry).not.toContain('Full Transcript');
      expect(result.meta.format).toBe(ChronicleFormat.SUMMARY);
    });

    it('should format as NARRATIVE', () => {
      const sessionData = createMockSessionData({
        narrative: 'The brave heroes ventured forth...'
      });
      const result = exporter.formatChronicle(sessionData, {
        format: ChronicleFormat.NARRATIVE
      });

      expect(result.entry).toContain('Session Narrative');
      expect(result.entry).toContain('The brave heroes ventured forth...');
      expect(result.meta.format).toBe(ChronicleFormat.NARRATIVE);
    });

    it('should format with MINIMAL style', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MINIMAL
      });

      expect(result.entry).not.toContain('Key Moments');
      expect(result.entry).not.toContain('Entities Mentioned');
      expect(result.meta.style).toBe(FormattingStyle.MINIMAL);
    });

    it('should format with RICH style', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.RICH
      });

      expect(result.entry).toContain('Key Moments');
      expect(result.entry).toContain('Entities Mentioned');
      expect(result.entry).toContain('Chronicle generated by VoxChronicle');
      expect(result.meta.style).toBe(FormattingStyle.RICH);
    });

    it('should format with MARKDOWN style', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MARKDOWN
      });

      expect(result.entry).toContain('## Summary');
      expect(result.entry).toContain('**GM:**');
      expect(result.entry).toContain('---');
      expect(result.meta.style).toBe(FormattingStyle.MARKDOWN);
    });

    it('should include campaign name in RICH style', () => {
      exporter.setCampaignName('Epic Campaign');
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.RICH
      });

      expect(result.entry).toContain('Epic Campaign');
    });

    it('should include campaign name in MARKDOWN style', () => {
      exporter.setCampaignName('Epic Campaign');
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MARKDOWN
      });

      expect(result.entry).toContain('*Epic Campaign*');
    });

    it('should exclude entities when includeEntities is false', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        includeEntities: false
      });

      expect(result.entry).not.toContain('Entities Mentioned');
      expect(result.entry).not.toContain('Grognard');
    });

    it('should exclude moments when includeMoments is false', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        includeMoments: false
      });

      expect(result.entry).not.toContain('Key Moments');
      expect(result.entry).not.toContain('First encounter');
    });

    it('should include timestamps when requested', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        format: ChronicleFormat.TRANSCRIPT,
        includeTimestamps: true
      });

      expect(result.entry).toContain('[0:00]');
      expect(result.entry).toContain('[0:03]');
    });

    it('should handle missing segments gracefully', () => {
      const sessionData = createMockSessionData({ segments: [] });
      const result = exporter.formatChronicle(sessionData);

      expect(result).toBeDefined();
      expect(result.meta.segmentCount).toBe(0);
    });

    it('should handle missing entities gracefully', () => {
      const sessionData = createMockSessionData({ entities: null });
      const result = exporter.formatChronicle(sessionData);

      expect(result).toBeDefined();
      expect(result.meta.entityCount).toBe(0);
    });

    it('should handle missing moments gracefully', () => {
      const sessionData = createMockSessionData({ moments: [] });
      const result = exporter.formatChronicle(sessionData);

      expect(result).toBeDefined();
      expect(result.meta.momentCount).toBe(0);
    });

    it('should format Date objects correctly', () => {
      const sessionData = createMockSessionData({
        date: new Date('2024-03-15T10:30:00Z')
      });
      const result = exporter.formatChronicle(sessionData);

      expect(result.date).toBe('2024-03-15');
    });

    it('should handle ISO date strings correctly', () => {
      const sessionData = createMockSessionData({
        date: '2024-03-15T10:30:00Z'
      });
      const result = exporter.formatChronicle(sessionData);

      expect(result.date).toBe('2024-03-15');
    });

    it('should return null for invalid dates', () => {
      const sessionData = createMockSessionData({ date: null });
      const result = exporter.formatChronicle(sessionData);

      expect(result.date).toBeNull();
    });
  });

  // ============================================================================
  // generateSummary Tests
  // ============================================================================

  describe('generateSummary', () => {
    it('should generate summary from segments', () => {
      const segments = createMockSegments();
      const summary = exporter.generateSummary(segments);

      expect(summary).toBeDefined();
      expect(summary).toContain('participants');
      expect(summary).toContain('GM');
      expect(summary).toContain('Player1');
    });

    it('should handle empty segments', () => {
      const summary = exporter.generateSummary([]);

      expect(summary).toBe('No transcript segments available.');
    });

    it('should handle null segments', () => {
      const summary = exporter.generateSummary(null);

      expect(summary).toBe('No transcript segments available.');
    });

    it('should include duration if timestamps available', () => {
      const segments = [
        { speaker: 'GM', text: 'Start', start: 0, end: 5 },
        { speaker: 'Player', text: 'Middle', start: 5, end: 300 },
        { speaker: 'GM', text: 'End', start: 300, end: 600 }
      ];
      const summary = exporter.generateSummary(segments);

      expect(summary).toContain('minutes');
    });

    it('should count words correctly', () => {
      const segments = [
        { speaker: 'GM', text: 'One two three four five', start: 0, end: 5 },
        { speaker: 'Player', text: 'Six seven eight', start: 5, end: 10 }
      ];
      const summary = exporter.generateSummary(segments);

      expect(summary).toContain('8 words');
    });

    it('should respect maxLength option', () => {
      const segments = createMockSegments();
      const summary = exporter.generateSummary(segments, { maxLength: 50 });

      expect(summary.length).toBeLessThanOrEqual(50);
      expect(summary).toMatch(/\.\.\.$/);
    });

    it('should exclude speakers when includeSpeakers is false', () => {
      const segments = createMockSegments();
      const summary = exporter.generateSummary(segments, { includeSpeakers: false });

      expect(summary).not.toContain('participants');
      expect(summary).not.toContain('GM');
    });

    it('should extract highlights with action words', () => {
      const segments = [
        { speaker: 'GM', text: 'The dragon attacks the party!', start: 0, end: 5 },
        { speaker: 'Player', text: 'I cast a spell to defend.', start: 5, end: 10 },
        { speaker: 'GM', text: 'You discover hidden treasure!', start: 10, end: 15 }
      ];
      const summary = exporter.generateSummary(segments, { highlightCount: 3 });

      expect(summary).toContain('Key moments included');
      expect(summary).toContain('dragon attacks');
      expect(summary).toContain('cast a spell');
      expect(summary).toContain('discover hidden treasure');
    });

    it('should limit highlights to highlightCount', () => {
      const segments = [
        { speaker: 'GM', text: 'First attack occurs.', start: 0, end: 5 },
        { speaker: 'GM', text: 'Second fight begins.', start: 5, end: 10 },
        { speaker: 'GM', text: 'Third battle rages.', start: 10, end: 15 }
      ];
      const summary = exporter.generateSummary(segments, { highlightCount: 2 });

      const highlights = summary.match(/•/g);
      expect(highlights).toBeDefined();
      expect(highlights.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // generateAISummary Tests
  // ============================================================================

  describe('generateAISummary', () => {
    beforeEach(() => {
      exporter.setOpenAIClient('test-api-key');
    });

    it('should throw error if AI is not enabled', async () => {
      const exp = new NarrativeExporter();
      const segments = createMockSegments();

      await expect(exp.generateAISummary(segments)).rejects.toThrow(
        'AI summary generation requires OpenAI integration'
      );
    });

    it('should handle empty segments', async () => {
      const result = await exporter.generateAISummary([]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty segments');
      expect(result.summary).toContain('No transcript segments available');
    });

    it('should generate AI summary successfully', async () => {
      const aiSummary = 'The brave heroes embarked on their quest...';
      mockPost.mockResolvedValueOnce(createMockAIResponse(aiSummary));

      const segments = createMockSegments();
      const result = await exporter.generateAISummary(segments);

      expect(result.success).toBe(true);
      expect(result.summary).toBe(aiSummary);
      expect(result.model).toBe('gpt-4o');
      expect(result.style).toBe('narrative');
      expect(result.segmentCount).toBe(4);
      expect(result.generatedAt).toBeDefined();

      expect(mockPost).toHaveBeenCalledWith('/chat/completions', {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: expect.stringContaining('expert chronicler') },
          { role: 'user', content: expect.stringContaining('GM: Welcome to the adventure!') }
        ],
        temperature: 0.7,
        max_tokens: expect.any(Number)
      });
    });

    it('should support different summary styles', async () => {
      mockPost.mockResolvedValueOnce(createMockAIResponse('Bullet summary'));

      const segments = createMockSegments();
      await exporter.generateAISummary(segments, { style: 'bullet' });

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('bullet-point summary');
    });

    it('should use formal style', async () => {
      mockPost.mockResolvedValueOnce(createMockAIResponse('Formal summary'));

      const segments = createMockSegments();
      await exporter.generateAISummary(segments, { style: 'formal' });

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('formal chronicle style');
    });

    it('should include campaign context in prompt', async () => {
      exporter.setCampaignName('Dragon Quest');
      mockPost.mockResolvedValueOnce(createMockAIResponse('Summary'));

      const segments = createMockSegments();
      await exporter.generateAISummary(segments, { campaignContext: 'Ancient ruins' });

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('Campaign context: Ancient ruins');
    });

    it('should use instance campaign name if no context provided', async () => {
      exporter.setCampaignName('Epic Quest');
      mockPost.mockResolvedValueOnce(createMockAIResponse('Summary'));

      const segments = createMockSegments();
      await exporter.generateAISummary(segments);

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('Campaign context: Epic Quest');
    });

    it('should include entity information in prompt', async () => {
      mockPost.mockResolvedValueOnce(createMockAIResponse('Summary'));

      const segments = createMockSegments();
      const entities = {
        characters: [{ name: 'Aragorn' }, { name: 'Gandalf' }],
        locations: [{ name: 'Rivendell' }]
      };
      await exporter.generateAISummary(segments, { entities });

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('Characters: Aragorn, Gandalf');
      expect(call[1].messages[0].content).toContain('Locations: Rivendell');
    });

    it('should respect maxLength option', async () => {
      mockPost.mockResolvedValueOnce(createMockAIResponse('Summary'));

      const segments = createMockSegments();
      await exporter.generateAISummary(segments, { maxLength: 500 });

      const call = mockPost.mock.calls[0];
      expect(call[1].messages[0].content).toContain('under 500 characters');
      expect(call[1].max_tokens).toBe(Math.ceil(500 / 3)); // 167
    });

    it('should fall back to basic summary on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('API Error'));

      const segments = createMockSegments();
      const result = await exporter.generateAISummary(segments);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
      expect(result.fallback).toBe(true);
      expect(result.summary).toContain('participants');
    });

    it('should trim AI response', async () => {
      mockPost.mockResolvedValueOnce(createMockAIResponse('  Summary with whitespace  \n'));

      const segments = createMockSegments();
      const result = await exporter.generateAISummary(segments);

      expect(result.summary).toBe('Summary with whitespace');
    });
  });

  // ============================================================================
  // formatTranscript Tests
  // ============================================================================

  describe('formatTranscript', () => {
    it('should format transcript segments', () => {
      const segments = createMockSegments();
      const transcript = exporter.formatTranscript(segments);

      expect(transcript).toContain('**GM:** Welcome to the adventure!');
      expect(transcript).toContain('**Player1:** I look around the tavern.');
    });

    it('should return empty string for empty segments', () => {
      const transcript = exporter.formatTranscript([]);

      expect(transcript).toBe('');
    });

    it('should return empty string for null segments', () => {
      const transcript = exporter.formatTranscript(null);

      expect(transcript).toBe('');
    });

    it('should include timestamps when requested', () => {
      const segments = [
        { speaker: 'GM', text: 'Hello', start: 0, end: 2 },
        { speaker: 'Player', text: 'Hi', start: 2, end: 4 }
      ];
      const transcript = exporter.formatTranscript(segments, { includeTimestamps: true });

      expect(transcript).toContain('[0:00]');
      expect(transcript).toContain('[0:02]');
    });

    it('should group consecutive segments by speaker', () => {
      const segments = [
        { speaker: 'GM', text: 'First part.', start: 0, end: 2 },
        { speaker: 'GM', text: 'Second part.', start: 2, end: 4 },
        { speaker: 'Player', text: 'Response.', start: 4, end: 6 }
      ];
      const transcript = exporter.formatTranscript(segments);

      expect(transcript).toContain('**GM:** First part. Second part.');
      expect(transcript).toContain('**Player:** Response.');
    });

    it('should not group when groupBySpeaker is false', () => {
      const segments = [
        { speaker: 'GM', text: 'First part.', start: 0, end: 2 },
        { speaker: 'GM', text: 'Second part.', start: 2, end: 4 }
      ];
      const transcript = exporter.formatTranscript(segments, { groupBySpeaker: false });

      const gmEntries = transcript.match(/\*\*GM:\*\*/g);
      expect(gmEntries).toHaveLength(2);
    });

    it('should handle segments with unknown speaker', () => {
      const segments = [{ text: 'No speaker', start: 0, end: 2 }];
      const transcript = exporter.formatTranscript(segments);

      expect(transcript).toContain('**Unknown:**');
    });

    it('should trim segment text', () => {
      const segments = [{ speaker: 'GM', text: '  Text with spaces  ', start: 0, end: 2 }];
      const transcript = exporter.formatTranscript(segments);

      expect(transcript).toContain('**GM:** Text with spaces');
      expect(transcript).not.toContain('  Text with spaces  ');
    });
  });

  // ============================================================================
  // export and exportBatch Tests
  // ============================================================================

  describe('export', () => {
    it('should export session as Kanka journal data', () => {
      const sessionData = createMockSessionData();
      const result = exporter.export(sessionData);

      expect(result).toEqual({
        name: 'Session 1 - The Beginning',
        entry: expect.any(String),
        type: 'Session Chronicle',
        date: '2024-01-15',
        is_private: false
      });
    });

    it('should include optional Kanka fields', () => {
      const sessionData = createMockSessionData();
      const result = exporter.export(sessionData, {
        location_id: 123,
        character_id: 456,
        journal_id: 789,
        tags: [1, 2, 3]
      });

      expect(result.location_id).toBe(123);
      expect(result.character_id).toBe(456);
      expect(result.journal_id).toBe(789);
      expect(result.tags).toEqual([1, 2, 3]);
    });

    it('should respect formatting options', () => {
      const sessionData = createMockSessionData();
      const result = exporter.export(sessionData, {
        format: ChronicleFormat.TRANSCRIPT,
        style: FormattingStyle.MINIMAL
      });

      expect(result.entry).not.toContain('Summary');
    });
  });

  describe('exportBatch', () => {
    it('should export multiple sessions', () => {
      const sessions = [
        createMockSessionData({ title: 'Session 1' }),
        createMockSessionData({ title: 'Session 2' }),
        createMockSessionData({ title: 'Session 3' })
      ];

      const results = exporter.exportBatch(sessions);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Session 1');
      expect(results[1].name).toBe('Session 2');
      expect(results[2].name).toBe('Session 3');
    });

    it('should return empty array for null sessions', () => {
      const results = exporter.exportBatch(null);

      expect(results).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      const results = exporter.exportBatch('not-an-array');

      expect(results).toEqual([]);
    });

    it('should skip failed exports', () => {
      const sessions = [
        createMockSessionData({ title: 'Valid Session' }),
        null, // This will cause an error
        createMockSessionData({ title: 'Another Valid Session' })
      ];

      const results = exporter.exportBatch(sessions);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Valid Session');
      expect(results[1].name).toBe('Another Valid Session');
    });

    it('should apply options to all sessions', () => {
      const sessions = [
        createMockSessionData({ title: 'Session 1' }),
        createMockSessionData({ title: 'Session 2' })
      ];

      const results = exporter.exportBatch(sessions, {
        format: ChronicleFormat.SUMMARY,
        location_id: 999
      });

      expect(results[0].location_id).toBe(999);
      expect(results[1].location_id).toBe(999);
    });
  });

  // ============================================================================
  // HTML Formatting Tests
  // ============================================================================

  describe('HTML formatting', () => {
    it('should escape HTML in entities', () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [{ name: '<script>alert("xss")</script>', isNPC: true }]
        }
      });

      const result = exporter.formatChronicle(sessionData);

      expect(result.entry).not.toContain('<script>');
      expect(result.entry).toContain('&lt;script&gt;');
    });

    it('should format entities with descriptions', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.RICH
      });

      expect(result.entry).toContain('<h3>Characters</h3>');
      expect(result.entry).toContain('Grognard');
      expect(result.entry).toContain('A brave warrior');
      expect(result.entry).toContain('<h3>Locations</h3>');
      expect(result.entry).toContain('The Rusty Dragon');
      expect(result.entry).toContain('<h3>Items</h3>');
      expect(result.entry).toContain('Magic Sword');
    });

    it('should format salient moments', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.RICH
      });

      expect(result.entry).toContain('<h2>Key Moments</h2>');
      expect(result.entry).toContain('First encounter');
      expect(result.entry).toContain('The party meets the mysterious figure');
    });

    it('should format transcript with HTML classes', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        format: ChronicleFormat.TRANSCRIPT,
        style: FormattingStyle.RICH
      });

      expect(result.entry).toContain('<div class="transcript">');
      expect(result.entry).toContain('<p class="dialogue">');
      expect(result.entry).toContain('<strong class="speaker">');
      expect(result.entry).toContain('<span class="text">');
    });
  });

  // ============================================================================
  // Markdown Formatting Tests
  // ============================================================================

  describe('Markdown formatting', () => {
    it('should format entities as markdown lists', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MARKDOWN
      });

      expect(result.entry).toContain('### Characters');
      expect(result.entry).toContain('- **Grognard** (NPC)');
      expect(result.entry).toContain('### Locations');
      expect(result.entry).toContain('- **The Rusty Dragon** (Tavern)');
      expect(result.entry).toContain('### Items');
      expect(result.entry).toContain('- **Magic Sword** (Weapon)');
    });

    it('should format moments as markdown', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MARKDOWN
      });

      expect(result.entry).toContain('## Key Moments');
      expect(result.entry).toContain('- **First encounter**');
      expect(result.entry).toContain('*"The party meets the mysterious figure"*');
    });

    it('should use markdown headers', () => {
      const sessionData = createMockSessionData();
      const result = exporter.formatChronicle(sessionData, {
        style: FormattingStyle.MARKDOWN
      });

      expect(result.entry).toContain('## Summary');
      expect(result.entry).toContain('## Full Transcript');
    });
  });

  // ============================================================================
  // Helper Method Tests (Indirect)
  // ============================================================================

  describe('timestamp formatting', () => {
    it('should format timestamps under 1 hour', () => {
      const segments = [{ speaker: 'GM', text: 'Test', start: 125, end: 130 }];
      const transcript = exporter.formatTranscript(segments, { includeTimestamps: true });

      expect(transcript).toContain('[2:05]');
    });

    it('should format timestamps over 1 hour', () => {
      const segments = [{ speaker: 'GM', text: 'Test', start: 3725, end: 3730 }];
      const transcript = exporter.formatTranscript(segments, { includeTimestamps: true });

      expect(transcript).toContain('[1:02:05]');
    });
  });

  describe('speaker grouping', () => {
    it('should merge consecutive segments from same speaker', () => {
      const segments = [
        { speaker: 'GM', text: 'Part one.', start: 0, end: 2 },
        { speaker: 'GM', text: 'Part two.', start: 2, end: 4 },
        { speaker: 'GM', text: 'Part three.', start: 4, end: 6 }
      ];
      const transcript = exporter.formatTranscript(segments);

      expect(transcript).toContain('Part one. Part two. Part three.');
      const gmCount = (transcript.match(/\*\*GM:\*\*/g) || []).length;
      expect(gmCount).toBe(1);
    });

    it('should preserve speaker changes', () => {
      const segments = [
        { speaker: 'GM', text: 'GM speaks.', start: 0, end: 2 },
        { speaker: 'Player', text: 'Player responds.', start: 2, end: 4 },
        { speaker: 'GM', text: 'GM continues.', start: 4, end: 6 }
      ];
      const transcript = exporter.formatTranscript(segments);

      const gmCount = (transcript.match(/\*\*GM:\*\*/g) || []).length;
      const playerCount = (transcript.match(/\*\*Player:\*\*/g) || []).length;
      expect(gmCount).toBe(2);
      expect(playerCount).toBe(1);
    });
  });

  describe('entity counting', () => {
    it('should count all entity types', () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [{ name: 'C1' }, { name: 'C2' }],
          locations: [{ name: 'L1' }],
          items: [{ name: 'I1' }, { name: 'I2' }, { name: 'I3' }]
        }
      });

      const result = exporter.formatChronicle(sessionData);

      expect(result.meta.entityCount).toBe(6);
    });

    it('should handle missing entity categories', () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [{ name: 'C1' }]
          // locations and items missing
        }
      });

      const result = exporter.formatChronicle(sessionData);

      expect(result.meta.entityCount).toBe(1);
    });
  });
});
