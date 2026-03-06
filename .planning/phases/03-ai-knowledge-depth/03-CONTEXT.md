# Phase 3: AI Knowledge Depth - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface NPC personalities, anticipate upcoming scenes, and ground all AI suggestions in specific adventure journal text. The AI should act like a DM who has read the adventure — knowing NPC names, motivations, and what's coming next. This phase builds on the journal context pipeline (Phase 2) that already provides chapter-scoped context and RAG retrieval.

Requirements: CTX-06, CTX-07, SUG-01

</domain>

<decisions>
## Implementation Decisions

### NPC Awareness Strategy
- Hybrid approach: pre-extract NPC roster at session start + live enrichment from transcription
- Pre-extract ALL NPCs from the entire journal at session start (not just current chapter)
- NPC profiles include: name, personality, motivation, chapter location, role
- Extraction uses an LLM pass over journal content at session start (~2-5K tokens)
- NPCs from other chapters still also discoverable via RAG

### NPC Triggering
- Auto-surface NPC profiles when a player mentions an NPC name in the transcription
- Transcript contains "Garrick" → next suggestion includes Garrick's personality/motivation from the journal
- No explicit DM action required — the AI proactively uses NPC context

### Live NPC Enrichment
- When players interact meaningfully with an NPC (deception, combat, alliance), append a one-line note to that NPC's session profile
- Lightweight accumulation of session-specific history
- Journal-extracted profiles are the base; live interactions are appended annotations

### Foreshadowing Mechanics
- Passive hints: AI always sees next chapter summary but doesn't explicitly mention foreshadowing unless it naturally fits the suggestion
- No "What's next?" button or explicit foreshadowing feature — just better-informed suggestions
- Next chapter lookahead: first 1000 chars of the next chapter (~250 tokens) included in AI context
- Uses `ChapterTracker.getSiblingChapters().next` to identify the next chapter

### Source Citation Format
- Both structured JSON field AND inline text mention per suggestion
- Each suggestion gets a `source: { chapter, page, journalName }` field in the response JSON
- AI also mentions the source naturally in the suggestion text (e.g., "[Source: Chapter 3 > Garrick's Bargain]")
- Granularity: chapter + page name (e.g., "Chapter 3: The Thieves Guild > Garrick's Bargain")
- UI can render the structured field as a clickable badge; inline text is a fallback

### Suggestion Grounding Depth
- Rich detail with names and context: "Garrick fidgets — his secret deal with the Thieves Guild weighs on him. Consider having him drop a hint about the missing shipment."
- Suggestions should use NPC profiles + chapter detail for immersive, DM-ready content
- Suggestions CAN reference content the players haven't encountered yet, framed as DM-only hints
- Future content is labeled as foreshadowing seeds the DM can choose to use or ignore
- Only the DM sees the panel, so spoiler risk is acceptable

### Claude's Discretion
- Exact NPC extraction prompt design and JSON schema for profiles
- How NPC profiles are stored in memory (Map, array, or other structure)
- How name-mention detection works (exact match, fuzzy, or LLM-based)
- How live enrichment notes are formatted and when they trigger
- Token budget allocation between NPC profiles, chapter context, and foreshadowing summary
- How the structured source field integrates with PromptBuilder's existing response schema

</decisions>

<specifics>
## Specific Ideas

- NPC profiles should feel like a DM's prep notes: "Garrick — nervous merchant, secretly working with the Thieves Guild. Motivation: protect his family from guild threats. Personality: jovial facade hiding deep anxiety."
- Foreshadowing should be subtle — "The party notices the merchant's hands trembling as he wraps the package" rather than "In the next chapter, Garrick betrays the party"
- The source badge in the UI should be small and non-intrusive, like a footnote — not competing with the suggestion content

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PromptBuilder.buildNPCDialogueMessages(npcName, npcContext, transcription)`: Already exists for NPC-specific dialogue generation — can be adapted for profile injection
- `PromptBuilder.buildSystemPrompt()`: Already includes anti-hallucination rules and "ALWAYS CITE SOURCES" instruction
- `EntityExtractor.extractEntities()`: Extracts NPCs from transcription text (name, description, isNPC, role) — could be adapted for journal extraction
- `EntityExtractor.extractRelationships()`: Extracts NPC relationships with confidence scoring
- `ChapterTracker.getSiblingChapters()`: Returns `{previous, next}` — ready for next-chapter lookahead
- `ChapterTracker.getCurrentChapterContentForAI(8000)`: Already provides formatted chapter context
- `AIAssistant.analyzeContext()`: Returns structured JSON with suggestions, offTrackStatus, relevantPages

### Established Patterns
- PromptBuilder owns all prompt construction — NPC context and foreshadowing should flow through it
- AIAssistant.setChapterContext() pattern — could add setNPCContext() or setEntityContext() similarly
- Session-start initialization in SessionOrchestrator._initializeJournalContext() — NPC extraction fits here
- Structured JSON response from OpenAI with typed fields — source citation field extends this pattern

### Integration Points
- `SessionOrchestrator._runAIAnalysis()`: Where NPC profiles and next-chapter summary get injected per cycle
- `SessionOrchestrator._initializeJournalContext()`: Where NPC pre-extraction runs at session start
- `PromptBuilder.buildAnalysisMessages()`: Where NPC context and foreshadowing get added to the prompt
- `AIAssistant.analyzeContext()` response parsing: Where structured source field gets extracted
- `_liveTranscript` tail (last 15000 chars): Where NPC name mentions are detected

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ai-knowledge-depth*
*Context gathered: 2026-03-06*
