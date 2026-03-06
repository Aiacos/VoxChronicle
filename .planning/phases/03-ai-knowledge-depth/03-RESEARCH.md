# Phase 3: AI Knowledge Depth - Research

**Researched:** 2026-03-06
**Domain:** LLM prompt engineering, NPC extraction, structured JSON responses, context window management
**Confidence:** HIGH

## Summary

Phase 3 adds three capabilities to the existing live mode AI pipeline: (1) NPC awareness -- pre-extracting NPC profiles from the adventure journal at session start and injecting them into prompts when players mention NPC names, (2) foreshadowing -- including the next chapter's opening content in the AI context window so suggestions are forward-looking, and (3) source citation -- adding a mandatory `source` field to every AI suggestion response.

All three capabilities are purely prompt engineering and context management changes. No new external libraries or APIs are needed. The work modifies four existing files (PromptBuilder, AIAssistant, SessionOrchestrator, and ChapterTracker) plus creates one new lightweight service (NPCRosterExtractor or similar). The existing `EntityExtractor` is designed for post-session chronicle mode and uses gpt-4o at higher cost; this phase needs a lighter-weight extraction using gpt-4o-mini that runs once at session start.

**Primary recommendation:** Build an NPCProfileExtractor class that runs once during `_initializeJournalContext()`, stores results in a Map on SessionOrchestrator, and passes them to PromptBuilder via a new `setNPCProfiles()` setter. Extend `buildAnalysisMessages()` to inject NPC context and next-chapter lookahead. Extend `_parseAnalysisResponse()` to extract the new `source` field.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hybrid NPC approach: pre-extract ALL NPCs from entire journal at session start + live enrichment from transcription
- NPC profiles include: name, personality, motivation, chapter location, role
- Extraction uses LLM pass over journal content at session start (~2-5K tokens)
- Auto-surface NPC profiles when player mentions NPC name in transcription (no explicit DM action)
- Live NPC enrichment: append one-line notes when players interact meaningfully with NPCs
- Passive foreshadowing only: AI sees next chapter summary but does not explicitly call out foreshadowing unless natural
- No "What's next?" button -- just better-informed suggestions
- Next chapter lookahead: first 1000 chars of next chapter (~250 tokens) included in AI context
- Uses `ChapterTracker.getSiblingChapters().next` to identify next chapter
- Source citation: both structured JSON field AND inline text mention per suggestion
- Source field format: `source: { chapter, page, journalName }`
- AI also mentions source naturally in text: "[Source: Chapter 3 > Garrick's Bargain]"
- Granularity: chapter + page name
- Rich detail suggestions with names and context
- Suggestions CAN reference future content, framed as DM-only foreshadowing seeds
- Future content labeled as foreshadowing seeds DM can choose to use or ignore

### Claude's Discretion
- Exact NPC extraction prompt design and JSON schema for profiles
- How NPC profiles are stored in memory (Map, array, or other structure)
- How name-mention detection works (exact match, fuzzy, or LLM-based)
- How live enrichment notes are formatted and when they trigger
- Token budget allocation between NPC profiles, chapter context, and foreshadowing summary
- How the structured source field integrates with PromptBuilder's existing response schema

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTX-06 | AI surfaces NPC names, personalities, and motivations from adventure journal text when relevant | NPC pre-extraction at session start + name-mention detection in transcript tail + NPC profile injection into prompts |
| CTX-07 | AI anticipates upcoming scenes from the adventure and can suggest foreshadowing seeds | Next-chapter lookahead via ChapterTracker.getSiblingChapters().next, first 1000 chars appended to AI context |
| SUG-01 | AI suggestions reference specific adventure content from the journal, not generic D&D lore | Source citation field in response schema + anti-hallucination prompt reinforcement + grounding via NPC profiles and chapter content |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI Chat Completions API | gpt-4o-mini | NPC extraction + live analysis | Already used by AIAssistant; mini is cost-effective for structured extraction |
| Foundry VTT v13 API | v13 | Journal access, game settings | Project's runtime platform |

### Supporting
No new libraries needed. All work uses existing project infrastructure.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gpt-4o-mini for NPC extraction | gpt-4o | Better extraction quality but 10x cost; mini is sufficient for structured profile extraction from clean journal text |
| Separate NPCProfileExtractor class | Extending EntityExtractor | EntityExtractor is chronicle-mode, extends OpenAIClient directly, uses gpt-4o; separate class keeps concerns clean |
| Map for NPC storage | Array | Map provides O(1) lookup by name which matters for name-mention detection |

