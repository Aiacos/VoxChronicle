# Stack Research

**Domain:** Real-time AI DM Assistant — Foundry VTT + OpenAI
**Researched:** 2026-02-28
**Confidence:** MEDIUM-HIGH (existing codebase patterns verified; OpenAI API specifics verified via official docs; Foundry VTT journal API partially verified via official docs)

---

## Context

This is NOT a greenfield stack decision. VoxChronicle v3.2.7 exists with a fixed runtime environment:
- JavaScript ES6+ modules (.mjs only), no npm runtime deps in production
- Foundry VTT v13 API (ApplicationV2, Hooks, game.journal, game.settings)
- OpenAI APIs (gpt-4o-mini for chat, gpt-4o-transcribe for audio, gpt-image-1 for images)
- OpenAI File Search / vector store as RAG backend

Stack research here focuses on: **how to configure and use these existing technologies correctly** for reliable live AI DM assistance, not which technologies to adopt.

---

## Recommended Stack

### Core Technologies (All Pre-Existing)

| Technology | Version/Config | Purpose | Why This Configuration |
|------------|----------------|---------|------------------------|
| gpt-4o-mini | Current snapshot | DM suggestion generation, off-track detection, rules Q&A | 53 tokens/sec output, 0.44s TTFT via OpenAI direct. At ~$0.15/1M input tokens, a 3-hour session with 10-second polling costs roughly $0.80-1.20. Correct model for the latency budget. |
| gpt-4o-transcribe | Current | Audio transcription with speaker diarization | Already in use. No change needed. |
| OpenAI File Search (Responses API) | v1 (2025) | RAG backend for adventure journal retrieval | Managed hosted retrieval — no custom embedding pipeline, no self-hosted vector DB, zero ops overhead. Purpose-built for document RAG on OpenAI models. |
| Foundry VTT v13 | v13 (13.347+) | Runtime environment, Hooks, Journal API | Fixed constraint. JournalEntryPage.text.content is the extraction target for RAG indexing. |
| Vitest | 2.0.0 | Test runner for all narrator service changes | Already in use. Must stay green throughout. |

### RAG Configuration

Use OpenAI's built-in chunking strategy, not custom chunking in JournalParser.

| Parameter | Value | Why |
|-----------|-------|-----|
| `chunking_strategy.type` | `static` | Predictable behavior for narrative content |
| `max_chunk_size_tokens` | `1200` | Narrative content needs larger chunks than code to preserve scene context. 800 (default) cuts mid-scene; 1200 preserves scene boundaries. RPGX AI Librarian (a production Foundry RAG module) uses 1200 characters for the same reason. |
| `chunk_overlap_tokens` | `300` | 25% overlap maintains continuity at boundaries without doubling storage. Must not exceed chunk_size / 2 per API constraint. |
| `max_num_results` | `5` | 5 chunks is the empirically validated starting point from OpenAI cookbook evaluations. Returns focused context without bloating the prompt. |
| Vector store reuse | Persistent ID in game.settings | Re-upload only when journals change. Avoid re-indexing every session — it costs money and adds latency. |

### Prompt Engineering Stack

Use the existing PromptBuilder architecture with these specific enhancements:

| Component | Configuration | Why |
|-----------|---------------|-----|
| System prompt | ~350-500 tokens max | Longer system prompts add latency without proportional benefit. The existing prompt is well-structured; focus on reducing redundancy not adding more rules. |
| Context injection | XML-tagged sections | `<adventure_context>`, `<current_chapter>`, `<recent_session>` tags. Research shows tagged sections measurably improve retrieval accuracy over unlabeled blocks. |
| Conversation history | Last 5 turns + rolling summary | Sliding window of 5 turns preserves recent context. After every 8-10 turns, summarize earlier history into a single compressed block injected into the system context. This is the "Summarized Context + Sliding Window" pattern validated across multiple production systems in 2025. |
| JSON response format | `response_format: {type: "json_object"}` | Use `json_object` mode (not `json_schema`) because gpt-4o-mini supports it and it does not break streaming. The `json_schema` strict mode has model-snapshot restrictions and does not guarantee streaming partial JSON is valid mid-stream. |
| max_tokens | 400-600 per suggestion request | Cutting output tokens cuts latency ~proportionally. A DM suggestion does not need more than 400 tokens. Capping prevents runaway responses that block the next poll cycle. |

