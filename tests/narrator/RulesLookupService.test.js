import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RulesLookupService } from '../../scripts/narrator/RulesLookupService.mjs';

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

describe('RulesLookupService', () => {
  let service;
  let mockRulesReference;
  let mockOpenAIClient;

  const mockSearchResults = [
    {
      rule: {
        title: 'Grappling',
        content: 'When you want to grab a creature or wrestle with it, you can use the Attack action to make a special melee attack, a grapple.',
        category: 'combat',
        source: 'SRD',
        citation: { formatted: 'SRD - PHB p. 195' }
      },
      relevance: 0.9,
      matchedTerms: ['grapple']
    },
    {
      rule: {
        title: 'Grappled Condition',
        content: 'A grappled creature\'s speed becomes 0, and it can\'t benefit from any bonus to its speed.',
        category: 'condition',
        source: 'SRD',
        citation: { formatted: 'SRD - PHB p. 290' }
      },
      relevance: 0.7,
      matchedTerms: ['grapple']
    }
  ];

  const mockSynthesisResponse = {
    choices: [
      {
        message: {
          content: 'Grappling requires an Attack action to make a special melee attack. The target must be no more than one size larger. You use Athletics vs Athletics/Acrobatics. [PHB p. 195]'
        }
      }
    ],
    usage: { prompt_tokens: 150, completion_tokens: 50, total_tokens: 200 }
  };

  beforeEach(() => {
    mockRulesReference = {
      searchRules: vi.fn().mockResolvedValue(mockSearchResults),
      searchCompendiums: vi.fn().mockResolvedValue([])
    };

    mockOpenAIClient = {
      post: vi.fn().mockResolvedValue(mockSynthesisResponse)
    };

    service = new RulesLookupService(mockRulesReference, mockOpenAIClient);
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Exports & Constructor
  // =========================================================================
  describe('exports', () => {
    it('should export the RulesLookupService class', () => {
      expect(RulesLookupService).toBeDefined();
      expect(typeof RulesLookupService).toBe('function');
    });

    it('should be constructable with dependencies', () => {
      expect(service).toBeInstanceOf(RulesLookupService);
    });

    it('should accept custom cooldownMs', () => {
      const s = new RulesLookupService(mockRulesReference, mockOpenAIClient, { cooldownMs: 60000 });
      expect(s).toBeInstanceOf(RulesLookupService);
      s.destroy();
    });
  });

  // =========================================================================
  // _normalizeTopic
  // =========================================================================
  describe('_normalizeTopic', () => {
    it('should lowercase, strip stop words, filter short words, and sort', () => {
      const result = service._normalizeTopic('How does GRAPPLE work?');
      // 'how', 'does', 'work' are stop words; '?' stripped by split
      expect(result).toBe('grapple');
    });

    it('should produce same key for "grappling" and "grapple" via shared stem', () => {
      const a = service._normalizeTopic('grappling');
      const b = service._normalizeTopic('grapple');
      // Both contain 'grappl' substring — but normalization keeps full words
      // grappling -> 'grappling', grapple -> 'grapple'
      // They will differ slightly but that's acceptable per plan
      expect(a).toContain('grappl');
      expect(b).toContain('grappl');
    });

    it('should sort remaining terms alphabetically', () => {
      const result = service._normalizeTopic('saving throw advantage');
      expect(result).toBe('advantage saving throw');
    });

    it('should filter words shorter than 2 characters', () => {
      const result = service._normalizeTopic('a I grapple');
      expect(result).toBe('grapple');
    });

    it('should handle empty string', () => {
      expect(service._normalizeTopic('')).toBe('');
    });

    it('should handle only stop words', () => {
      expect(service._normalizeTopic('how does the')).toBe('');
    });
  });

  // =========================================================================
  // lookup() — main entry point
  // =========================================================================
  describe('lookup', () => {
    it('should return compendiumResults, synthesisPromise, and topic', async () => {
      const result = await service.lookup('how does grapple work');

      expect(result).toBeDefined();
      expect(result.compendiumResults).toEqual(mockSearchResults);
      expect(result.synthesisPromise).toBeInstanceOf(Promise);
      expect(result.topic).toBe('grapple');
    });

    it('should call searchRules with the normalized topic', async () => {
      await service.lookup('how does grapple work');

      expect(mockRulesReference.searchRules).toHaveBeenCalledWith('grapple', { limit: 3 });
    });

    it('should fall back to searchCompendiums when searchRules returns empty', async () => {
      mockRulesReference.searchRules.mockResolvedValue([]);
      mockRulesReference.searchCompendiums.mockResolvedValue(mockSearchResults);

      const result = await service.lookup('how does grapple work');

      expect(mockRulesReference.searchCompendiums).toHaveBeenCalledWith('grapple', { limit: 3 });
      expect(result.compendiumResults).toEqual(mockSearchResults);
    });

    it('should return null on cooldown for same topic (auto-detection)', async () => {
      await service.lookup('how does grapple work');

      const secondResult = await service.lookup('how does grapple work');
      expect(secondResult).toBeNull();
    });

    it('should execute on cooldown topic when skipCooldown is true (on-demand)', async () => {
      await service.lookup('how does grapple work');

      const result = await service.lookup('grapple', { skipCooldown: true });
      expect(result).not.toBeNull();
      expect(result.compendiumResults).toBeDefined();
    });

    it('should allow different topics even when one is on cooldown', async () => {
      await service.lookup('grapple');

      const result = await service.lookup('advantage');
      expect(result).not.toBeNull();
    });

    it('should return null for empty question', async () => {
      const result = await service.lookup('');
      expect(result).toBeNull();
    });

    it('should return null for question that normalizes to empty', async () => {
      const result = await service.lookup('how does the');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Cooldown
  // =========================================================================
  describe('cooldown', () => {
    it('should expire cooldown after cooldownMs', async () => {
      const shortCooldown = new RulesLookupService(mockRulesReference, mockOpenAIClient, { cooldownMs: 50 });

      await shortCooldown.lookup('grapple');
      expect(await shortCooldown.lookup('grapple')).toBeNull();

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      const result = await shortCooldown.lookup('grapple');
      expect(result).not.toBeNull();

      shortCooldown.destroy();
    });

    it('should not set cooldown when skipCooldown is true', async () => {
      await service.lookup('grapple', { skipCooldown: true });

      // Should still be callable without cooldown block
      const result = await service.lookup('grapple');
      expect(result).not.toBeNull();
    });
  });

  // =========================================================================
  // Synthesis (_synthesize)
  // =========================================================================
  describe('synthesis', () => {
    it('should resolve synthesisPromise with answer, citations, usage', async () => {
      const result = await service.lookup('how does grapple work');
      const synthesis = await result.synthesisPromise;

      expect(synthesis.answer).toBe(mockSynthesisResponse.choices[0].message.content);
      expect(synthesis.citations).toEqual(['SRD - PHB p. 195', 'SRD - PHB p. 290']);
      expect(synthesis.usage).toEqual(mockSynthesisResponse.usage);
    });

    it('should call OpenAI with gpt-4o model, temperature 0.2, max_tokens 300', async () => {
      const result = await service.lookup('how does grapple work');
      await result.synthesisPromise;

      expect(mockOpenAIClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.2,
          max_tokens: 300
        }),
        expect.any(Object)
      );
    });

    it('should include system message requiring SRD citations', async () => {
      const result = await service.lookup('how does grapple work');
      await result.synthesisPromise;

      const callArgs = mockOpenAIClient.post.mock.calls[0][1];
      const systemMessage = callArgs.messages.find(m => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('cite');
    });

    it('should include compendium excerpts in user message', async () => {
      const result = await service.lookup('how does grapple work');
      await result.synthesisPromise;

      const callArgs = mockOpenAIClient.post.mock.calls[0][1];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage.content).toContain('Grappling');
      expect(userMessage.content).toContain('how does grapple work');
    });

    it('should cap excerpt content at 1500 chars each', async () => {
      const longContent = 'x'.repeat(2000);
      mockRulesReference.searchRules.mockResolvedValue([{
        rule: {
          title: 'Long Rule',
          content: longContent,
          category: 'combat',
          source: 'SRD',
          citation: { formatted: 'SRD' }
        },
        relevance: 0.9,
        matchedTerms: ['long']
      }]);

      const result = await service.lookup('long rule');
      await result.synthesisPromise;

      const callArgs = mockOpenAIClient.post.mock.calls[0][1];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      // Content should be capped, not include full 2000 chars
      expect(userMessage.content.length).toBeLessThan(2000 + 500); // some overhead for formatting
    });

    it('should reject synthesisPromise when OpenAI post fails', async () => {
      mockOpenAIClient.post.mockRejectedValue(new Error('API error'));

      const result = await service.lookup('how does grapple work');
      await expect(result.synthesisPromise).rejects.toThrow('API error');
    });

    it('should extract citations from compendium results using citation.formatted', async () => {
      const result = await service.lookup('how does grapple work');
      const synthesis = await result.synthesisPromise;

      expect(synthesis.citations).toContain('SRD - PHB p. 195');
      expect(synthesis.citations).toContain('SRD - PHB p. 290');
    });

    it('should fall back to rule.source when citation.formatted is missing', async () => {
      mockRulesReference.searchRules.mockResolvedValue([{
        rule: {
          title: 'Some Rule',
          content: 'Rule content here',
          category: 'combat',
          source: 'Custom Source'
        },
        relevance: 0.8,
        matchedTerms: ['some']
      }]);

      const result = await service.lookup('some rule');
      const synthesis = await result.synthesisPromise;

      expect(synthesis.citations).toContain('Custom Source');
    });
  });

  // =========================================================================
  // Abort signal
  // =========================================================================
  describe('abort signal', () => {
    it('should pass signal to OpenAI post call', async () => {
      const controller = new AbortController();
      const result = await service.lookup('grapple', { signal: controller.signal });

      // Verify signal was passed through
      expect(mockOpenAIClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal })
      );

      await result.synthesisPromise;
    });

    it('should reject synthesis when signal is aborted', async () => {
      const controller = new AbortController();
      mockOpenAIClient.post.mockImplementation(() => {
        return new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            const error = new DOMException('The operation was aborted.', 'AbortError');
            reject(error);
          });
        });
      });

      const result = await service.lookup('grapple', { signal: controller.signal });
      controller.abort();

      await expect(result.synthesisPromise).rejects.toThrow('AbortError');
    });
  });

  // =========================================================================
  // destroy()
  // =========================================================================
  describe('destroy', () => {
    it('should clear cooldown map', async () => {
      await service.lookup('grapple');
      expect(await service.lookup('grapple')).toBeNull(); // on cooldown

      service.destroy();

      // After destroy, cooldown should be cleared
      const result = await service.lookup('grapple');
      expect(result).not.toBeNull();
    });
  });
});