## Architecture Patterns

### Recommended Project Structure
No new directories needed. New/modified files:

```
scripts/
├── narrator/
│   ├── NPCProfileExtractor.mjs   # NEW - extracts NPC roster from journal text
│   ├── PromptBuilder.mjs          # MODIFIED - new setNPCProfiles(), setNextChapterLookahead(), source schema
│   └── AIAssistant.mjs            # MODIFIED - new setNPCProfiles() passthrough, source field parsing
├── orchestration/
│   └── SessionOrchestrator.mjs    # MODIFIED - NPC extraction at init, name detection per cycle, live enrichment
```

### Pattern 1: NPCProfileExtractor as Lightweight Service
**What:** A focused service that takes journal text and returns structured NPC profiles via a single LLM call. Does NOT extend OpenAIClient (unlike EntityExtractor). Instead, receives an OpenAIClient instance via constructor injection, matching the AIAssistant composition pattern.
**When to use:** At session start during `_initializeJournalContext()`.

```javascript
// scripts/narrator/NPCProfileExtractor.mjs
import { Logger } from '../utils/Logger.mjs';

/**
 * @typedef {Object} NPCProfile
 * @property {string} name - NPC's name
 * @property {string} personality - Brief personality description
 * @property {string} motivation - What drives this NPC
 * @property {string} role - Story role (merchant, villain, ally, etc.)
 * @property {string} chapterLocation - Which chapter/page this NPC appears in
 * @property {string[]} aliases - Alternative names or titles
 * @property {string[]} sessionNotes - Live enrichment notes appended during session
 */

export class NPCProfileExtractor {
  constructor(openAIClient, options = {}) {
    this._client = openAIClient;
    this._logger = Logger.createChild('NPCProfileExtractor');
    this._model = options.model || 'gpt-4o-mini';
  }

  /**
   * Extract NPC profiles from adventure journal text
   * @param {string} journalText - Full journal text
   * @param {Object} [options] - Options
   * @returns {Promise<Map<string, NPCProfile>>} Map of lowercase name -> profile
   */
  async extractProfiles(journalText, options = {}) {
    // Single LLM call with structured output request
    // Returns Map keyed by lowercase name for O(1) lookup
  }
}
```

### Pattern 2: Name-Mention Detection via Simple String Matching
**What:** After NPC profiles are extracted, detect mentions in the transcript tail using case-insensitive string search against the NPC name roster. No fuzzy matching or LLM needed.
**When to use:** Every AI analysis cycle in `_runAIAnalysis()`.
**Why simple matching:** NPC names from journals are proper nouns. Transcription preserves them well. Simple `includes()` on the 15K char transcript tail is fast (sub-millisecond) and reliable.

```javascript
// In SessionOrchestrator._runAIAnalysis() or a helper method
_detectMentionedNPCs(contextText, npcProfiles) {
  const mentioned = [];
  const textLower = contextText.toLowerCase();
  for (const [nameLower, profile] of npcProfiles) {
    if (textLower.includes(nameLower)) {
      mentioned.push(profile);
    }
  }
  return mentioned;
}
```

### Pattern 3: Context Injection via PromptBuilder Setters
**What:** Follow the established `setChapterContext()` / `setAdventureContext()` pattern to add `setNPCProfiles()` and `setNextChapterLookahead()`. PromptBuilder formats these into the system prompt or as additional system messages.
**When to use:** Per AI analysis cycle, after detecting mentioned NPCs.

```javascript
// PromptBuilder additions
setNPCProfiles(profiles) {
  this._npcProfiles = profiles || [];
}

setNextChapterLookahead(text) {
  this._nextChapterLookahead = text || '';
}
```

### Pattern 4: Extended Response Schema with Source Citation
**What:** Add `source` field to the JSON schema requested from the LLM. Parse it in `_parseAnalysisResponse()`.
**When to use:** Every suggestion response.

```javascript
// In buildAnalysisMessages() JSON format instruction, extend each suggestion:
{
  "suggestions": [{
    "type": "narration|dialogue|action|reference",
    "content": "...",
    "confidence": 0.0-1.0,
    "source": {
      "chapter": "Chapter 3: The Thieves Guild",
      "page": "Garrick's Bargain",
      "journalName": "Lost Mine of Phandelver"
    }
  }],
  "offTrackStatus": {...},
  "relevantPages": [...],
  "summary": "..."
}
```

### Pattern 5: Live NPC Enrichment via Session Notes
**What:** When the AI analysis detects meaningful NPC interactions (based on suggestion content referencing specific NPCs), append a one-line session note to that NPC's profile in the Map. Accumulative, not replacing.
**When to use:** After each AI analysis response that references NPCs.

