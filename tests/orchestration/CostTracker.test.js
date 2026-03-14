/**
 * Tests for CostTracker - Token/Cost Monitoring Service
 *
 * Covers: token accumulation, pricing map, cost computation,
 * transcription minutes, cost cap, reset, and token summary.
 */

import { CostTracker } from '../../scripts/orchestration/CostTracker.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('CostTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  // ── PRICING Map ──────────────────────────────────────────────────────────

  describe('PRICING', () => {
    it('should have gpt-4o-mini pricing', () => {
      expect(CostTracker.PRICING['gpt-4o-mini']).toBeDefined();
      expect(CostTracker.PRICING['gpt-4o-mini'].input).toBeCloseTo(0.15 / 1_000_000, 12);
      expect(CostTracker.PRICING['gpt-4o-mini'].output).toBeCloseTo(0.6 / 1_000_000, 12);
    });

    it('should have gpt-4o pricing', () => {
      expect(CostTracker.PRICING['gpt-4o']).toBeDefined();
      expect(CostTracker.PRICING['gpt-4o'].input).toBeCloseTo(2.5 / 1_000_000, 12);
      expect(CostTracker.PRICING['gpt-4o'].output).toBeCloseTo(10.0 / 1_000_000, 12);
    });

    it('should have gpt-4o-transcribe pricing', () => {
      expect(CostTracker.PRICING['gpt-4o-transcribe']).toBeDefined();
      expect(CostTracker.PRICING['gpt-4o-transcribe'].perMinute).toBe(0.006);
    });

    it('should have gpt-4o-transcribe-diarize pricing', () => {
      expect(CostTracker.PRICING['gpt-4o-transcribe-diarize']).toBeDefined();
      expect(CostTracker.PRICING['gpt-4o-transcribe-diarize'].perMinute).toBe(0.006);
    });
  });

  // ── addUsage ─────────────────────────────────────────────────────────────

  describe('addUsage()', () => {
    it('should accumulate tokens from gpt-4o-mini usage', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 });

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(100);
      expect(summary.outputTokens).toBe(50);
      expect(summary.totalTokens).toBe(150);
    });

    it('should compute correct cost for gpt-4o-mini', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });

      // 1M input * $0.15/1M + 1M output * $0.60/1M = $0.75
      expect(tracker.getTotalCost()).toBeCloseTo(0.75, 6);
    });

    it('should compute correct cost for gpt-4o', () => {
      tracker.addUsage('gpt-4o', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });

      // 1M input * $2.50/1M + 1M output * $10.00/1M = $12.50
      expect(tracker.getTotalCost()).toBeCloseTo(12.5, 6);
    });

    it('should accumulate across multiple calls', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 });
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 200, completion_tokens: 100 });

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(300);
      expect(summary.outputTokens).toBe(150);
      expect(summary.totalTokens).toBe(450);
    });

    it('should handle unknown model gracefully (no crash, logs warning)', () => {
      expect(() => {
        tracker.addUsage('unknown-model', { prompt_tokens: 100, completion_tokens: 50 });
      }).not.toThrow();

      // Tokens should still accumulate
      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(100);
      expect(summary.outputTokens).toBe(50);
    });

    it('should handle missing usage fields gracefully', () => {
      expect(() => tracker.addUsage('gpt-4o-mini', {})).not.toThrow();
      expect(() => tracker.addUsage('gpt-4o-mini', { prompt_tokens: 100 })).not.toThrow();
    });
  });

  // ── addTranscriptionMinutes ──────────────────────────────────────────────

  describe('addTranscriptionMinutes()', () => {
    it('should add transcription cost at $0.006/min', () => {
      tracker.addTranscriptionMinutes(1.5);

      // 1.5 * $0.006 = $0.009
      expect(tracker.getTotalCost()).toBeCloseTo(0.009, 6);
    });

    it('should accumulate transcription minutes', () => {
      tracker.addTranscriptionMinutes(1.0);
      tracker.addTranscriptionMinutes(2.0);

      const summary = tracker.getTokenSummary();
      expect(summary.transcriptionMinutes).toBe(3.0);
      expect(tracker.getTotalCost()).toBeCloseTo(0.018, 6);
    });

    it('should combine with token-based costs', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 1_000_000, completion_tokens: 0 });
      tracker.addTranscriptionMinutes(10);

      // $0.15 (tokens) + $0.06 (transcription) = $0.21
      expect(tracker.getTotalCost()).toBeCloseTo(0.21, 6);
    });
  });

  // ── getTotalCost ─────────────────────────────────────────────────────────

  describe('getTotalCost()', () => {
    it('should return 0 initially', () => {
      expect(tracker.getTotalCost()).toBe(0);
    });
  });

  // ── getTokenSummary ──────────────────────────────────────────────────────

  describe('getTokenSummary()', () => {
    it('should return complete summary shape', () => {
      const summary = tracker.getTokenSummary();
      expect(summary).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        transcriptionMinutes: 0,
        totalCost: 0
      });
    });

    it('should reflect accumulated data', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 500, completion_tokens: 200 });
      tracker.addTranscriptionMinutes(5);

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(500);
      expect(summary.outputTokens).toBe(200);
      expect(summary.totalTokens).toBe(700);
      expect(summary.transcriptionMinutes).toBe(5);
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });

  // ── isCapExceeded ────────────────────────────────────────────────────────

  describe('isCapExceeded()', () => {
    it('should return false when cost is below cap', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 });
      expect(tracker.isCapExceeded(5.0)).toBe(false);
    });

    it('should return true when cost equals cap', () => {
      // Force known cost
      tracker.addUsage('gpt-4o', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
      // Cost = $12.50
      expect(tracker.isCapExceeded(12.5)).toBe(true);
    });

    it('should return true when cost exceeds cap', () => {
      tracker.addUsage('gpt-4o', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
      // Cost = $12.50, cap = $5.00
      expect(tracker.isCapExceeded(5.0)).toBe(true);
    });

    it('should return false when cap is 0 (disabled)', () => {
      tracker.addUsage('gpt-4o', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
      expect(tracker.isCapExceeded(0)).toBe(false);
    });
  });

  // ── summarization cost tracking ─────────────────────────────────────────

  describe('summarization cost tracking', () => {
    it('should track summarization costs via gpt-4o-mini addUsage', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 200, completion_tokens: 100 });

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(200);
      expect(summary.outputTokens).toBe(100);
      expect(summary.totalTokens).toBe(300);
      expect(summary.totalCost).toBeGreaterThan(0);
    });

    it('should include summarization costs in getTotalCost()', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 200, completion_tokens: 100 });

      // 200 * $0.15/1M + 100 * $0.60/1M = $0.00009
      const expectedCost = (200 * 0.15) / 1_000_000 + (100 * 0.6) / 1_000_000;
      expect(tracker.getTotalCost()).toBeCloseTo(expectedCost, 10);
    });

    it('should include summarization costs in isCapExceeded()', () => {
      // Add enough cost to exceed a tiny cap
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
      // Cost = $0.75
      expect(tracker.isCapExceeded(0.5)).toBe(true);
    });

    it('should combine summarization and AI suggestion costs', () => {
      // Summarization usage
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 200, completion_tokens: 100 });
      // AI suggestion usage
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 500, completion_tokens: 300 });

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(700);
      expect(summary.outputTokens).toBe(400);
      expect(summary.totalTokens).toBe(1100);
    });
  });

  // ── reset ────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('should clear all accumulators', () => {
      tracker.addUsage('gpt-4o-mini', { prompt_tokens: 500, completion_tokens: 200 });
      tracker.addTranscriptionMinutes(10);

      tracker.reset();

      const summary = tracker.getTokenSummary();
      expect(summary.inputTokens).toBe(0);
      expect(summary.outputTokens).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.transcriptionMinutes).toBe(0);
      expect(summary.totalCost).toBe(0);
    });
  });
});
