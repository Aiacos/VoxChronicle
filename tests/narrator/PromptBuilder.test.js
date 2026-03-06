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
});