### Anti-Patterns to Avoid
- **Calling LLM for NPC detection per cycle:** Wasteful and slow. Use simple string matching for name detection; the LLM extraction happens once at session start only.
- **Storing NPC profiles in Foundry settings:** Session-scoped data should not persist to settings. Use in-memory Map on SessionOrchestrator.
- **Sending ALL NPC profiles every cycle:** Token-wasteful. Only send profiles of NPCs mentioned in the current transcript window.
- **Modifying EntityExtractor for journal extraction:** EntityExtractor is chronicle-mode (post-session) and uses gpt-4o. Keep concerns separate.
- **Making foreshadowing a separate API call:** The next-chapter lookahead is just context text -- include it in the same analysis call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NPC name matching | Fuzzy string matching library | Simple case-insensitive `includes()` | NPC names from journals are proper nouns; transcription preserves them; false positives from substring matches are acceptable (e.g., "Art" matching "Garrick's Art Shop" is fine since context resolves it) |
| JSON parsing from LLM | Custom parser | `JSON.parse()` + existing `_extractJson()` | Already handles markdown code blocks and edge cases |
| Token counting | Token counting library | Character-based estimation (4 chars/token) | Already used throughout the codebase; sufficient for budget allocation |

**Key insight:** This phase is entirely prompt engineering and context management. No new infrastructure or libraries are needed.

## Common Pitfalls

### Pitfall 1: Token Budget Overflow
**What goes wrong:** NPC profiles + chapter context + next-chapter lookahead + transcript + system prompt exceed gpt-4o-mini's context window or become too expensive.
**Why it happens:** Each NPC profile is ~100-200 chars. An adventure with 20+ NPCs could add 4K+ chars. Combined with 8K chapter context + 1K lookahead + 15K transcript, total input approaches limits.
**How to avoid:** Budget allocation: max 2K chars for NPC profiles (mentioned NPCs only, ~10 profiles max), 8K chapter context (existing), 1K next-chapter lookahead, 15K transcript. Total ~26K chars = ~6.5K tokens input, well within gpt-4o-mini's 128K context.
**Warning signs:** API costs spike; responses become generic despite context injection.

### Pitfall 2: NPC Extraction Returns Empty or Garbage
**What goes wrong:** The LLM extraction prompt at session start returns no NPCs or misidentifies player references as NPCs.
**Why it happens:** Journal text format varies wildly. Some journals have clear NPC sections; others weave NPCs into narrative prose.
**How to avoid:** Design the extraction prompt to be robust to different journal formats. Include examples of different formats in the prompt. Validate extracted profiles have required fields. Handle zero-result gracefully (log warning, continue without NPC awareness).
**Warning signs:** `extractProfiles()` consistently returns 0 NPCs on real journals.

### Pitfall 3: Source Citation Hallucination
**What goes wrong:** The LLM invents source citations that don't correspond to actual journal chapters/pages.
**Why it happens:** The LLM generates plausible-sounding citations even when the information doesn't come from the provided context.
**How to avoid:** The existing anti-hallucination rules in `buildSystemPrompt()` already say "ALWAYS CITE SOURCES" and "USE ONLY PROVIDED MATERIAL." Reinforce by providing the exact chapter/page names in the context so the LLM can only reference what's actually there. Optionally validate cited sources against known chapter list post-response.
**Warning signs:** Source citations reference chapters that don't exist in the journal.

### Pitfall 4: Name-Mention False Positives
**What goes wrong:** Common words that happen to match NPC names trigger profile injection (e.g., NPC named "Art" matches "art gallery" in transcript).
**Why it happens:** Simple `includes()` on short names produces substring matches.
**How to avoid:** Filter out NPC names shorter than 3 characters. Use word-boundary matching (`new RegExp('\\b' + name + '\\b', 'i')`) instead of plain `includes()`. This adds negligible cost.
**Warning signs:** Irrelevant NPC profiles appearing in suggestions for common-word names.

### Pitfall 5: Session Start Latency from NPC Extraction
**What goes wrong:** The LLM call to extract NPCs adds 2-5 seconds to session start, making the DM wait.
**Why it happens:** Even gpt-4o-mini takes 1-3 seconds for a structured extraction call.
**How to avoid:** Run NPC extraction in parallel with RAG indexing (both are already non-blocking in `_initializeJournalContext()`). Show a progress indicator. Cache extracted profiles so re-starting the same session doesn't re-extract.
**Warning signs:** DM complains about slow session start.

