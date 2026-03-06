import { PromptBuilder, MAX_CONTEXT_TOKENS } from '../../scripts/narrator/PromptBuilder.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PromptBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new PromptBuilder({ primaryLanguage: 'en', sensitivity: 'medium' });
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('uses defaults when no options provided', () => {
      const b = new PromptBuilder();
      // Defaults: primaryLanguage='en', sensitivity='medium'
      const prompt = b.buildSystemPrompt();
      expect(prompt).toContain('English');
    });

    it('accepts custom primaryLanguage and sensitivity', () => {
      const b = new PromptBuilder({ primaryLanguage: 'it', sensitivity: 'high' });
      const prompt = b.buildSystemPrompt();
      expect(prompt).toContain('Italian');
    });
  });

  // =========================================================================
  // Setters
  // =========================================================================
  describe('setters', () => {
    it('setAdventureContext stores context', () => {
      builder.setAdventureContext('The tavern is dark.');
      // Verify by checking buildAnalysisMessages includes it
      const messages = builder.buildAnalysisMessages('test', true, false);
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain('The tavern is dark.');
    });

    it('setAdventureContext with null/empty clears context', () => {
      builder.setAdventureContext('something');
      builder.setAdventureContext('');
      const messages = builder.buildAnalysisMessages('test', true, false);
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeUndefined();
    });

    it('setChapterContext stores context used in formatChapterContext', () => {
      builder.setChapterContext({
        chapterName: 'Chapter 1',
        subsections: [],
        pageReferences: [],
        summary: 'Start of adventure.'
      });
      const formatted = builder.formatChapterContext();
      expect(formatted).toContain('Chapter 1');
      expect(formatted).toContain('Start of adventure.');
    });

    it('setChapterContext(null) clears context', () => {
      builder.setChapterContext({ chapterName: 'X' });
      builder.setChapterContext(null);
      const prompt = builder.buildSystemPrompt();
      expect(prompt).not.toContain('CURRENT CHAPTER/SCENE CONTEXT');
    });

    it('setConversationHistory sets history used in analysis messages', () => {
      builder.setConversationHistory([
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' }
      ]);
      const messages = builder.buildAnalysisMessages('test', true, false);
      const historyMsg = messages.find(m => m.content === 'Previous question');
      expect(historyMsg).toBeDefined();
    });

    it('setPreviousTranscription sets text used in autonomous suggestions', () => {
      builder.setPreviousTranscription('The party was in the forest.');
      const messages = builder.buildAutonomousSuggestionMessages('context query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('The party was in the forest.');
    });

    it('setPrimaryLanguage changes language in system prompt', () => {
      builder.setPrimaryLanguage('de');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('German');
    });

    it('setSensitivity accepts valid values and includes them in prompt', () => {
      builder.setSensitivity('high');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('OFF-TRACK SENSITIVITY');
      expect(prompt).toContain('Closely monitor');
    });

    it('setSensitivity ignores invalid values and keeps previous', () => {
      builder.setSensitivity('low');
      builder.setSensitivity('garbage');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('Be tolerant of minor deviations');
    });

    it('setConversationHistory with null defaults to empty array', () => {
      builder.setConversationHistory(null);
      // Should not throw when building messages
      const messages = builder.buildAnalysisMessages('test', true, false);
      expect(messages).toBeDefined();
    });

    it('setPreviousTranscription with null defaults to empty string', () => {
      builder.setPreviousTranscription(null);
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).not.toContain('Recent conversation context');
    });
  });

  // =========================================================================
  // buildSystemPrompt
  // =========================================================================
  describe('buildSystemPrompt()', () => {
    it('returns a string containing expert assistant role', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('expert assistant for Dungeon Masters');
    });

    it('includes anti-hallucination rules', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('ANTI-HALLUCINATION');
      expect(prompt).toContain('USE ONLY PROVIDED MATERIAL');
    });

    it('includes response language based on primaryLanguage', () => {
      builder.setPrimaryLanguage('fr');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('French');
    });

    it('falls back to English for unsupported language code', () => {
      builder.setPrimaryLanguage('xx');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('English');
      expect(prompt).not.toContain('xx');
    });

    it('falls back to English for empty language code', () => {
      builder._primaryLanguage = '';
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('English');
    });

    it('uses correct language for each supported code', () => {
      const langMap = { it: 'Italian', en: 'English', de: 'German', fr: 'French', es: 'Spanish', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
      for (const [code, name] of Object.entries(langMap)) {
        builder.setPrimaryLanguage(code);
        expect(builder.buildSystemPrompt()).toContain(name);
      }
    });

    it('includes OFF-TRACK SENSITIVITY in default prompt without chapter context', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('OFF-TRACK SENSITIVITY');
      expect(prompt).toContain('Balance tolerance');
    });

    it('includes chapter context and sensitivity in system prompt', () => {
      builder.setChapterContext({
        chapterName: 'The Dark Forest',
        subsections: ['Entry', 'Clearing'],
        pageReferences: [],
        summary: 'A haunted forest.'
      });
      builder.setSensitivity('high');
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('CURRENT CHAPTER/SCENE CONTEXT');
      expect(prompt).toContain('The Dark Forest');
      expect(prompt).toContain('OFF-TRACK SENSITIVITY');
      expect(prompt).toContain('Closely monitor');
    });
  });

  // =========================================================================
  // buildAnalysisMessages
  // =========================================================================
  describe('buildAnalysisMessages()', () => {
    it('starts with system prompt message', () => {
      const messages = builder.buildAnalysisMessages('test transcription', true, true);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('expert assistant');
    });

    it('includes adventure context when set', () => {
      builder.setAdventureContext('The adventure begins in a tavern.');
      const messages = builder.buildAnalysisMessages('test', true, false);
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain('The adventure begins in a tavern.');
    });

    it('uses RAG context over adventure context when provided', () => {
      builder.setAdventureContext('Fallback adventure context');
      const messages = builder.buildAnalysisMessages('test', true, false, 'RAG retrieved context');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('RAG retrieved context');
      expect(contextMsg.content).not.toContain('Fallback adventure context');
    });

    it('includes conversation history (last 5)', () => {
      const history = [];
      for (let i = 0; i < 8; i++) {
        history.push({ role: 'user', content: `msg-${i}` });
      }
      builder.setConversationHistory(history);
      const messages = builder.buildAnalysisMessages('test', true, false);
      // Should include last 5 history entries
      const historyMsgs = messages.filter(m => m.content.startsWith('msg-'));
      expect(historyMsgs).toHaveLength(5);
      expect(historyMsgs[0].content).toBe('msg-3');
      expect(historyMsgs[4].content).toBe('msg-7');
    });

    it('includes transcription in user message', () => {
      const messages = builder.buildAnalysisMessages('Players enter the cave.', true, false);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Players enter the cave.');
    });

    it('includes suggestions + offTrack JSON format when both true', () => {
      const messages = builder.buildAnalysisMessages('test', true, true);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"suggestions"');
      expect(userMsg.content).toContain('"offTrackStatus"');
      expect(userMsg.content).toContain('"relevantPages"');
    });

    it('includes only suggestions JSON format when suggestions=true, offTrack=false', () => {
      const messages = builder.buildAnalysisMessages('test', true, false);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"suggestions"');
      expect(userMsg.content).not.toContain('"offTrackStatus"');
    });

    it('includes only offTrack JSON format when suggestions=false, offTrack=true', () => {
      const messages = builder.buildAnalysisMessages('test', false, true);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"offTrackStatus"');
      expect(userMsg.content).not.toContain('"suggestions"');
    });

    it('no adventure context message when neither RAG nor adventure context set', () => {
      const messages = builder.buildAnalysisMessages('test', true, false);
      const contextMsg = messages.find(m => m.content?.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeUndefined();
    });
  });

  // =========================================================================
  // buildOffTrackMessages
  // =========================================================================
  describe('buildOffTrackMessages()', () => {
    it('starts with system prompt', () => {
      const messages = builder.buildOffTrackMessages('test');
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('expert assistant');
    });

    it('includes transcription in user message', () => {
      const messages = builder.buildOffTrackMessages('Players went shopping.');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Players went shopping.');
    });

    it('includes off-track JSON format', () => {
      const messages = builder.buildOffTrackMessages('test');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"isOffTrack"');
      expect(userMsg.content).toContain('"severity"');
      expect(userMsg.content).toContain('"narrativeBridge"');
    });

    it('uses RAG context when provided', () => {
      const messages = builder.buildOffTrackMessages('test', 'RAG context here');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('RAG context here');
    });

    it('falls back to adventure context when no RAG context', () => {
      builder.setAdventureContext('Adventure fallback');
      const messages = builder.buildOffTrackMessages('test');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('Adventure fallback');
    });
  });

  // =========================================================================
  // buildSuggestionMessages
  // =========================================================================
  describe('buildSuggestionMessages()', () => {
    it('starts with system prompt', () => {
      const messages = builder.buildSuggestionMessages('test', 3);
      expect(messages[0].role).toBe('system');
    });

    it('includes maxSuggestions count in prompt', () => {
      const messages = builder.buildSuggestionMessages('test', 5);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('up to 5 suggestions');
    });

    it('includes transcription in user message', () => {
      const messages = builder.buildSuggestionMessages('The dragon attacks.', 3);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('The dragon attacks.');
    });

    it('includes suggestions JSON format', () => {
      const messages = builder.buildSuggestionMessages('test', 3);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"suggestions"');
      expect(userMsg.content).toContain('"pageReference"');
    });

    it('uses RAG context when provided', () => {
      const messages = builder.buildSuggestionMessages('test', 3, 'RAG data');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('RAG data');
    });
  });

  // =========================================================================
  // buildNarrativeBridgeMessages
  // =========================================================================
  describe('buildNarrativeBridgeMessages()', () => {
    it('starts with system prompt', () => {
      const messages = builder.buildNarrativeBridgeMessages('off track', 'target scene');
      expect(messages[0].role).toBe('system');
    });

    it('includes current situation and target scene', () => {
      const messages = builder.buildNarrativeBridgeMessages('Players went to the market', 'The dungeon entrance');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Players went to the market');
      expect(userMsg.content).toContain('The dungeon entrance');
    });

    it('asks for brief narration', () => {
      const messages = builder.buildNarrativeBridgeMessages('situation', 'target');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('brief narration');
      expect(userMsg.content).toContain('2-3 sentences');
    });

    it('uses RAG context when provided', () => {
      const messages = builder.buildNarrativeBridgeMessages('sit', 'target', 'RAG bridge context');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('RAG bridge context');
    });
  });

  // =========================================================================
  // buildNPCDialogueMessages
  // =========================================================================
  describe('buildNPCDialogueMessages()', () => {
    it('starts with system prompt', () => {
      const messages = builder.buildNPCDialogueMessages('Thane', 'A gruff bartender', 'conversation', 3);
      expect(messages[0].role).toBe('system');
    });

    it('includes NPC profile when npcContext provided', () => {
      const messages = builder.buildNPCDialogueMessages('Thane', 'A gruff bartender who knows secrets.', 'conversation', 3);
      const profileMsg = messages.find(m => m.content.includes('NPC PROFILE'));
      expect(profileMsg).toBeDefined();
      expect(profileMsg.content).toContain('Thane');
      expect(profileMsg.content).toContain('gruff bartender');
    });

    it('omits NPC profile when npcContext is empty', () => {
      const messages = builder.buildNPCDialogueMessages('Thane', '', 'conversation', 3);
      const profileMsg = messages.find(m => m.content?.includes('NPC PROFILE'));
      expect(profileMsg).toBeUndefined();
    });

    it('includes NPC name and maxOptions in user message', () => {
      const messages = builder.buildNPCDialogueMessages('Elara', 'An elven mage', 'test', 4);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('4 dialogue options');
      expect(userMsg.content).toContain('"Elara"');
    });

    it('includes dialogueOptions JSON format', () => {
      const messages = builder.buildNPCDialogueMessages('NPC', 'context', 'test', 3);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"dialogueOptions"');
    });

    it('truncates long npcContext', () => {
      const longContext = 'a'.repeat(MAX_CONTEXT_TOKENS * 4 + 100);
      const messages = builder.buildNPCDialogueMessages('NPC', longContext, 'test', 3);
      const profileMsg = messages.find(m => m.content.includes('NPC PROFILE'));
      expect(profileMsg.content).toContain('[... content truncated ...]');
    });
  });

  // =========================================================================
  // buildAutonomousSuggestionMessages
  // =========================================================================
  describe('buildAutonomousSuggestionMessages()', () => {
    it('starts with system prompt', () => {
      const messages = builder.buildAutonomousSuggestionMessages('context query');
      expect(messages[0].role).toBe('system');
    });

    it('includes silence prompt in user message', () => {
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('silent for a while');
      expect(userMsg.content).toContain('re-engage the players');
    });

    it('includes chapter info when chapter context is set', () => {
      builder.setChapterContext({
        chapterName: 'Chapter 3',
        subsections: [],
        pageReferences: [],
        summary: 'The dungeon level.'
      });
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Current Chapter Information');
      expect(userMsg.content).toContain('Chapter 3');
    });

    it('omits chapter info when no chapter context', () => {
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).not.toContain('Current Chapter Information');
    });

    it('includes previous transcription when set', () => {
      builder.setPreviousTranscription('The party discussed their plan.');
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Recent conversation context');
      expect(userMsg.content).toContain('The party discussed their plan.');
    });

    it('truncates previous transcription to last 300 chars', () => {
      const fullText = 'A'.repeat(200) + 'B'.repeat(300);
      builder.setPreviousTranscription(fullText);
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      // slice(-300) should keep only the last 300 chars (all B's)
      expect(userMsg.content).not.toContain('A'.repeat(10));
      expect(userMsg.content).toContain('B'.repeat(100));
    });

    it('omits previous transcription when not set', () => {
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).not.toContain('Recent conversation context');
    });

    it('uses RAG context when provided', () => {
      const messages = builder.buildAutonomousSuggestionMessages('query', 'RAG silence context');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('RAG silence context');
    });

    it('falls back to adventure context when no RAG context', () => {
      builder.setAdventureContext('Fallback context for silence');
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg.content).toContain('Fallback context for silence');
    });

    it('includes JSON response format', () => {
      const messages = builder.buildAutonomousSuggestionMessages('query');
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"suggestions"');
      expect(userMsg.content).toContain('"pageReference"');
    });
  });

  // =========================================================================
  // truncateContext
  // =========================================================================
  describe('truncateContext()', () => {
    it('returns short text unchanged', () => {
      expect(builder.truncateContext('short')).toBe('short');
    });

    it('truncates text exceeding MAX_CONTEXT_TOKENS * 4', () => {
      const longText = 'a'.repeat(MAX_CONTEXT_TOKENS * 4 + 100);
      const result = builder.truncateContext(longText);
      expect(result).toContain('[... content truncated ...]');
      expect(result.length).toBeLessThan(longText.length);
    });

    it('preserves text exactly at the limit', () => {
      const exactText = 'b'.repeat(MAX_CONTEXT_TOKENS * 4);
      expect(builder.truncateContext(exactText)).toBe(exactText);
    });

    it('truncation includes first maxChars characters', () => {
      const longText = 'abc'.repeat(MAX_CONTEXT_TOKENS * 2);
      const result = builder.truncateContext(longText);
      expect(result.startsWith('abc')).toBe(true);
    });

    it('returns empty string for null input', () => {
      expect(builder.truncateContext(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(builder.truncateContext(undefined)).toBe('');
    });
  });

  // =========================================================================
  // formatChapterContext
  // =========================================================================
  describe('formatChapterContext()', () => {
    it('returns empty string when no context set', () => {
      expect(builder.formatChapterContext()).toBe('');
    });

    it('includes chapter name', () => {
      builder.setChapterContext({ chapterName: 'Chapter 1' });
      expect(builder.formatChapterContext()).toContain('CURRENT CHAPTER: Chapter 1');
    });

    it('includes sections', () => {
      builder.setChapterContext({ subsections: ['Intro', 'Battle'] });
      expect(builder.formatChapterContext()).toContain('SECTIONS: Intro, Battle');
    });

    it('includes page references with journal names', () => {
      builder.setChapterContext({
        pageReferences: [
          { pageId: 'p1', pageName: 'Page One', journalName: 'Adventure' },
          { pageId: 'p2', pageName: 'Page Two', journalName: '' }
        ]
      });
      const formatted = builder.formatChapterContext();
      expect(formatted).toContain('"Page One" (Adventure)');
      expect(formatted).toContain('"Page Two"');
      // Page Two should NOT have parenthetical since journalName is empty
      expect(formatted).not.toContain('"Page Two" ()');
    });

    it('includes summary', () => {
      builder.setChapterContext({ summary: 'Heroes arrive at the castle.' });
      expect(builder.formatChapterContext()).toContain('SUMMARY: Heroes arrive at the castle.');
    });

    it('formats all fields together', () => {
      builder.setChapterContext({
        chapterName: 'Chapter 1',
        subsections: ['Intro', 'Battle'],
        pageReferences: [
          { pageId: 'p1', pageName: 'Page One', journalName: 'Adventure' }
        ],
        summary: 'Heroes arrive.'
      });
      const formatted = builder.formatChapterContext();
      expect(formatted).toContain('CURRENT CHAPTER: Chapter 1');
      expect(formatted).toContain('SECTIONS: Intro, Battle');
      expect(formatted).toContain('"Page One" (Adventure)');
      expect(formatted).toContain('SUMMARY: Heroes arrive.');
    });

    it('omits sections when subsections is empty', () => {
      builder.setChapterContext({ chapterName: 'Ch1', subsections: [] });
      expect(builder.formatChapterContext()).not.toContain('SECTIONS');
    });

    it('omits page references when none have pageName', () => {
      builder.setChapterContext({
        pageReferences: [{ pageId: 'p1', pageName: '', journalName: 'J' }]
      });
      expect(builder.formatChapterContext()).not.toContain('REFERENCE PAGES');
    });
  });

  // =========================================================================
  // NPC Profiles (Phase 03-01)
  // =========================================================================
  describe('setNPCProfiles / NPC injection', () => {
    const sampleProfiles = [
      {
        name: 'Garrick',
        personality: 'Jovial facade hiding deep anxiety',
        motivation: 'Protect his family from the guild',
        role: 'merchant',
        chapterLocation: 'Chapter 3: The Thieves Guild',
        aliases: ['Old Garrick'],
        sessionNotes: ['Players attempted to deceive him', 'He revealed guild connection']
      },
      {
        name: 'Selene',
        personality: 'Cold and calculating',
        motivation: 'Gain control of the council',
        role: 'antagonist',
        chapterLocation: 'Chapter 5: The Shadow Court',
        aliases: [],
        sessionNotes: []
      }
    ];

    it('setNPCProfiles stores profiles', () => {
      builder.setNPCProfiles(sampleProfiles);
      // Internal state stored - verify via buildAnalysisMessages
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg).toBeDefined();
    });

    it('buildAnalysisMessages includes NPC profiles system message when profiles are set', () => {
      builder.setNPCProfiles(sampleProfiles);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg).toBeDefined();
      expect(npcMsg.role).toBe('system');
    });

    it('buildAnalysisMessages does NOT include NPC message when profiles are empty', () => {
      builder.setNPCProfiles([]);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content?.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg).toBeUndefined();
    });

    it('NPC message format includes name, role, personality, motivation, chapterLocation', () => {
      builder.setNPCProfiles(sampleProfiles);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg.content).toContain('**Garrick**');
      expect(npcMsg.content).toContain('merchant');
      expect(npcMsg.content).toContain('Jovial facade hiding deep anxiety');
      expect(npcMsg.content).toContain('Protect his family from the guild');
      expect(npcMsg.content).toContain('Chapter 3: The Thieves Guild');
    });

    it('NPC message includes session notes when present', () => {
      builder.setNPCProfiles(sampleProfiles);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg.content).toContain('Session notes:');
      expect(npcMsg.content).toContain('Players attempted to deceive him');
      expect(npcMsg.content).toContain('He revealed guild connection');
    });

    it('NPC message does not include session notes line when notes are empty', () => {
      builder.setNPCProfiles([sampleProfiles[1]]); // Selene has no session notes
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg.content).toContain('**Selene**');
      expect(npcMsg.content).not.toContain('Session notes:');
    });

    it('setNPCProfiles with null defaults to empty', () => {
      builder.setNPCProfiles(sampleProfiles);
      builder.setNPCProfiles(null);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const npcMsg = messages.find(m => m.content?.includes('ACTIVE NPC PROFILES'));
      expect(npcMsg).toBeUndefined();
    });
  });

  // =========================================================================
  // Next Chapter Lookahead (Phase 03-01)
  // =========================================================================
  describe('setNextChapterLookahead / foreshadowing injection', () => {
    it('setNextChapterLookahead stores text', () => {
      builder.setNextChapterLookahead('The party will discover the hidden temple.');
      const messages = builder.buildAnalysisMessages('test', true, true);
      const lookaheadMsg = messages.find(m => m.content.includes('UPCOMING CONTENT'));
      expect(lookaheadMsg).toBeDefined();
    });

    it('buildAnalysisMessages includes lookahead system message when set', () => {
      builder.setNextChapterLookahead('Next chapter: The dragon awakens.');
      const messages = builder.buildAnalysisMessages('test', true, true);
      const lookaheadMsg = messages.find(m => m.content.includes('UPCOMING CONTENT'));
      expect(lookaheadMsg).toBeDefined();
      expect(lookaheadMsg.role).toBe('system');
      expect(lookaheadMsg.content).toContain('Next chapter: The dragon awakens.');
      expect(lookaheadMsg.content).toContain('foreshadowing');
    });

    it('buildAnalysisMessages does NOT include lookahead message when empty', () => {
      builder.setNextChapterLookahead('');
      const messages = builder.buildAnalysisMessages('test', true, true);
      const lookaheadMsg = messages.find(m => m.content?.includes('UPCOMING CONTENT'));
      expect(lookaheadMsg).toBeUndefined();
    });

    it('setNextChapterLookahead with null clears text', () => {
      builder.setNextChapterLookahead('Something');
      builder.setNextChapterLookahead(null);
      const messages = builder.buildAnalysisMessages('test', true, true);
      const lookaheadMsg = messages.find(m => m.content?.includes('UPCOMING CONTENT'));
      expect(lookaheadMsg).toBeUndefined();
    });
  });

  // =========================================================================
  // Source citation in JSON schema (Phase 03-01)
  // =========================================================================
  describe('source field in JSON schema', () => {
    it('buildAnalysisMessages JSON schema includes source field (suggestions + offTrack)', () => {
      const messages = builder.buildAnalysisMessages('test', true, true);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"source"');
      expect(userMsg.content).toContain('"chapter"');
      expect(userMsg.content).toContain('"page"');
      expect(userMsg.content).toContain('"journalName"');
    });

    it('buildAnalysisMessages JSON schema includes source field (suggestions only)', () => {
      const messages = builder.buildAnalysisMessages('test', true, false);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('"source"');
    });

    it('buildAnalysisMessages includes source instruction', () => {
      const messages = builder.buildAnalysisMessages('test', true, true);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('MUST include a "source" field');
    });
  });

  // =========================================================================
  // Backward compatibility (Phase 03-01)
  // =========================================================================
  describe('backward compatibility', () => {
    it('existing buildAnalysisMessages calls still work without new setters', () => {
      builder.setAdventureContext('Adventure context');
      const messages = builder.buildAnalysisMessages('test transcription', true, true);
      expect(messages.length).toBeGreaterThanOrEqual(3); // system + context + user
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('test transcription');
    });
  });

  // =========================================================================
  // MAX_CONTEXT_TOKENS export
  // =========================================================================
  describe('MAX_CONTEXT_TOKENS', () => {
    it('is exported and equals 8000', () => {
      expect(MAX_CONTEXT_TOKENS).toBe(8000);
    });
  });

  // =========================================================================
  // Token Budget (Phase 05-02)
  // =========================================================================
  describe('token budget', () => {
    describe('_estimateTokens', () => {
      it('returns Math.ceil(str.length / 4) for non-empty strings', () => {
        expect(builder._estimateTokens('hello world')).toBe(Math.ceil(11 / 4)); // 3
        expect(builder._estimateTokens('a')).toBe(1);
        expect(builder._estimateTokens('abcd')).toBe(1);
        expect(builder._estimateTokens('abcde')).toBe(2);
      });

      it('returns 0 for null/undefined/empty string', () => {
        expect(builder._estimateTokens(null)).toBe(0);
        expect(builder._estimateTokens(undefined)).toBe(0);
        expect(builder._estimateTokens('')).toBe(0);
      });
    });

    describe('setRollingSummary', () => {
      it('stores summary text accessible during message building', () => {
        builder.setRollingSummary('The party arrived at the tavern and met the innkeeper.');
        const messages = builder.buildAnalysisMessages('test', true, false);
        const summaryMsg = messages.find(m => m.content?.includes('SESSION HISTORY'));
        expect(summaryMsg).toBeDefined();
        expect(summaryMsg.content).toContain('The party arrived at the tavern');
      });

      it('clears summary with null', () => {
        builder.setRollingSummary('something');
        builder.setRollingSummary(null);
        const messages = builder.buildAnalysisMessages('test', true, false);
        const summaryMsg = messages.find(m => m.content?.includes('SESSION HISTORY'));
        expect(summaryMsg).toBeUndefined();
      });
    });

    describe('rolling summary injection position', () => {
      it('includes rolling summary as system message between verbatim turns and NPC profiles', () => {
        builder.setAdventureContext('Adventure context here');
        builder.setRollingSummary('Summary of previous turns');
        builder.setConversationHistory([
          { role: 'user', content: 'Turn 1' },
          { role: 'assistant', content: 'Response 1' }
        ]);
        builder.setNPCProfiles([{
          name: 'Garrick', personality: 'Jovial', motivation: 'Protect',
          role: 'merchant', chapterLocation: 'Ch3', aliases: [], sessionNotes: []
        }]);

        const messages = builder.buildAnalysisMessages('test', true, false);

        // Find indices
        const summaryIdx = messages.findIndex(m => m.content?.includes('SESSION HISTORY'));
        const npcIdx = messages.findIndex(m => m.content?.includes('ACTIVE NPC PROFILES'));
        const historyIdx = messages.findIndex(m => m.content === 'Turn 1');

        expect(summaryIdx).toBeGreaterThan(-1);
        // Summary should come after verbatim turns and before NPC profiles
        expect(summaryIdx).toBeGreaterThan(historyIdx);
        expect(summaryIdx).toBeLessThan(npcIdx);
      });
    });

    describe('budget enforcement', () => {
      it('when total tokens exceed budget, lowest priority components are dropped first (next chapter > NPC profiles > rolling summary > verbatim turns > adventure context)', () => {
        // Set a very tight budget
        builder.setTokenBudget(4000);
        builder.setAdventureContext('A'.repeat(2000)); // ~500 tokens
        builder.setConversationHistory([
          { role: 'user', content: 'B'.repeat(2000) },
          { role: 'assistant', content: 'C'.repeat(2000) }
        ]);
        builder.setRollingSummary('D'.repeat(2000));
        builder.setNPCProfiles([{
          name: 'Garrick', personality: 'E'.repeat(1000), motivation: 'F'.repeat(1000),
          role: 'merchant', chapterLocation: 'Ch3', aliases: [], sessionNotes: []
        }]);
        builder.setNextChapterLookahead('G'.repeat(2000));

        const messages = builder.buildAnalysisMessages('test', true, false);

        // System prompt + user request are always included
        expect(messages[0].role).toBe('system');
        const userMsg = messages.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();

        // Adventure context should be present (highest variable priority)
        const adventureMsg = messages.find(m => m.content?.includes('ADVENTURE CONTEXT'));
        expect(adventureMsg).toBeDefined();

        // Next chapter lookahead (lowest priority) should be dropped
        const lookaheadMsg = messages.find(m => m.content?.includes('UPCOMING CONTENT'));
        expect(lookaheadMsg).toBeUndefined();
      });

      it('system prompt + user request are ALWAYS included regardless of budget', () => {
        builder.setTokenBudget(100); // Impossibly small budget
        const messages = builder.buildAnalysisMessages('test', true, false);
        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('expert assistant');
        const userMsg = messages.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
      });

      it('with 12K budget and realistic component sizes, all components fit', () => {
        builder.setTokenBudget(12000);
        builder.setAdventureContext('Adventure context for the session.'); // ~9 tokens
        builder.setConversationHistory([
          { role: 'user', content: 'Player says something.' },
          { role: 'assistant', content: 'AI responds.' }
        ]);
        builder.setRollingSummary('Brief summary of what happened.');
        builder.setNPCProfiles([{
          name: 'Garrick', personality: 'Jovial', motivation: 'Protect',
          role: 'merchant', chapterLocation: 'Ch3', aliases: [], sessionNotes: []
        }]);
        builder.setNextChapterLookahead('Next chapter preview.');

        const messages = builder.buildAnalysisMessages('test', true, false);

        // All components should be present
        expect(messages.find(m => m.content?.includes('ADVENTURE CONTEXT'))).toBeDefined();
        expect(messages.find(m => m.content?.includes('SESSION HISTORY'))).toBeDefined();
        expect(messages.find(m => m.content?.includes('ACTIVE NPC PROFILES'))).toBeDefined();
        expect(messages.find(m => m.content?.includes('UPCOMING CONTENT'))).toBeDefined();
      });

      it('with tight budget (4K), only system prompt + user request + adventure context remain', () => {
        builder.setTokenBudget(4000);
        // Make adventure context large enough to be close to budget
        builder.setAdventureContext('X'.repeat(8000)); // ~2000 tokens
        builder.setConversationHistory([
          { role: 'user', content: 'Y'.repeat(4000) },
          { role: 'assistant', content: 'Z'.repeat(4000) }
        ]);
        builder.setRollingSummary('W'.repeat(4000));
        builder.setNPCProfiles([{
          name: 'NPC', personality: 'V'.repeat(2000), motivation: 'U'.repeat(2000),
          role: 'enemy', chapterLocation: 'Ch1', aliases: [], sessionNotes: []
        }]);
        builder.setNextChapterLookahead('T'.repeat(4000));

        const messages = builder.buildAnalysisMessages('test', true, false);

        // System prompt + user request always present
        expect(messages[0].role).toBe('system');
        expect(messages.find(m => m.role === 'user')).toBeDefined();

        // Adventure context has highest variable priority
        expect(messages.find(m => m.content?.includes('ADVENTURE CONTEXT'))).toBeDefined();

        // Lower priority items should be dropped
        expect(messages.find(m => m.content?.includes('UPCOMING CONTENT'))).toBeUndefined();
        expect(messages.find(m => m.content?.includes('ACTIVE NPC PROFILES'))).toBeUndefined();
      });

      it('budget applies 10% safety margin (targets 10,800 when budget is 12,000)', () => {
        // Create content that fits within 12000 but not within 10800
        builder.setTokenBudget(12000);

        // System prompt is ~1800 chars = ~450 tokens
        // User request is ~400 chars = ~100 tokens
        // Fixed overhead is ~550 tokens
        // Effective budget = 10800
        // Available for variable components = ~10250

        // Adventure context: 36000 chars = 9000 tokens (fits within 10250)
        builder.setAdventureContext('A'.repeat(36000));
        // Rolling summary: 6000 chars = 1500 tokens (9000 + 1500 = 10500 fits in 10250? No, exceeds)
        builder.setRollingSummary('B'.repeat(6000));

        const messages = builder.buildAnalysisMessages('test', true, false);

        // With safety margin the effective budget is lower, so some components may be dropped
        // The key thing is the builder respects the 0.9 multiplier
        // We verify by checking that total estimated tokens don't exceed 10800
        let totalTokens = 0;
        for (const msg of messages) {
          totalTokens += Math.ceil(msg.content.length / 4);
        }
        expect(totalTokens).toBeLessThanOrEqual(10800);
      });

      it('simulated 180-cycle session with growing summary never exceeds budget', () => {
        builder.setTokenBudget(12000);
        builder.setAdventureContext('Adventure context for the campaign setting. ' + 'X'.repeat(400));

        for (let cycle = 0; cycle < 180; cycle++) {
          // Summary grows with each cycle, simulating accumulation
          const summarySize = Math.min(cycle * 50, 8000);
          builder.setRollingSummary('S'.repeat(summarySize));

          // Simulate conversation history (last 5 turns)
          const history = [];
          for (let h = 0; h < 5; h++) {
            history.push({ role: 'user', content: `Turn ${cycle}-${h}: Player action.` });
          }
          builder.setConversationHistory(history);

          const messages = builder.buildAnalysisMessages('Current transcription text.', true, false);

          let totalTokens = 0;
          for (const msg of messages) {
            totalTokens += Math.ceil(msg.content.length / 4);
          }

          // Effective budget with 10% safety margin
          expect(totalTokens).toBeLessThanOrEqual(Math.floor(12000 * 0.9));
        }
      });
    });

    describe('setTokenBudget', () => {
      it('sets the token budget', () => {
        builder.setTokenBudget(8000);
        // Verify by checking budget enforcement behavior changes
        builder.setAdventureContext('X'.repeat(30000)); // ~7500 tokens
        builder.setRollingSummary('Y'.repeat(10000)); // ~2500 tokens
        const messages = builder.buildAnalysisMessages('test', true, false);

        // With 8K budget and safety margin (7200 effective), not everything fits
        let totalTokens = 0;
        for (const msg of messages) {
          totalTokens += Math.ceil(msg.content.length / 4);
        }
        expect(totalTokens).toBeLessThanOrEqual(Math.floor(8000 * 0.9));
      });

      it('defaults to 12000 when called with null', () => {
        builder.setTokenBudget(null);
        // Default budget behavior
        builder.setAdventureContext('Small context');
        const messages = builder.buildAnalysisMessages('test', true, false);
        expect(messages.find(m => m.content?.includes('ADVENTURE CONTEXT'))).toBeDefined();
      });
    });
  });
});
