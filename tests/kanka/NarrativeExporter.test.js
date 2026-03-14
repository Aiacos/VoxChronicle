/**
 * Tests for NarrativeExporter - Format Transcripts as Kanka Journal Entries
 *
 * Covers: exports, constructor, configuration (setCampaignName, setDefaultStyle,
 * setDefaultFormat, getConfig), formatChronicle (all formats and styles),
 * generateSummary, generateAISummary, isAISummaryEnabled, setOpenAIClient,
 * export, exportBatch, formatTranscript, _groupBySpeaker, _analyzeSpeakers,
 * _extractHighlights, _formatDate, _countEntities, _formatEntitiesHTML,
 * _formatEntitiesMarkdown, _formatAsHTML, _formatAsMarkdown,
 * _buildTranscriptText, _buildAISummaryPrompt, error handling, edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  NarrativeExporter,
  ChronicleFormat,
  FormattingStyle
} from '../../scripts/kanka/NarrativeExporter.mjs';

// ── Hoisted mock variables ─────────────────────────────────────────────
const mockOpenAIClient = vi.hoisted(() => ({
  post: vi.fn()
}));

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/ai/OpenAIClient.mjs', () => ({
  OpenAIClient: vi.fn(() => mockOpenAIClient)
}));

vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  })
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    formatDuration: vi.fn((seconds) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    })
  }
}));

// ── Helpers ────────────────────────────────────────────────────────────

function makeSegments(count = 3) {
  const speakers = ['DM', 'Player1', 'Player2'];
  return Array.from({ length: count }, (_, i) => ({
    speaker: speakers[i % speakers.length],
    text: `Segment ${i + 1} text content`,
    start: i * 10,
    end: (i + 1) * 10
  }));
}

function makeSessionData(overrides = {}) {
  return {
    title: 'Session 1 - The Beginning',
    date: '2024-01-15',
    segments: makeSegments(),
    entities: {
      characters: [{ name: 'Elara', isNPC: true, description: 'A wizard' }],
      locations: [{ name: 'Tavern', type: 'Tavern', description: 'A cozy tavern' }],
      items: [{ name: 'Sword of Flame', type: 'Weapon', description: 'A magic sword' }]
    },
    moments: [
      { title: 'Dragon appears', context: 'A massive dragon swoops in' },
      { title: 'Party retreats', context: 'They flee to safety' }
    ],
    summary: 'The party met and fought a dragon.',
    ...overrides
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('NarrativeExporter', () => {
  let exporter;

  beforeEach(() => {
    mockOpenAIClient.post.mockReset();
    exporter = new NarrativeExporter();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Exports
  // ════════════════════════════════════════════════════════════════════════

  describe('exports', () => {
    it('should export NarrativeExporter class', () => {
      expect(NarrativeExporter).toBeDefined();
      expect(typeof NarrativeExporter).toBe('function');
    });

    it('should export ChronicleFormat enum', () => {
      expect(ChronicleFormat).toBeDefined();
      expect(ChronicleFormat.TRANSCRIPT).toBe('transcript');
      expect(ChronicleFormat.NARRATIVE).toBe('narrative');
      expect(ChronicleFormat.SUMMARY).toBe('summary');
      expect(ChronicleFormat.FULL).toBe('full');
    });

    it('should export FormattingStyle enum', () => {
      expect(FormattingStyle).toBeDefined();
      expect(FormattingStyle.MINIMAL).toBe('minimal');
      expect(FormattingStyle.RICH).toBe('rich');
      expect(FormattingStyle.MARKDOWN).toBe('markdown');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Constructor
  // ════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const exp = new NarrativeExporter();
      expect(exp._campaignName).toBe('');
      expect(exp._defaultStyle).toBe('rich');
      expect(exp._defaultFormat).toBe('full');
      expect(exp._aiSummaryEnabled).toBe(false);
      expect(exp._openAIClient).toBeNull();
    });

    it('should accept campaign name option', () => {
      const exp = new NarrativeExporter({ campaignName: 'My Campaign' });
      expect(exp._campaignName).toBe('My Campaign');
    });

    it('should accept default style option', () => {
      const exp = new NarrativeExporter({ defaultStyle: 'minimal' });
      expect(exp._defaultStyle).toBe('minimal');
    });

    it('should accept default format option', () => {
      const exp = new NarrativeExporter({ defaultFormat: 'transcript' });
      expect(exp._defaultFormat).toBe('transcript');
    });

    it('should enable AI summary with openAIClient', () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });
      expect(exp._aiSummaryEnabled).toBe(true);
      expect(exp._openAIClient).toBe(mockOpenAIClient);
    });

    it('should enable AI summary with openAIApiKey', () => {
      const exp = new NarrativeExporter({ openAIApiKey: 'sk-test-key' });
      expect(exp._aiSummaryEnabled).toBe(true);
      expect(exp._openAIClient).toBeDefined();
    });

    it('should prefer openAIClient over openAIApiKey', () => {
      const exp = new NarrativeExporter({
        openAIClient: mockOpenAIClient,
        openAIApiKey: 'sk-test-key'
      });
      expect(exp._openAIClient).toBe(mockOpenAIClient);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Configuration Methods
  // ════════════════════════════════════════════════════════════════════════

  describe('setCampaignName()', () => {
    it('should set campaign name', () => {
      exporter.setCampaignName('New Campaign');
      expect(exporter._campaignName).toBe('New Campaign');
    });

    it('should handle null by setting empty string', () => {
      exporter.setCampaignName(null);
      expect(exporter._campaignName).toBe('');
    });

    it('should handle undefined by setting empty string', () => {
      exporter.setCampaignName(undefined);
      expect(exporter._campaignName).toBe('');
    });
  });

  describe('setDefaultStyle()', () => {
    it('should set valid style', () => {
      exporter.setDefaultStyle('minimal');
      expect(exporter._defaultStyle).toBe('minimal');
    });

    it('should set markdown style', () => {
      exporter.setDefaultStyle('markdown');
      expect(exporter._defaultStyle).toBe('markdown');
    });

    it('should ignore invalid style', () => {
      exporter.setDefaultStyle('invalid');
      expect(exporter._defaultStyle).toBe('rich');
    });
  });

  describe('setDefaultFormat()', () => {
    it('should set valid format', () => {
      exporter.setDefaultFormat('transcript');
      expect(exporter._defaultFormat).toBe('transcript');
    });

    it('should set narrative format', () => {
      exporter.setDefaultFormat('narrative');
      expect(exporter._defaultFormat).toBe('narrative');
    });

    it('should ignore invalid format', () => {
      exporter.setDefaultFormat('invalid');
      expect(exporter._defaultFormat).toBe('full');
    });
  });

  describe('getConfig()', () => {
    it('should return current configuration', () => {
      exporter.setCampaignName('Test');
      exporter.setDefaultStyle('minimal');
      exporter.setDefaultFormat('summary');

      const config = exporter.getConfig();
      expect(config).toEqual({
        campaignName: 'Test',
        defaultStyle: 'minimal',
        defaultFormat: 'summary'
      });
    });

    it('should return default configuration for new instance', () => {
      const config = exporter.getConfig();
      expect(config).toEqual({
        campaignName: '',
        defaultStyle: 'rich',
        defaultFormat: 'full'
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // isAISummaryEnabled / setOpenAIClient
  // ════════════════════════════════════════════════════════════════════════

  describe('isAISummaryEnabled()', () => {
    it('should return false by default', () => {
      expect(exporter.isAISummaryEnabled()).toBe(false);
    });

    it('should return true when client is set', () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });
      expect(exp.isAISummaryEnabled()).toBe(true);
    });
  });

  describe('setOpenAIClient()', () => {
    it('should enable AI summary with API key string', () => {
      exporter.setOpenAIClient('sk-test-key');
      expect(exporter._aiSummaryEnabled).toBe(true);
      expect(exporter._openAIClient).toBeDefined();
    });

    it('should disable AI summary with non-string/non-client value', () => {
      exporter.setOpenAIClient(12345);
      expect(exporter._aiSummaryEnabled).toBe(false);
      expect(exporter._openAIClient).toBeNull();
    });

    it('should disable AI summary with null', () => {
      exporter.setOpenAIClient(null);
      expect(exporter._aiSummaryEnabled).toBe(false);
      expect(exporter._openAIClient).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatDate
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatDate()', () => {
    it('should return null for null/undefined/empty date', () => {
      expect(exporter._formatDate(null)).toBeNull();
      expect(exporter._formatDate(undefined)).toBeNull();
      expect(exporter._formatDate('')).toBeNull();
    });

    it('should format Date object to YYYY-MM-DD', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      const result = exporter._formatDate(date);
      expect(result).toBe('2024-06-15');
    });

    it('should handle YYYY-MM-DD string', () => {
      expect(exporter._formatDate('2024-01-15')).toBe('2024-01-15');
    });

    it('should strip time from ISO string', () => {
      expect(exporter._formatDate('2024-01-15T10:30:00Z')).toBe('2024-01-15');
    });

    it('should return null for invalid date format', () => {
      expect(exporter._formatDate('January 15, 2024')).toBeNull();
    });

    it('should return null for random string', () => {
      expect(exporter._formatDate('not-a-date')).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _countEntities
  // ════════════════════════════════════════════════════════════════════════

  describe('_countEntities()', () => {
    it('should return 0 for null entities', () => {
      expect(exporter._countEntities(null)).toBe(0);
    });

    it('should return 0 for undefined entities', () => {
      expect(exporter._countEntities(undefined)).toBe(0);
    });

    it('should return 0 for empty entities', () => {
      expect(exporter._countEntities({})).toBe(0);
    });

    it('should count all entity types', () => {
      const entities = {
        characters: [{ name: 'A' }, { name: 'B' }],
        locations: [{ name: 'C' }],
        items: [{ name: 'D' }, { name: 'E' }, { name: 'F' }]
      };
      expect(exporter._countEntities(entities)).toBe(6);
    });

    it('should handle missing entity arrays', () => {
      const entities = { characters: [{ name: 'A' }] };
      expect(exporter._countEntities(entities)).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _groupBySpeaker
  // ════════════════════════════════════════════════════════════════════════

  describe('_groupBySpeaker()', () => {
    it('should return empty array for null segments', () => {
      expect(exporter._groupBySpeaker(null)).toEqual([]);
    });

    it('should return empty array for empty segments', () => {
      expect(exporter._groupBySpeaker([])).toEqual([]);
    });

    it('should merge consecutive segments from same speaker', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello', start: 0, end: 5 },
        { speaker: 'DM', text: 'everyone', start: 5, end: 10 },
        { speaker: 'Player1', text: 'Hi!', start: 10, end: 15 }
      ];

      const result = exporter._groupBySpeaker(segments);
      expect(result).toHaveLength(2);
      expect(result[0].speaker).toBe('DM');
      expect(result[0].text).toBe('Hello everyone');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(10);
      expect(result[1].speaker).toBe('Player1');
    });

    it('should not merge segments from different speakers', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello', start: 0, end: 5 },
        { speaker: 'Player1', text: 'Hi', start: 5, end: 10 },
        { speaker: 'DM', text: 'Welcome', start: 10, end: 15 }
      ];

      const result = exporter._groupBySpeaker(segments);
      expect(result).toHaveLength(3);
    });

    it('should handle single segment', () => {
      const segments = [{ speaker: 'DM', text: 'Hello', start: 0, end: 5 }];
      const result = exporter._groupBySpeaker(segments);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello');
    });

    it('should handle segments with empty text', () => {
      const segments = [
        { speaker: 'DM', text: '', start: 0, end: 5 },
        { speaker: 'DM', text: 'Hello', start: 5, end: 10 }
      ];

      const result = exporter._groupBySpeaker(segments);
      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('Hello');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _analyzeSpeakers
  // ════════════════════════════════════════════════════════════════════════

  describe('_analyzeSpeakers()', () => {
    it('should return speaker statistics', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello world', start: 0, end: 5 },
        { speaker: 'Player1', text: 'Hi there friend', start: 5, end: 10 },
        { speaker: 'DM', text: 'Welcome', start: 10, end: 15 }
      ];

      const stats = exporter._analyzeSpeakers(segments);
      expect(stats.DM).toBeDefined();
      expect(stats.DM.segmentCount).toBe(2);
      expect(stats.Player1).toBeDefined();
      expect(stats.Player1.segmentCount).toBe(1);
    });

    it('should count words per speaker', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello world', start: 0, end: 5 },
        { speaker: 'DM', text: 'More words here', start: 5, end: 10 }
      ];

      const stats = exporter._analyzeSpeakers(segments);
      expect(stats.DM.wordCount).toBe(5);
    });

    it('should calculate total duration', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello', start: 0, end: 10 },
        { speaker: 'DM', text: 'World', start: 10, end: 25 }
      ];

      const stats = exporter._analyzeSpeakers(segments);
      expect(stats.DM.totalDuration).toBe(25);
    });

    it('should use Unknown for segments without speaker', () => {
      const segments = [{ text: 'No speaker', start: 0, end: 5 }];
      const stats = exporter._analyzeSpeakers(segments);
      expect(stats.Unknown).toBeDefined();
      expect(stats.Unknown.segmentCount).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _extractHighlights
  // ════════════════════════════════════════════════════════════════════════

  describe('_extractHighlights()', () => {
    it('should extract highlights with action words', () => {
      const segments = [
        { text: 'The party found a dragon in the cave' },
        { text: 'They talked about the weather' },
        { text: 'The hero cast a spell to save everyone' }
      ];

      const highlights = exporter._extractHighlights(segments, 5);
      expect(highlights.length).toBeGreaterThan(0);
      expect(highlights.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no action words found', () => {
      const segments = [
        { text: 'They walked down the road' },
        { text: 'It was a nice day' }
      ];

      const highlights = exporter._extractHighlights(segments, 5);
      expect(highlights).toEqual([]);
    });

    it('should truncate long highlight texts', () => {
      const longText = 'The hero discovered ' + 'a'.repeat(200) + ' in the cave';
      const segments = [{ text: longText }];

      const highlights = exporter._extractHighlights(segments, 5);
      if (highlights.length > 0) {
        expect(highlights[0].length).toBeLessThanOrEqual(100);
      }
    });

    it('should respect count limit', () => {
      const segments = Array.from({ length: 20 }, (_, i) => ({
        text: `The hero discovered a dragon number ${i}`
      }));

      const highlights = exporter._extractHighlights(segments, 3);
      expect(highlights.length).toBeLessThanOrEqual(3);
    });

    it('should handle segments with null text', () => {
      const segments = [{ text: null }, { speaker: 'DM' }];
      const highlights = exporter._extractHighlights(segments, 5);
      expect(highlights).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // formatTranscript
  // ════════════════════════════════════════════════════════════════════════

  describe('formatTranscript()', () => {
    it('should return empty string for null segments', () => {
      expect(exporter.formatTranscript(null)).toBe('');
    });

    it('should return empty string for empty segments', () => {
      expect(exporter.formatTranscript([])).toBe('');
    });

    it('should format segments with speaker labels', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello adventurers' },
        { speaker: 'Player1', text: 'Greetings!' }
      ];

      const result = exporter.formatTranscript(segments);
      expect(result).toContain('**DM:**');
      expect(result).toContain('Hello adventurers');
      expect(result).toContain('**Player1:**');
      expect(result).toContain('Greetings!');
    });

    it('should group consecutive same-speaker segments by default', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello' },
        { speaker: 'DM', text: 'world' },
        { speaker: 'Player1', text: 'Hi' }
      ];

      const result = exporter.formatTranscript(segments);
      // Should be 2 entries (DM combined, Player1)
      const speakerLabels = result.match(/\*\*\w+:\*\*/g);
      expect(speakerLabels).toHaveLength(2);
    });

    it('should not group when groupBySpeaker is false', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello' },
        { speaker: 'DM', text: 'world' }
      ];

      const result = exporter.formatTranscript(segments, { groupBySpeaker: false });
      const speakerLabels = result.match(/\*\*DM:\*\*/g);
      expect(speakerLabels).toHaveLength(2);
    });

    it('should include timestamps when requested', () => {
      const segments = [{ speaker: 'DM', text: 'Hello', start: 65, end: 70 }];

      const result = exporter.formatTranscript(segments, { includeTimestamps: true });
      expect(result).toContain('[1:05]');
    });

    it('should use Unknown for missing speaker', () => {
      const segments = [{ text: 'No speaker here' }];

      const result = exporter.formatTranscript(segments);
      expect(result).toContain('**Unknown:**');
    });

    it('should separate entries with double newlines', () => {
      const segments = [
        { speaker: 'DM', text: 'First' },
        { speaker: 'Player1', text: 'Second' }
      ];

      const result = exporter.formatTranscript(segments);
      expect(result).toContain('\n\n');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // generateSummary
  // ════════════════════════════════════════════════════════════════════════

  describe('generateSummary()', () => {
    it('should return default message for null segments', () => {
      expect(exporter.generateSummary(null)).toBe('No transcript segments available.');
    });

    it('should return default message for empty segments', () => {
      expect(exporter.generateSummary([])).toBe('No transcript segments available.');
    });

    it('should return default message for non-array', () => {
      expect(exporter.generateSummary('not-array')).toBe('No transcript segments available.');
    });

    it('should include speaker count', () => {
      const segments = makeSegments();
      const summary = exporter.generateSummary(segments);
      expect(summary).toContain('participants');
    });

    it('should include speaker names', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello', start: 0, end: 5 },
        { speaker: 'Player1', text: 'Hi', start: 5, end: 10 }
      ];

      const summary = exporter.generateSummary(segments);
      expect(summary).toContain('DM');
      expect(summary).toContain('Player1');
    });

    it('should include duration when timestamps available', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello world', start: 0, end: 60 },
        { speaker: 'Player1', text: 'Hi there', start: 60, end: 300 }
      ];

      const summary = exporter.generateSummary(segments);
      expect(summary).toContain('minutes');
    });

    it('should include word count', () => {
      const segments = makeSegments();
      const summary = exporter.generateSummary(segments);
      expect(summary).toContain('words');
    });

    it('should truncate summary when exceeding maxLength', () => {
      const segments = makeSegments(50);
      const summary = exporter.generateSummary(segments, { maxLength: 100 });
      expect(summary.length).toBeLessThanOrEqual(100);
      expect(summary).toContain('...');
    });

    it('should exclude speakers when includeSpeakers is false', () => {
      const segments = [{ speaker: 'DM', text: 'Hello', start: 0, end: 5 }];
      const summary = exporter.generateSummary(segments, { includeSpeakers: false });
      expect(summary).not.toContain('participants');
    });

    it('should include highlights from action words', () => {
      const segments = [
        { speaker: 'DM', text: 'The dragon attacked the village', start: 0, end: 10 },
        { speaker: 'Player1', text: 'I cast a spell to save them', start: 10, end: 20 }
      ];

      const summary = exporter.generateSummary(segments);
      expect(summary).toContain('Key moments');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // generateAISummary
  // ════════════════════════════════════════════════════════════════════════

  describe('generateAISummary()', () => {
    it('should throw when AI is not enabled', async () => {
      await expect(exporter.generateAISummary(makeSegments())).rejects.toThrow(
        'AI summary generation requires AI integration'
      );
    });

    it('should return error for empty segments', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });
      const result = await exp.generateAISummary([]);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty segments');
    });

    it('should return error for null segments', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });
      const result = await exp.generateAISummary(null);
      expect(result.success).toBe(false);
    });

    it('should call OpenAI API with correct parameters', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'AI generated summary' } }]
      });

      const result = await exp.generateAISummary(makeSegments());
      expect(result.success).toBe(true);
      expect(result.summary).toBe('AI generated summary');
      expect(result.model).toBe('gpt-4o');
      expect(mockOpenAIClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.any(Array),
          temperature: 0.7
        })
      );
    });

    it('should use narrative style by default', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Summary' } }]
      });

      const result = await exp.generateAISummary(makeSegments());
      expect(result.style).toBe('narrative');
    });

    it('should use custom style', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Bullet summary' } }]
      });

      const result = await exp.generateAISummary(makeSegments(), { style: 'bullet' });
      expect(result.style).toBe('bullet');
    });

    it('should fall back to basic summary on API error', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockRejectedValue(new Error('API rate limit'));

      const result = await exp.generateAISummary(makeSegments());
      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit');
      expect(result.fallback).toBe(true);
      expect(result.summary).toBeTruthy();
    });

    it('should include campaign context in prompt', async () => {
      const exp = new NarrativeExporter({
        openAIClient: mockOpenAIClient,
        campaignName: 'Dragon Age'
      });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Summary' } }]
      });

      await exp.generateAISummary(makeSegments(), { campaignContext: 'An epic D&D campaign' });

      const systemMessage = mockOpenAIClient.post.mock.calls[0][1].messages[0].content;
      expect(systemMessage).toContain('An epic D&D campaign');
    });

    it('should include entities in prompt when provided', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Summary' } }]
      });

      await exp.generateAISummary(makeSegments(), {
        entities: {
          characters: [{ name: 'Gandalf' }, { name: 'Frodo' }],
          locations: [{ name: 'Mordor' }]
        }
      });

      const systemMessage = mockOpenAIClient.post.mock.calls[0][1].messages[0].content;
      expect(systemMessage).toContain('Gandalf');
      expect(systemMessage).toContain('Frodo');
      expect(systemMessage).toContain('Mordor');
    });

    it('should handle empty AI response', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({ choices: [] });

      const result = await exp.generateAISummary(makeSegments());
      expect(result.success).toBe(true);
      expect(result.summary).toBe('');
    });

    it('should include generatedAt timestamp', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Summary' } }]
      });

      const result = await exp.generateAISummary(makeSegments());
      expect(result.generatedAt).toBeDefined();
    });

    it('should include segmentCount in result', async () => {
      const exp = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Summary' } }]
      });

      const segs = makeSegments(5);
      const result = await exp.generateAISummary(segs);
      expect(result.segmentCount).toBe(5);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildTranscriptText
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildTranscriptText()', () => {
    it('should format segments with speaker labels', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello' },
        { speaker: 'Player1', text: 'Hi' }
      ];

      const result = exporter._buildTranscriptText(segments);
      expect(result).toContain('DM: Hello');
      expect(result).toContain('Player1: Hi');
    });

    it('should group consecutive same-speaker segments', () => {
      const segments = [
        { speaker: 'DM', text: 'Hello' },
        { speaker: 'DM', text: 'world' }
      ];

      const result = exporter._buildTranscriptText(segments);
      expect(result).toContain('DM: Hello world');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildAISummaryPrompt
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildAISummaryPrompt()', () => {
    it('should include base prompt for chronicler', () => {
      const prompt = exporter._buildAISummaryPrompt('narrative', 1000, '', null);
      expect(prompt).toContain('chronicler');
    });

    it('should include narrative style instructions', () => {
      const prompt = exporter._buildAISummaryPrompt('narrative', 1000, '', null);
      expect(prompt).toContain('narrative prose');
    });

    it('should include bullet style instructions', () => {
      const prompt = exporter._buildAISummaryPrompt('bullet', 1000, '', null);
      expect(prompt).toContain('bullet-point');
    });

    it('should include formal style instructions', () => {
      const prompt = exporter._buildAISummaryPrompt('formal', 1000, '', null);
      expect(prompt).toContain('formal');
    });

    it('should fall back to narrative for unknown style', () => {
      const prompt = exporter._buildAISummaryPrompt('unknown', 1000, '', null);
      expect(prompt).toContain('narrative prose');
    });

    it('should include max length', () => {
      const prompt = exporter._buildAISummaryPrompt('narrative', 500, '', null);
      expect(prompt).toContain('500');
    });

    it('should include campaign context', () => {
      const prompt = exporter._buildAISummaryPrompt('narrative', 1000, 'Dragon Age', null);
      expect(prompt).toContain('Dragon Age');
    });

    it('should include entity information', () => {
      const entities = {
        characters: [{ name: 'Gandalf' }],
        locations: [{ name: 'Mordor' }]
      };
      const prompt = exporter._buildAISummaryPrompt('narrative', 1000, '', entities);
      expect(prompt).toContain('Gandalf');
      expect(prompt).toContain('Mordor');
    });

    it('should omit entity info when no characters or locations', () => {
      const entities = { items: [{ name: 'Sword' }] };
      const prompt = exporter._buildAISummaryPrompt('narrative', 1000, '', entities);
      expect(prompt).not.toContain('Sword');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // formatChronicle
  // ════════════════════════════════════════════════════════════════════════

  describe('formatChronicle()', () => {
    it('should throw for null session data', () => {
      expect(() => exporter.formatChronicle(null)).toThrow('Session data is required');
    });

    it('should return result with name, entry, type, date, meta', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.name).toBe('Session 1 - The Beginning');
      expect(result.entry).toBeTruthy();
      expect(result.type).toBe('Session Chronicle');
      expect(result.date).toBe('2024-01-15');
      expect(result.is_private).toBe(false);
      expect(result.meta).toBeDefined();
    });

    it('should use Untitled Session for missing title', () => {
      const data = makeSessionData({ title: '' });
      const result = exporter.formatChronicle(data);
      expect(result.name).toBe('Untitled Session');
    });

    it('should count segments in meta', () => {
      const data = makeSessionData();
      const result = exporter.formatChronicle(data);
      expect(result.meta.segmentCount).toBe(3);
    });

    it('should count entities in meta', () => {
      const data = makeSessionData();
      const result = exporter.formatChronicle(data);
      expect(result.meta.entityCount).toBe(3);
    });

    it('should count moments in meta', () => {
      const data = makeSessionData();
      const result = exporter.formatChronicle(data);
      expect(result.meta.momentCount).toBe(2);
    });

    it('should include format and style in meta', () => {
      const result = exporter.formatChronicle(makeSessionData(), {
        format: 'summary',
        style: 'minimal'
      });
      expect(result.meta.format).toBe('summary');
      expect(result.meta.style).toBe('minimal');
    });

    it('should use default format and style', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.meta.format).toBe('full');
      expect(result.meta.style).toBe('rich');
    });

    it('should respect is_private from session data', () => {
      const data = makeSessionData({ is_private: true });
      const result = exporter.formatChronicle(data);
      expect(result.is_private).toBe(true);
    });

    it('should include generatedAt in meta', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.meta.generatedAt).toBeDefined();
    });

    // Format-specific tests

    it('should format as HTML with rich style by default', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.entry).toContain('<h2>');
      expect(result.entry).toContain('Summary');
    });

    it('should format as Markdown when style is markdown', () => {
      const result = exporter.formatChronicle(makeSessionData(), { style: 'markdown' });
      expect(result.entry).toContain('## Summary');
    });

    it('should include summary section in full format', () => {
      const result = exporter.formatChronicle(makeSessionData(), { format: 'full' });
      expect(result.entry).toContain('Summary');
    });

    it('should include transcript section in full format', () => {
      const result = exporter.formatChronicle(makeSessionData(), { format: 'full' });
      expect(result.entry).toContain('Full Transcript');
    });

    it('should include transcript only in transcript format', () => {
      const result = exporter.formatChronicle(makeSessionData(), { format: 'transcript' });
      expect(result.entry).toContain('transcript');
    });

    it('should include summary only in summary format', () => {
      const result = exporter.formatChronicle(makeSessionData(), { format: 'summary' });
      expect(result.entry).toContain('Summary');
    });

    it('should include key moments in rich HTML', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.entry).toContain('Key Moments');
      expect(result.entry).toContain('Dragon appears');
    });

    it('should include entities section in rich HTML', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.entry).toContain('Entities Mentioned');
      expect(result.entry).toContain('Elara');
    });

    it('should not include entities when includeEntities is false', () => {
      const result = exporter.formatChronicle(makeSessionData(), { includeEntities: false });
      expect(result.entry).not.toContain('Entities Mentioned');
    });

    it('should not include moments when includeMoments is false', () => {
      const result = exporter.formatChronicle(makeSessionData(), { includeMoments: false });
      expect(result.entry).not.toContain('Key Moments');
    });

    it('should include campaign name header in rich style', () => {
      exporter.setCampaignName('My Campaign');
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.entry).toContain('My Campaign');
    });

    it('should include VoxChronicle footer in rich style', () => {
      const result = exporter.formatChronicle(makeSessionData());
      expect(result.entry).toContain('VoxChronicle');
    });

    it('should handle missing segments', () => {
      const data = makeSessionData({ segments: undefined });
      const result = exporter.formatChronicle(data);
      expect(result.meta.segmentCount).toBe(0);
    });

    it('should handle missing entities', () => {
      const data = makeSessionData({ entities: undefined });
      const result = exporter.formatChronicle(data);
      expect(result.meta.entityCount).toBe(0);
    });

    it('should handle missing moments', () => {
      const data = makeSessionData({ moments: undefined });
      const result = exporter.formatChronicle(data);
      expect(result.meta.momentCount).toBe(0);
    });

    it('should generate basic summary when no summary provided in full format', () => {
      const data = makeSessionData({ summary: undefined });
      const result = exporter.formatChronicle(data, { format: 'full' });
      expect(result.entry).toContain('Summary');
    });

    it('should include narrative section in narrative format', () => {
      const data = makeSessionData({ narrative: 'An epic tale unfolds...' });
      const result = exporter.formatChronicle(data, { format: 'narrative' });
      expect(result.entry).toContain('Session Narrative');
      expect(result.entry).toContain('An epic tale unfolds...');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatAsHTML
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatAsHTML()', () => {
    it('should include campaign name in rich style', () => {
      exporter.setCampaignName('Dragon Age');
      const html = exporter._formatAsHTML(makeSessionData(), 'full', { isRich: true });
      expect(html).toContain('Dragon Age');
    });

    it('should not include campaign name in minimal style', () => {
      exporter.setCampaignName('Dragon Age');
      const html = exporter._formatAsHTML(makeSessionData(), 'full', { isRich: false });
      // Campaign name paragraph is only added when isRich is true
      expect(html).not.toContain('<p><em>Dragon Age</em></p>');
    });

    it('should include footer in rich mode', () => {
      const html = exporter._formatAsHTML(makeSessionData(), 'full', { isRich: true });
      expect(html).toContain('<hr>');
      expect(html).toContain('VoxChronicle');
    });

    it('should not include footer in non-rich mode', () => {
      const html = exporter._formatAsHTML(makeSessionData(), 'full', { isRich: false });
      expect(html).not.toContain('<hr>');
    });

    it('should include No transcript available for empty segments', () => {
      const data = makeSessionData({ segments: [] });
      const html = exporter._formatAsHTML(data, 'transcript', {
        isRich: true,
        includeTimestamps: false
      });
      expect(html).toContain('No transcript available');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatTranscriptHTML
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatTranscriptHTML()', () => {
    it('should return placeholder for empty segments', () => {
      const html = exporter._formatTranscriptHTML([]);
      expect(html).toContain('No transcript available');
    });

    it('should return placeholder for null segments', () => {
      const html = exporter._formatTranscriptHTML(null);
      expect(html).toContain('No transcript available');
    });

    it('should include speaker and text', () => {
      const segments = [{ speaker: 'DM', text: 'Hello world' }];
      const html = exporter._formatTranscriptHTML(segments);
      expect(html).toContain('DM');
      expect(html).toContain('Hello world');
    });

    it('should include timestamps when requested', () => {
      const segments = [{ speaker: 'DM', text: 'Hello', start: 65 }];
      const html = exporter._formatTranscriptHTML(segments, true);
      expect(html).toContain('timestamp');
    });

    it('should wrap in transcript div', () => {
      const segments = [{ speaker: 'DM', text: 'Hello' }];
      const html = exporter._formatTranscriptHTML(segments);
      expect(html).toContain('<div class="transcript">');
      expect(html).toContain('</div>');
    });

    it('should use dialogue class for paragraphs', () => {
      const segments = [{ speaker: 'DM', text: 'Hello' }];
      const html = exporter._formatTranscriptHTML(segments);
      expect(html).toContain('<p class="dialogue">');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatEntitiesHTML
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatEntitiesHTML()', () => {
    it('should return empty string for null entities', () => {
      expect(exporter._formatEntitiesHTML(null)).toBe('');
    });

    it('should format characters section', () => {
      const entities = {
        characters: [{ name: 'Elara', isNPC: true, description: 'A wizard' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Characters');
      expect(html).toContain('Elara');
      expect(html).toContain('NPC');
      expect(html).toContain('A wizard');
    });

    it('should format PC characters', () => {
      const entities = {
        characters: [{ name: 'Hero', isNPC: false }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('PC');
    });

    it('should format locations section', () => {
      const entities = {
        locations: [{ name: 'Tavern', type: 'Tavern', description: 'A cozy place' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Locations');
      expect(html).toContain('Tavern');
      expect(html).toContain('A cozy place');
    });

    it('should format items section', () => {
      const entities = {
        items: [{ name: 'Sword', type: 'Weapon', description: 'A sharp blade' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Items');
      expect(html).toContain('Sword');
      expect(html).toContain('Weapon');
    });

    it('should handle empty entity arrays', () => {
      const entities = { characters: [], locations: [], items: [] };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toBe('');
    });

    it('should handle mixed entity types', () => {
      const entities = {
        characters: [{ name: 'Elara', isNPC: true }],
        locations: [{ name: 'Tavern' }],
        items: [{ name: 'Sword' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Characters');
      expect(html).toContain('Locations');
      expect(html).toContain('Items');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatEntitiesMarkdown
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatEntitiesMarkdown()', () => {
    it('should return empty string for null entities', () => {
      expect(exporter._formatEntitiesMarkdown(null)).toBe('');
    });

    it('should format characters in markdown', () => {
      const entities = {
        characters: [{ name: 'Elara', isNPC: true, description: 'A wizard' }]
      };
      const md = exporter._formatEntitiesMarkdown(entities);
      expect(md).toContain('### Characters');
      expect(md).toContain('**Elara**');
      expect(md).toContain('NPC');
      expect(md).toContain('A wizard');
    });

    it('should format locations in markdown', () => {
      const entities = {
        locations: [{ name: 'Tavern', type: 'Tavern', description: 'Cozy place' }]
      };
      const md = exporter._formatEntitiesMarkdown(entities);
      expect(md).toContain('### Locations');
      expect(md).toContain('**Tavern**');
    });

    it('should format items in markdown', () => {
      const entities = {
        items: [{ name: 'Sword', type: 'Weapon' }]
      };
      const md = exporter._formatEntitiesMarkdown(entities);
      expect(md).toContain('### Items');
      expect(md).toContain('**Sword**');
      expect(md).toContain('(Weapon)');
    });

    it('should handle empty arrays', () => {
      const entities = { characters: [], locations: [], items: [] };
      expect(exporter._formatEntitiesMarkdown(entities)).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _formatAsMarkdown
  // ════════════════════════════════════════════════════════════════════════

  describe('_formatAsMarkdown()', () => {
    it('should include campaign name when set', () => {
      exporter.setCampaignName('Dragon Age');
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: true,
        includeMoments: true,
        includeTimestamps: false
      });
      expect(md).toContain('*Dragon Age*');
    });

    it('should include summary section in full format', () => {
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: false,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('## Summary');
    });

    it('should include key moments when available', () => {
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: false,
        includeMoments: true,
        includeTimestamps: false
      });
      expect(md).toContain('## Key Moments');
      expect(md).toContain('Dragon appears');
    });

    it('should include entities section', () => {
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: true,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('## Entities Mentioned');
    });

    it('should include transcript in full format', () => {
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: false,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('## Full Transcript');
    });

    it('should include VoxChronicle footer', () => {
      const md = exporter._formatAsMarkdown(makeSessionData(), 'full', {
        includeEntities: false,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('VoxChronicle');
    });

    it('should include narrative section in narrative format', () => {
      const data = makeSessionData({ narrative: 'An epic tale' });
      const md = exporter._formatAsMarkdown(data, 'narrative', {
        includeEntities: false,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('## Session Narrative');
      expect(md).toContain('An epic tale');
    });

    it('should generate basic summary when no summary provided', () => {
      const data = makeSessionData({ summary: undefined });
      const md = exporter._formatAsMarkdown(data, 'summary', {
        includeEntities: false,
        includeMoments: false,
        includeTimestamps: false
      });
      expect(md).toContain('## Summary');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // export
  // ════════════════════════════════════════════════════════════════════════

  describe('export()', () => {
    it('should return Kanka journal data', () => {
      const result = exporter.export(makeSessionData());
      expect(result.name).toBe('Session 1 - The Beginning');
      expect(result.entry).toBeTruthy();
      expect(result.type).toBe('Session Chronicle');
      expect(result.date).toBe('2024-01-15');
      expect(result.is_private).toBe(false);
    });

    it('should include location_id from options', () => {
      const result = exporter.export(makeSessionData(), { location_id: 123 });
      expect(result.location_id).toBe(123);
    });

    it('should include character_id from options', () => {
      const result = exporter.export(makeSessionData(), { character_id: 456 });
      expect(result.character_id).toBe(456);
    });

    it('should include journal_id from options', () => {
      const result = exporter.export(makeSessionData(), { journal_id: 789 });
      expect(result.journal_id).toBe(789);
    });

    it('should include tags from options', () => {
      const result = exporter.export(makeSessionData(), { tags: [1, 2, 3] });
      expect(result.tags).toEqual([1, 2, 3]);
    });

    it('should not include optional fields when not provided', () => {
      const result = exporter.export(makeSessionData());
      expect(result.location_id).toBeUndefined();
      expect(result.character_id).toBeUndefined();
      expect(result.journal_id).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it('should pass formatting options through', () => {
      const result = exporter.export(makeSessionData(), {
        format: 'summary',
        style: 'markdown'
      });
      expect(result.entry).toBeDefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // exportBatch
  // ════════════════════════════════════════════════════════════════════════

  describe('exportBatch()', () => {
    it('should return empty results and errors for null sessions', () => {
      expect(exporter.exportBatch(null)).toEqual({ results: [], errors: [] });
    });

    it('should return empty results and errors for non-array', () => {
      expect(exporter.exportBatch('not-array')).toEqual({ results: [], errors: [] });
    });

    it('should return empty results for empty sessions', () => {
      const batch = exporter.exportBatch([]);
      expect(batch.results).toEqual([]);
      expect(batch.errors).toEqual([]);
    });

    it('should export multiple sessions', () => {
      const sessions = [
        makeSessionData({ title: 'Session 1' }),
        makeSessionData({ title: 'Session 2' }),
        makeSessionData({ title: 'Session 3' })
      ];

      const batch = exporter.exportBatch(sessions);
      expect(batch.results).toHaveLength(3);
      expect(batch.results[0].name).toBe('Session 1');
      expect(batch.results[1].name).toBe('Session 2');
      expect(batch.results[2].name).toBe('Session 3');
      expect(batch.errors).toHaveLength(0);
    });

    it('should report failed exports in errors array', () => {
      const sessions = [
        makeSessionData({ title: 'Good Session' }),
        null, // This will throw
        makeSessionData({ title: 'Another Good' })
      ];

      const batch = exporter.exportBatch(sessions);
      expect(batch.results.length).toBeLessThanOrEqual(3);
      expect(batch.errors.length + batch.results.length).toBe(3);
    });

    it('should apply options to all sessions', () => {
      const sessions = [makeSessionData({ title: 'Session 1' })];
      const batch = exporter.exportBatch(sessions, { location_id: 100 });
      expect(batch.results[0].location_id).toBe(100);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle session data with only title', () => {
      const result = exporter.formatChronicle({ title: 'Minimal' });
      expect(result.name).toBe('Minimal');
      expect(result.entry).toBeTruthy();
    });

    it('should handle segments with no text', () => {
      const segments = [
        { speaker: 'DM', text: undefined },
        { speaker: 'Player', text: '' }
      ];
      const result = exporter.formatTranscript(segments);
      expect(result).toBeDefined();
    });

    it('should handle Date objects in formatChronicle', () => {
      const data = makeSessionData({ date: new Date('2024-06-15') });
      const result = exporter.formatChronicle(data);
      expect(result.date).toBe('2024-06-15');
    });

    it('should handle null date in formatChronicle', () => {
      const data = makeSessionData({ date: null });
      const result = exporter.formatChronicle(data);
      expect(result.date).toBeNull();
    });

    it('should handle entities with no description', () => {
      const entities = {
        characters: [{ name: 'NoDesc', isNPC: true }],
        locations: [{ name: 'Place' }],
        items: [{ name: 'Thing' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('NoDesc');
      expect(html).toContain('Place');
      expect(html).toContain('Thing');
    });

    it('should handle locations without type', () => {
      const entities = {
        locations: [{ name: 'Somewhere' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Somewhere');
    });

    it('should handle items without type', () => {
      const entities = {
        items: [{ name: 'Widget' }]
      };
      const html = exporter._formatEntitiesHTML(entities);
      expect(html).toContain('Widget');
    });

    it('should handle very long segment text in highlights', () => {
      const longText = 'The dragon attacked ' + 'x'.repeat(200);
      const segments = [{ text: longText }];
      const highlights = exporter._extractHighlights(segments, 5);
      if (highlights.length > 0) {
        expect(highlights[0].endsWith('...')).toBe(true);
      }
    });

    it('should handle timestamp=0 in formatTranscript', () => {
      const segments = [{ speaker: 'DM', text: 'Start', start: 0, end: 5 }];
      const result = exporter.formatTranscript(segments, { includeTimestamps: true });
      expect(result).toContain('[0:00]');
    });

    it('should handle segments with no start/end timestamps', () => {
      const segments = [{ speaker: 'DM', text: 'No timestamps' }];
      const summary = exporter.generateSummary(segments);
      expect(summary).not.toContain('minutes');
    });

    it('should handle duration of 0 minutes', () => {
      const segments = [
        { speaker: 'DM', text: 'Quick hello world', start: 0, end: 5 }
      ];
      const summary = exporter.generateSummary(segments);
      // 5 seconds rounds to 0 minutes, which should not be included
      expect(summary).toBeDefined();
    });
  });

  // =========================================================================
  // Prep Sprint Epic 5: ChatProvider migration for generateAISummary
  // =========================================================================
  describe('ChatProvider migration (Prep Sprint Epic 5)', () => {
    const segments = [
      { speaker: 'DM', text: 'You enter the dark cavern.', start: 0, end: 3 },
      { speaker: 'Player1', text: 'I draw my sword.', start: 3, end: 5 }
    ];

    it('should use chatProvider.chat() when chatProvider is provided', async () => {
      const mockChatProvider = {
        chat: vi.fn().mockResolvedValue({
          content: 'The party ventured into a dark cavern...',
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      };
      const cpExporter = new NarrativeExporter({ chatProvider: mockChatProvider });

      const result = await cpExporter.generateAISummary(segments);

      expect(mockChatProvider.chat).toHaveBeenCalled();
      expect(result.summary).toContain('dark cavern');
      expect(result.success).toBe(true);
    });

    it('should fall back to openAIClient when chatProvider is not provided', async () => {
      mockOpenAIClient.post.mockResolvedValue({
        choices: [{ message: { content: 'Fallback summary.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 20 }
      });
      const legacyExporter = new NarrativeExporter({ openAIClient: mockOpenAIClient });

      const result = await legacyExporter.generateAISummary(segments);

      expect(mockOpenAIClient.post).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should pass correct options to chatProvider.chat()', async () => {
      const mockChatProvider = {
        chat: vi.fn().mockResolvedValue({
          content: 'Summary text.',
          usage: {}
        })
      };
      const cpExporter = new NarrativeExporter({ chatProvider: mockChatProvider });

      await cpExporter.generateAISummary(segments, { maxLength: 500 });

      expect(mockChatProvider.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' })
        ]),
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.7
        })
      );
    });

    it('should reject when chatProvider.chat() throws', async () => {
      const mockChatProvider = {
        chat: vi.fn().mockRejectedValue(new Error('ChatProvider down'))
      };
      const cpExporter = new NarrativeExporter({ chatProvider: mockChatProvider });

      const result = await cpExporter.generateAISummary(segments);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