## Code Examples

### NPC Profile Extraction Prompt
```javascript
// Extraction system prompt for gpt-4o-mini
const systemPrompt = `You are an expert at analyzing tabletop RPG adventure modules.
Extract ALL named NPCs from the following adventure text.

For each NPC provide:
- name: The NPC's primary name
- personality: 1-2 sentence personality description
- motivation: What drives this NPC (goals, fears, desires)
- role: Their story role (merchant, villain, ally, quest-giver, etc.)
- chapterLocation: Which chapter or section they appear in
- aliases: Any alternative names or titles

Return JSON:
{
  "npcs": [
    {
      "name": "Garrick",
      "personality": "Jovial facade hiding deep anxiety. Quick to laugh but nervous when alone.",
      "motivation": "Protect his family from Thieves Guild threats. Wants to pay off his debt.",
      "role": "merchant",
      "chapterLocation": "Chapter 3: The Thieves Guild",
      "aliases": ["Garrick the Merchant", "Old Garrick"]
    }
  ]
}

Rules:
1. Only extract named NPCs, not generic unnamed characters
2. Base ALL profiles on the text provided, do not invent details
3. If personality/motivation is not explicit, infer conservatively from context
4. Include ALL NPCs across ALL chapters, not just the first chapter`;
```

### Extended Analysis Response Schema
```javascript
// In buildAnalysisMessages(), the JSON format request becomes:
requestContent += `Respond in JSON format with this structure:
{
  "suggestions": [{
    "type": "narration|dialogue|action|reference",
    "content": "Rich suggestion text with NPC names and specific details. Include [Source: Chapter > Page] inline.",
    "confidence": 0.0-1.0,
    "source": {
      "chapter": "chapter name from context",
      "page": "page/section name",
      "journalName": "journal name"
    }
  }],
  "offTrackStatus": {"isOffTrack": boolean, "severity": 0.0-1.0, "reason": "..."},
  "relevantPages": ["..."],
  "summary": "..."
}

IMPORTANT: Every suggestion MUST include a "source" field citing the specific chapter and page from the provided context.`;
```

### NPC Context Injection in PromptBuilder
```javascript
// In buildAnalysisMessages(), after adventure context, before user message:
if (this._npcProfiles && this._npcProfiles.length > 0) {
  const npcBlock = this._npcProfiles.map(p => {
    let entry = `- **${p.name}** (${p.role}): ${p.personality} Motivation: ${p.motivation}. [${p.chapterLocation}]`;
    if (p.sessionNotes && p.sessionNotes.length > 0) {
      entry += `\n  Session notes: ${p.sessionNotes.join('; ')}`;
    }
    return entry;
  }).join('\n');

  messages.push({
    role: 'system',
    content: `ACTIVE NPC PROFILES (mentioned in current conversation):\n${npcBlock}\n\nUse these profiles to inform your suggestions. Reference NPCs by name with their personality and motivation.`
  });
}

if (this._nextChapterLookahead) {
  messages.push({
    role: 'system',
    content: `UPCOMING CONTENT (next chapter preview - DM eyes only):\n${this._nextChapterLookahead}\n\nYou may subtly weave foreshadowing seeds from this content into your suggestions, framed as DM-only hints the DM can choose to use.`
  });
}
```

### Name Detection with Word Boundaries
```javascript
/**
 * Detect which NPCs from the roster are mentioned in the transcript text
 * @param {string} contextText - Recent transcript text
 * @param {Map<string, NPCProfile>} npcProfiles - Full NPC roster
 * @returns {NPCProfile[]} Profiles of mentioned NPCs
 */
_detectMentionedNPCs(contextText, npcProfiles) {
  const mentioned = [];
  for (const [nameLower, profile] of npcProfiles) {
    // Skip very short names to avoid false positives
    if (nameLower.length < 3) continue;
    // Word boundary match
    const regex = new RegExp('\\b' + nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (regex.test(contextText)) {
      mentioned.push(profile);
    }
  }
  return mentioned;
}
```