### Session Memory Architecture

| Component | Approach | Why |
|-----------|----------|-----|
| Short-term memory | Last 5 conversation turns in `_conversationHistory` | Already implemented. Cap is appropriate — more than 5 turns degrades response quality and adds tokens without value. |
| Session summary | Rolling summary updated every 8 turns | After 8 turns, call gpt-4o-mini with the current conversation to produce a 1-paragraph summary. Store in AIAssistant._sessionSummary. Inject into system prompt at position 2 (after base system prompt, before RAG context). |
| Chapter position | `ChapterTracker` current chapter injected into every prompt | Already implemented. Critical for suggestion quality — the model must know exactly where in the adventure the party is. |
| Silence-triggered suggestions | SilenceMonitor (30s threshold) | Already implemented. Do not reduce below 20s — under 20s the trigger fires during natural pauses in DM narration. |

### Response Latency Budget

For a real-time DM assistant, suggestions must feel fast. Target: **3-5 seconds from transcript submission to suggestion visible in UI**.

| Operation | Expected Time | How to Achieve |
|-----------|---------------|----------------|
| Transcription (10s chunk) | 2-4s | Already streaming. No change. |
| RAG retrieval (file_search) | 0.5-1.5s | Run in parallel with transcript analysis, not sequentially. Cache last result for 60s if transcript hasn't changed significantly. |
| gpt-4o-mini suggestion (400 token cap) | 1-2s | Use streaming SSE to show first tokens immediately. Start rendering in UI before full response. |
| Total perceived latency | 2-4s | With streaming, user sees first suggestion tokens at ~1.5s. |

### Foundry VTT Journal API Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| Journal text extraction | `journal.pages.contents.filter(p => p.type === 'text').map(p => p.text.content)` | JournalEntryPage.text.content is the correct v13 property for text page HTML content. Strip HTML before indexing with a simple regex or DomParser. |
| Active scene detection | `game.scenes.active?.name` + `game.scenes.active?.flags` | Scene name often matches journal chapter. Use flags to store explicit chapter mappings as a fallback. |
| Hook-based journal updates | `Hooks.on('updateJournalEntryPage', handler)` | Trigger RAG re-indexing when journal content changes. Debounce by 10s to avoid thrashing during bulk edits. |
| Compendium extraction | `game.packs.get(packKey).getDocuments()` | For D&D 5e SRD rules. Already implemented in CompendiumParser. |

---

## Prompt Engineering Patterns

### Pattern 1: Journal-First System Prompt

The existing PromptBuilder.buildSystemPrompt() is well-designed. The key principle it correctly implements: the system prompt declares the model is a **retrieval engine, not a creative writer**. This is the right framing. The model should surface what's in the adventure, not invent.

**Keep and strengthen:**
- "USE ONLY PROVIDED MATERIAL" rule (first, with `<rule>` tag wrapping)
- "ALWAYS CITE SOURCES" with journal page reference format
- "ADMIT WHEN YOU DON'T KNOW" as explicit fallback

**Anti-pattern already avoided:**
The current prompt does NOT say "you are a creative DM" or "be imaginative." This is correct. Creative freedom leads to hallucinated NPCs and contradictions mid-session.

### Pattern 2: Context Block Structure

Structure the message array as:

```
[system]: base role + rules + sensitivity config (~400 tokens)
[system]: <current_chapter>Chapter 2: The Sunken Temple...</current_chapter> (~200 tokens)
[system]: <session_summary>Earlier this session: party explored entrance hall, fought 2 guards...</session_summary> (~150 tokens)
[system]: <adventure_context>[RAG-retrieved chunks for current query]</adventure_context> (~1500 tokens)
[user (turn -4)]: [transcript segment]
[assistant (turn -4)]: [previous suggestions]
... (last 5 turns)
[user]: Analyze this transcription: "..."
```

Total context budget: ~2800-3500 tokens input. Well within gpt-4o-mini's 128k context window and keeps costs low.

**Why this order matters:**
- System messages are read top-to-bottom in weight
- Chapter context second (most specific, highest weight)
- Session summary third (session-scoped memory)
- RAG results fourth (query-specific retrieval)
- Conversation history fifth (recent turns)
- Current analysis request last

### Pattern 3: Structured Response Schema

Request this exact JSON shape in every analysis call (already close to existing implementation):

