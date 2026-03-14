import { NPCProfileExtractor } from '../../scripts/narrator/NPCProfileExtractor.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock OpenAI client for testing
 */
function createMockClient(responseOverride = null) {
  const defaultResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            npcs: [
              {
                name: 'Garrick',
                personality: 'Jovial facade hiding deep anxiety',
                motivation: 'Protect his family from the guild',
                role: 'merchant',
                chapterLocation: 'Chapter 3: The Thieves Guild',
                aliases: ['Garrick the Merchant', 'Old Garrick']
              },
              {
                name: 'Selene',
                personality: 'Cold and calculating',
                motivation: 'Gain control of the council',
                role: 'antagonist',
                chapterLocation: 'Chapter 5: The Shadow Court',
                aliases: ['The Shadow Queen']
              }
            ]
          })
        }
      }
    ]
  };

  return {
    post: vi.fn().mockResolvedValue(responseOverride || defaultResponse)
  };
}

describe('NPCProfileExtractor', () => {
  let extractor;
  let mockClient;

  beforeEach(() => {
    mockClient = createMockClient();
    extractor = new NPCProfileExtractor(mockClient);
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const ext = new NPCProfileExtractor(mockClient);
      expect(ext).toBeDefined();
    });

    it('should accept custom model option', () => {
      const ext = new NPCProfileExtractor(mockClient, { model: 'gpt-4o' });
      expect(ext).toBeDefined();
    });
  });

  // =========================================================================
  // extractProfiles
  // =========================================================================
  describe('extractProfiles', () => {
    it('should return a Map with lowercase NPC name keys from valid response', async () => {
      const profiles = await extractor.extractProfiles('Chapter 3: Garrick is a merchant...');

      expect(profiles).toBeInstanceOf(Map);
      expect(profiles.has('garrick')).toBe(true);
      expect(profiles.has('selene')).toBe(true);
      expect(profiles.get('garrick').name).toBe('Garrick');
      expect(profiles.get('garrick').personality).toBe('Jovial facade hiding deep anxiety');
      expect(profiles.get('garrick').motivation).toBe('Protect his family from the guild');
      expect(profiles.get('garrick').role).toBe('merchant');
      expect(profiles.get('garrick').chapterLocation).toBe('Chapter 3: The Thieves Guild');
    });

    it('should key aliases in the Map pointing to the same profile', async () => {
      const profiles = await extractor.extractProfiles('Chapter 3: Garrick is a merchant...');

      expect(profiles.has('garrick the merchant')).toBe(true);
      expect(profiles.has('old garrick')).toBe(true);
      expect(profiles.get('garrick the merchant')).toBe(profiles.get('garrick'));
      expect(profiles.get('old garrick')).toBe(profiles.get('garrick'));

      // Selene aliases
      expect(profiles.has('the shadow queen')).toBe(true);
      expect(profiles.get('the shadow queen')).toBe(profiles.get('selene'));
    });

    it('should return empty Map for empty/falsy journal text', async () => {
      const profiles1 = await extractor.extractProfiles('');
      expect(profiles1).toBeInstanceOf(Map);
      expect(profiles1.size).toBe(0);

      const profiles2 = await extractor.extractProfiles(null);
      expect(profiles2).toBeInstanceOf(Map);
      expect(profiles2.size).toBe(0);

      const profiles3 = await extractor.extractProfiles(undefined);
      expect(profiles3).toBeInstanceOf(Map);
      expect(profiles3.size).toBe(0);

      // Should not have called the API
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should return empty Map when LLM returns no NPCs', async () => {
      const emptyClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({ npcs: [] })
            }
          }
        ]
      });
      const ext = new NPCProfileExtractor(emptyClient);
      const profiles = await ext.extractProfiles('Some adventure text with no NPCs');

      expect(profiles).toBeInstanceOf(Map);
      expect(profiles.size).toBe(0);
    });

    it('should return empty Map on malformed JSON response', async () => {
      const badClient = createMockClient({
        choices: [
          {
            message: {
              content: 'This is not valid JSON at all!'
            }
          }
        ]
      });
      const ext = new NPCProfileExtractor(badClient);
      const profiles = await ext.extractProfiles('Some adventure text');

      expect(profiles).toBeInstanceOf(Map);
      expect(profiles.size).toBe(0);
    });

    it('should initialize sessionNotes as empty array for each profile', async () => {
      const profiles = await extractor.extractProfiles('Some text');
      expect(profiles.get('garrick').sessionNotes).toEqual([]);
      expect(profiles.get('selene').sessionNotes).toEqual([]);
    });

    it('should store profiles internally for later use', async () => {
      await extractor.extractProfiles('Some text');
      const stored = extractor.getProfiles();
      expect(stored.has('garrick')).toBe(true);
    });
  });

  // =========================================================================
  // addSessionNote
  // =========================================================================
  describe('addSessionNote', () => {
    beforeEach(async () => {
      await extractor.extractProfiles('Some text');
    });

    it('should append a note to the profile sessionNotes', () => {
      extractor.addSessionNote('garrick', 'Players attempted to deceive him');
      const profile = extractor.getProfiles().get('garrick');
      expect(profile.sessionNotes).toContain('Players attempted to deceive him');
    });

    it('should handle case-insensitive NPC name lookup', () => {
      extractor.addSessionNote('Garrick', 'Note about Garrick');
      const profile = extractor.getProfiles().get('garrick');
      expect(profile.sessionNotes).toContain('Note about Garrick');
    });

    it('should cap sessionNotes at 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        extractor.addSessionNote('garrick', `Note ${i}`);
      }
      const profile = extractor.getProfiles().get('garrick');
      expect(profile.sessionNotes.length).toBe(10);
      // Should keep the most recent notes (last added)
      expect(profile.sessionNotes[9]).toBe('Note 14');
    });

    it('should do nothing for unknown NPC name', () => {
      // Should not throw
      extractor.addSessionNote('unknown-npc', 'Some note');
    });
  });

  // =========================================================================
  // detectMentionedNPCs
  // =========================================================================
  describe('detectMentionedNPCs', () => {
    beforeEach(async () => {
      await extractor.extractProfiles('Some text');
    });

    it('should return matching NPCProfile objects for mentioned names', () => {
      const mentioned = extractor.detectMentionedNPCs(
        'Garrick walked into the room and Selene followed.'
      );
      expect(mentioned.length).toBe(2);
      const names = mentioned.map((p) => p.name);
      expect(names).toContain('Garrick');
      expect(names).toContain('Selene');
    });

    it('should skip names shorter than 3 characters', async () => {
      const shortNameClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({
                npcs: [
                  {
                    name: 'Al',
                    personality: 'Short name',
                    motivation: 'Test',
                    role: 'npc',
                    chapterLocation: 'Ch1',
                    aliases: []
                  },
                  {
                    name: 'Bob',
                    personality: 'Long enough',
                    motivation: 'Test',
                    role: 'npc',
                    chapterLocation: 'Ch1',
                    aliases: []
                  }
                ]
              })
            }
          }
        ]
      });
      const ext = new NPCProfileExtractor(shortNameClient);
      await ext.extractProfiles('Some text');

      const mentioned = ext.detectMentionedNPCs('Al and Bob are here');
      const names = mentioned.map((p) => p.name);
      expect(names).toContain('Bob');
      expect(names).not.toContain('Al');
    });

    it('should use word boundary matching (no substring false positives)', () => {
      const mentioned = extractor.detectMentionedNPCs('The garrickson estate was empty');
      // "garrickson" should NOT match "garrick" because of word boundary
      const names = mentioned.map((p) => p.name);
      expect(names).not.toContain('Garrick');
    });

    it('should deduplicate results by profile name', () => {
      // "Garrick" and "Old Garrick" both point to same profile
      const mentioned = extractor.detectMentionedNPCs('Garrick spoke to Old Garrick in the mirror');
      const garrickMatches = mentioned.filter((p) => p.name === 'Garrick');
      expect(garrickMatches.length).toBe(1);
    });

    it('should cap results at 5', async () => {
      const manyNPCs = [];
      for (let i = 0; i < 8; i++) {
        manyNPCs.push({
          name: `Character${i}Name`,
          personality: 'Test',
          motivation: 'Test',
          role: 'npc',
          chapterLocation: 'Ch1',
          aliases: []
        });
      }
      const manyClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({ npcs: manyNPCs })
            }
          }
        ]
      });
      const ext = new NPCProfileExtractor(manyClient);
      await ext.extractProfiles('Some text');

      const contextText = manyNPCs.map((n) => n.name).join(' met ');
      const mentioned = ext.detectMentionedNPCs(contextText);
      expect(mentioned.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no NPCs mentioned', () => {
      const mentioned = extractor.detectMentionedNPCs('The weather was nice today');
      expect(mentioned).toEqual([]);
    });
  });

  // =========================================================================
  // clear and getProfiles
  // =========================================================================
  describe('clear', () => {
    it('should reset the profiles Map', async () => {
      await extractor.extractProfiles('Some text');
      expect(extractor.getProfiles().size).toBeGreaterThan(0);

      extractor.clear();
      expect(extractor.getProfiles().size).toBe(0);
    });
  });
});