### Source Field Parsing in _parseAnalysisResponse()
```javascript
// Extend the suggestion mapping in _parseAnalysisResponse():
const validatedSuggestions = this._validateArray(parsed.suggestions, 10, 'suggestions')
  .map(s => ({
    type: s.type || 'narration',
    content: this._validateString(s.content || '', 5000, 'suggestion.content'),
    pageReference: s.pageReference
      ? this._validateString(s.pageReference, 200, 'suggestion.pageReference')
      : undefined,
    confidence: this._validateNumber(s.confidence, 0, 1, 'suggestion.confidence'),
    source: s.source ? {
      chapter: this._validateString(s.source.chapter || '', 200, 'source.chapter'),
      page: this._validateString(s.source.page || '', 200, 'source.page'),
      journalName: this._validateString(s.source.journalName || '', 200, 'source.journalName')
    } : null
  }));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic adventure context dump | Chapter-scoped context (Phase 2) | 2026-03-06 | Reduces noise, improves relevance |
| No NPC awareness | Pre-extracted NPC roster + mention detection (this phase) | Pending | Suggestions reference specific NPCs by name |
| No source citations | Mandatory source field per suggestion (this phase) | Pending | Grounds suggestions in journal, combats hallucination |
| No forward-looking context | Next-chapter lookahead (this phase) | Pending | Enables foreshadowing seeds |

## Open Questions

1. **Live enrichment trigger threshold**
   - What we know: Context says "meaningful interactions" like deception, combat, alliance should trigger a session note
   - What's unclear: How to detect "meaningful interaction" from transcript text without an LLM call per cycle
   - Recommendation: Use a simple heuristic -- if the AI's suggestion response explicitly names an NPC AND the suggestion type is 'dialogue' or 'action', append a one-line note summarizing the interaction from the suggestion content. No extra LLM call needed.

2. **NPC extraction prompt robustness across journal formats**
   - What we know: Foundry journals vary in structure (some have clear NPC sections, others have NPCs woven into prose)
   - What's unclear: How well gpt-4o-mini handles diverse journal formats for NPC extraction
   - Recommendation: Design prompt with explicit examples of different formats. Test with 2-3 real journal samples during implementation. If extraction quality is poor, escalate to gpt-4o for extraction only (still just one call at session start).

3. **Token budget for NPC profiles per cycle**
   - What we know: Need to balance NPC context against chapter context and transcript
   - What's unclear: Optimal number of NPC profiles to include per cycle
   - Recommendation: Cap at 5 mentioned NPCs per cycle (~1K chars). If more than 5 are mentioned, prioritize by most recent mention in transcript. This keeps total context manageable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom |
| Config file | vitest.config.js |
| Quick run command | `npx vitest run tests/narrator/PromptBuilder.test.js tests/narrator/AIAssistant.test.js --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-06 | NPC profiles extracted from journal text at session start | unit | `npx vitest run tests/narrator/NPCProfileExtractor.test.js -x` | No -- Wave 0 |
| CTX-06 | Mentioned NPCs detected in transcript text | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "NPC detection" -x` | No -- Wave 0 |
| CTX-06 | NPC profiles injected into prompts when mentioned | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "NPC" -x` | No -- Wave 0 |
| CTX-07 | Next chapter lookahead included in AI context | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "lookahead" -x` | No -- Wave 0 |
| CTX-07 | getSiblingChapters().next content fetched for lookahead | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -t "sibling" -x` | Partial -- existing sibling tests |
| SUG-01 | Source field parsed from AI response | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "source" -x` | No -- Wave 0 |
| SUG-01 | Source field included in JSON schema request | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "source" -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/narrator/ tests/orchestration/SessionOrchestrator.test.js --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/narrator/NPCProfileExtractor.test.js` -- covers CTX-06 NPC extraction
- [ ] New test cases in `tests/narrator/PromptBuilder.test.js` -- covers NPC injection, lookahead, source schema
- [ ] New test cases in `tests/narrator/AIAssistant.test.js` -- covers source field parsing
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` -- covers NPC mention detection, live enrichment

## Sources

### Primary (HIGH confidence)
- Project codebase: `scripts/narrator/PromptBuilder.mjs` -- current prompt structure and setter pattern
- Project codebase: `scripts/narrator/AIAssistant.mjs` -- analyzeContext flow, response parsing, RAG integration
- Project codebase: `scripts/orchestration/SessionOrchestrator.mjs` -- _initializeJournalContext(), _runAIAnalysis() cycle
- Project codebase: `scripts/narrator/ChapterTracker.mjs` -- getSiblingChapters(), getCurrentChapterContentForAI()
- Project codebase: `scripts/ai/EntityExtractor.mjs` -- existing extraction patterns (reference, not reuse)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- locked architectural choices from user discussion

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing infrastructure
- Architecture: HIGH -- follows established patterns (setter injection, PromptBuilder ownership, service composition)
- Pitfalls: HIGH -- based on direct code analysis of existing integration points and token budget math

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no external dependency changes expected)