```json
{
  "suggestions": [
    {
      "type": "narration|dialogue|action|reference",
      "content": "...",
      "source": "[Chapter 2: The Sunken Temple, p.3]",
      "confidence": 0.0-1.0
    }
  ],
  "offTrackStatus": {
    "isOffTrack": false,
    "severity": 0.0,
    "reason": "..."
  },
  "summary": "One sentence: current situation"
}
```

**Key addition:** `"source"` field in each suggestion is **mandatory**. The system prompt already requires citations — enforce this structurally so the UI can render "[Chapter 2]" badges on suggestion cards. Without structured source attribution, DMs cannot quickly judge suggestion reliability.

### Pattern 4: Silence-Triggered Suggestion Differentiation

When triggered by silence (SilenceMonitor), send a **different user message** than the normal analysis message:

```
// Normal trigger (new transcript chunk):
"Analyze this session transcription: '...'"

// Silence trigger (no new transcript):
"The session has been quiet for 30 seconds. Based on where the party is in the adventure
and what happened just before the pause, suggest 1-2 options the DM can use to
re-engage players. Draw only from the current chapter material."
```

This avoids the model treating silence as "session over" and producing irrelevant suggestions.

---

## Alternatives Considered

| Recommended | Alternative | Why Not Alternative |
|-------------|-------------|---------------------|
| gpt-4o-mini for suggestions | gpt-4o for suggestions | gpt-4o costs 10x more per token with minimal quality difference for structured DM suggestions. Save gpt-4o for transcription where quality matters. |
| OpenAI File Search (hosted RAG) | RAGFlow (self-hosted) | RAGFlow requires user to run a separate server — high friction for a Foundry VTT module. OpenAI File Search is zero-ops and already the default RAG provider. Keep self-hosted as the fallback option it already is. |
| Sliding window + rolling summary | Full conversation history | Full history hits token limits after 30-40 minutes of gameplay. Sliding window with summarization is the validated pattern for multi-turn sessions. |
| json_object response_format | json_schema strict mode | json_schema strict requires specific model snapshots and breaks with newer model versions. json_object is universally supported across all gpt-4o-mini versions. |
| max_tokens 400-600 | Unlimited output | Uncapped output can produce 2000+ token responses, adding 3-4 seconds of latency per request. DM suggestions do not need to be essays. |
| Static chunking (1200/300 tokens) | Semantic chunking | Semantic chunking requires an additional LLM call to determine chunk boundaries — this doubles the cost of indexing. For adventure content that is already structured by headings, static chunking at 1200 tokens plus overlap is sufficient and faster. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `response_format: json_schema` with strict mode | Model-snapshot specific; gpt-4.1 family returns "Unsupported model" errors. Breaks when OpenAI updates models. | `response_format: {type: "json_object"}` with JSON structure described in the prompt |
| Streaming for suggestion display | Streaming partial JSON is not parseable until complete — the UI cannot render a partial suggestion card. | Buffer the full response, then render. Only use streaming for long-form text (narration paragraphs). |
| Re-indexing RAG on every session start | Costs ~$0.05-0.20 per journal, accumulates quickly. Vector store persists between sessions. | Check if vector store ID exists in settings and skip re-indexing unless journal content has changed (use `updateJournalEntryPage` hook). |
| Conversation history > 10 turns | Research shows LLM reasoning quality degrades around 3,000 tokens of prior conversation. More history = lower quality, higher cost, slower responses. | Keep last 5 turns verbatim + rolling summary of prior turns. |
| Asking for multiple analysis types in separate sequential calls | Each call adds 1-2s latency. A 3-hour session with 10s poll cycles = 1080 analysis calls. Sequential doubles the API round-trips. | Combine off-track detection + suggestion generation into a single call using the combined JSON schema (as the existing buildAnalysisMessages() already does). |
| Polling for transcription changes faster than 10 seconds | OpenAI transcription API charges per audio minute. At 6s polling = 10 transcription calls per minute = 10x cost vs 60s polling. 10s is the current value and is correct for the latency budget. | Keep the existing 10s polling interval. |
| CSS class additions without `.vox-chronicle` prefix | Risk of class collision with Foundry core or other modules. 214 un-namespaced classes are existing tech debt that must be fixed. | All new classes: `.vox-chronicle-[component]__[element]--[modifier]` BEM format. |

---

## Stack Patterns by Context

