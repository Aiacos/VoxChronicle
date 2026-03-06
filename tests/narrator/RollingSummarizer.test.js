import { RollingSummarizer } from '../../scripts/narrator/RollingSummarizer.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock OpenAI client for summarization tests
 */
function createMockClient(responseOverride = null) {
  const defaultResponse = {
    choices: [{
      message: {
        content: 'The party explored the tavern and met the bartender Thane.'
      }
    }],
    usage: { prompt_tokens: 200, completion_tokens: 50 }
  };

  return {
    createChatCompletion: vi.fn().mockResolvedValue(responseOverride || defaultResponse)
  };
}

describe('RollingSummarizer', () => {
  let summarizer;
  let mockClient;

  beforeEach(() => {
    mockClient = createMockClient();
    summarizer = new RollingSummarizer(mockClient);
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should set default model to gpt-4o-mini', () => {
      expect(summarizer._model).toBe('gpt-4o-mini');
    });

    it('should set default maxSummaryTokens to 500', () => {
      expect(summarizer._maxSummaryTokens).toBe(500);
    });

    it('should accept custom options', () => {
      const custom = new RollingSummarizer(mockClient, {
        model: 'gpt-4o',
        maxSummaryTokens: 1000
      });
      expect(custom._model).toBe('gpt-4o');
      expect(custom._maxSummaryTokens).toBe(1000);
    });

    it('should initialize _isSummarizing as false', () => {
      expect(summarizer._isSummarizing).toBe(false);
    });
  });

  // =========================================================================
  // summarize() - Cold start (no existing summary)
  // =========================================================================
  describe('summarize() cold start', () => {
    it('should return narrative summary from API when no existing summary', async () => {
      const result = await summarizer.summarize('', 'Player/DM: We enter the tavern.\nAI Summary: The party arrives at the tavern.');

      expect(result.summary).toBe('The party explored the tavern and met the bartender Thane.');
      expect(mockClient.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should use cold start prompt when existingSummary is empty', async () => {
      await summarizer.summarize('', 'Player/DM: Hello world');

      const callArgs = mockClient.createChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      expect(userMessage.content).toContain('conversation turns from a tabletop RPG session');
      expect(userMessage.content).not.toContain('existing session summary');
    });
  });

  // =========================================================================
  // summarize() - Update (has existing summary)
  // =========================================================================
  describe('summarize() with existing summary', () => {
    it('should return merged summary from API when existing summary provided', async () => {
      const result = await summarizer.summarize(
        'The party started at the inn.',
        'Player/DM: We head to the castle.'
      );

      expect(result.summary).toBe('The party explored the tavern and met the bartender Thane.');
      expect(mockClient.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should use update prompt when existingSummary is provided', async () => {
      await summarizer.summarize('Prior summary here.', 'Player/DM: New turn');

      const callArgs = mockClient.createChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      expect(userMessage.content).toContain('existing session summary');
      expect(userMessage.content).toContain('Prior summary here.');
    });
  });

  // =========================================================================
  // summarize() - Return value
  // =========================================================================
  describe('summarize() return value', () => {
    it('should return { summary, usage } object', async () => {
      const result = await summarizer.summarize('', 'Player/DM: Some turns');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('usage');
      expect(result.usage).toEqual({ prompt_tokens: 200, completion_tokens: 50 });
    });
  });

  // =========================================================================
  // Concurrency guard
  // =========================================================================
  describe('concurrency guard', () => {
    it('should return existing summary immediately if already summarizing', async () => {
      // Make first call hang
      let resolveFirst;
      mockClient.createChatCompletion.mockImplementationOnce(
        () => new Promise(resolve => { resolveFirst = resolve; })
      );

      const firstCall = summarizer.summarize('', 'Player/DM: Turn 1');

      // Second call while first is in-flight
      const secondResult = await summarizer.summarize('old summary', 'Player/DM: Turn 2');

      expect(secondResult.summary).toBe('old summary');
      expect(secondResult.usage).toBeNull();

      // Only one API call should have been made
      expect(mockClient.createChatCompletion).toHaveBeenCalledTimes(1);

      // Resolve first call to clean up
      resolveFirst({
        choices: [{ message: { content: 'First summary' } }],
        usage: { prompt_tokens: 100, completion_tokens: 30 }
      });
      await firstCall;
    });
  });

  // =========================================================================
  // API failure graceful degradation
  // =========================================================================
  describe('API failure', () => {
    it('should return old summary gracefully on API error (no throw)', async () => {
      mockClient.createChatCompletion.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const result = await summarizer.summarize('Previous summary', 'Player/DM: New turns');

      expect(result.summary).toBe('Previous summary');
      expect(result.usage).toBeNull();
    });

    it('should not throw on API failure', async () => {
      mockClient.createChatCompletion.mockRejectedValueOnce(new Error('Network error'));

      await expect(summarizer.summarize('', 'Player/DM: Turns')).resolves.not.toThrow();
    });

    it('should reset _isSummarizing after failure', async () => {
      mockClient.createChatCompletion.mockRejectedValueOnce(new Error('fail'));

      await summarizer.summarize('', 'turns');
      expect(summarizer._isSummarizing).toBe(false);
    });
  });

  // =========================================================================
  // Empty evicted turns
  // =========================================================================
  describe('empty evicted turns', () => {
    it('should return existing summary unchanged when turns are empty', async () => {
      const result = await summarizer.summarize('Existing summary', '');

      expect(result.summary).toBe('Existing summary');
      expect(result.usage).toBeNull();
      expect(mockClient.createChatCompletion).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // formatTurnsForSummary
  // =========================================================================
  describe('formatTurnsForSummary', () => {
    it('should extract analysis.summary from JSON assistant entries', () => {
      const entries = [
        { role: 'user', content: 'We enter the tavern.' },
        {
          role: 'assistant',
          content: JSON.stringify({
            summary: 'The party arrives at the tavern and orders drinks.',
            suggestions: [{ type: 'narration', content: 'test' }]
          })
        }
      ];

      const result = RollingSummarizer.formatTurnsForSummary(entries);

      expect(result).toContain('Player/DM: We enter the tavern.');
      expect(result).toContain('AI Summary: The party arrives at the tavern and orders drinks.');
      expect(result).not.toContain('suggestions');
    });

    it('should fallback to substring for non-JSON assistant entries', () => {
      const entries = [
        { role: 'assistant', content: 'This is a plain text response that is not JSON formatted at all' }
      ];

      const result = RollingSummarizer.formatTurnsForSummary(entries);

      expect(result).toContain('AI: This is a plain text response');
    });

    it('should prefix user entries with Player/DM:', () => {
      const entries = [
        { role: 'user', content: 'I cast fireball' }
      ];

      const result = RollingSummarizer.formatTurnsForSummary(entries);

      expect(result).toBe('Player/DM: I cast fireball');
    });

    it('should join multiple entries with newlines', () => {
      const entries = [
        { role: 'user', content: 'Turn 1' },
        { role: 'user', content: 'Turn 2' }
      ];

      const result = RollingSummarizer.formatTurnsForSummary(entries);

      expect(result).toBe('Player/DM: Turn 1\nPlayer/DM: Turn 2');
    });

    it('should handle assistant entries with missing summary field', () => {
      const entries = [
        {
          role: 'assistant',
          content: JSON.stringify({ suggestions: [] })
        }
      ];

      const result = RollingSummarizer.formatTurnsForSummary(entries);

      expect(result).toContain('AI Summary: No summary available');
    });
  });
});