**For suggestion generation (primary path):**
- gpt-4o-mini + json_object format + max_tokens 500 + RAG context from file_search
- Single combined call for suggestions + off-track detection
- Inject chapter context + session summary into system messages

**For rules Q&A (RulesReference):**
- gpt-4o-mini + compendium text as context (already extracted by CompendiumParser)
- Separate call from suggestion generation — rules questions are user-triggered, not polling-triggered
- Citation format: "[Compendium: Monsters > Goblin, PHB p.XXX]"

**For journal re-indexing:**
- Triggered by user action or `updateJournalEntryPage` hook (debounced 10s)
- Upload extracted plain text (HTML-stripped) to OpenAI vector store
- Use static chunking: 1200 tokens / 300 overlap
- Store vector_store_id in game.settings (world scope, shared for all DMs)

**For session memory during long sessions (>45 minutes):**
- After 8 conversation turns, call gpt-4o-mini to summarize the `_conversationHistory` into 1 paragraph
- Store in `_sessionSummary` string on AIAssistant
- Inject as `<session_summary>` block in system messages from that point forward
- Trim `_conversationHistory` to last 5 turns

---

## Version Compatibility Notes

| Package/API | Version | Compatibility Notes |
|-------------|---------|---------------------|
| gpt-4o-mini | gpt-4o-mini (latest) | json_object response_format supported. json_schema strict NOT supported on all 2025 snapshots. Use json_object for safety. |
| OpenAI File Search | Responses API v1 | `max_chunk_size_tokens` configurable 100-4096. Default is 800/400. Set to 1200/300 for adventure content. |
| Foundry VTT | v13 (13.347+) | `JournalEntryPage.text.content` for HTML content. `page.type === 'text'` filter. `game.journal` collection. ApplicationV2 for UI. |
| Vitest | 2.0.0 | Compatible with jsdom 24.0.0. No changes needed. |

---

## Sources

- OpenAI Latency Optimization Guide — `https://developers.openai.com/api/docs/guides/latency-optimization` — streaming, max_tokens, output reduction strategies (HIGH confidence, official docs)
- OpenAI File Search Cookbook — `https://developers.openai.com/cookbook/examples/file_search_responses` — max_num_results=5, vector store configuration (HIGH confidence, official docs)
- OpenAI Vector Store API Reference — `https://developers.openai.com/api/reference/resources/vector_stores/` — default chunking 800/400 tokens, configurable 100-4096 (HIGH confidence, official API reference)
- OpenAI Structured Outputs Guide — `https://platform.openai.com/docs/guides/structured-outputs` — json_schema model compatibility limitations (HIGH confidence, official docs)
- RPGX AI Librarian (Foundry VTT module, prod) — `https://foundryvtt.com/packages/rpgx-ai-librarian` — 1200 char chunks, 200 char overlap for Foundry journal RAG (MEDIUM confidence, production module behavior)
- Weaviate RAG Chunking Guide — `https://weaviate.io/blog/chunking-strategies-for-rag` — semantic vs static chunking for narrative content (MEDIUM confidence, verified by multiple sources)
- Prompt Architecture for AI DM (Austin Amento, DEV Community) — `https://dev.to/austin_amento_860aebb9f55/prompt-architecture-for-a-reliable-ai-dungeon-master-d99` — state-as-source-of-truth pattern, structured response sections (MEDIUM confidence, single practitioner source)
- GPT-4o-mini Performance — `https://artificialanalysis.ai/models/gpt-4o-mini` — 53 tok/s output, 0.44s TTFT (MEDIUM confidence, third-party benchmark)
- Context Engineering (OpenAI Cookbook) — `https://cookbook.openai.com/examples/agents_sdk/session_memory` — sliding window + summarization pattern (HIGH confidence, official OpenAI docs)
- LLM Chat History Summarization — `https://mem0.ai/blog/llm-chat-history-summarization-guide-2025` — update summary every 8-10 turns, keep last 5 verbatim (MEDIUM confidence, validated by multiple independent sources agreeing on same parameters)
- Foundry VTT v13 JournalEntryPage API — `https://foundryvtt.com/api/v13/classes/foundry.documents.JournalEntryPage.html` — text.content property (MEDIUM confidence, API docs were incomplete for some protected methods)

---

*Stack research for: VoxChronicle real-time AI DM assistant*
*Researched: 2026-02-28*
