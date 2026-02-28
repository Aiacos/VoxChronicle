# Feature Research

**Domain:** AI DM Assistant for Live D&D 5e Sessions (Foundry VTT module)
**Researched:** 2026-02-28
**Confidence:** MEDIUM — competitive landscape researched across Foundry VTT modules, academic research (CALYPSO paper), practitioner implementations, and community feedback. Most claims verified across multiple sources. Specific latency numbers from OpenAI official docs (HIGH). Competitor feature claims from product pages + community descriptions (MEDIUM).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or the tool is useless during actual play.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Journal-grounded suggestions | DM gave you the adventure text — every suggestion must reference it. Generic D&D suggestions are worthless when the party is in a specific room of Curse of Strahd. | HIGH | This is the #1 differentiator over bare ChatGPT. VoxChronicle already has JournalParser + RAG; the challenge is making the connection tight enough that suggestions cite specific journal content, not generic lore. |
| D&D 5e rules lookup with SRD accuracy | DMs pause mid-session for rules disputes. An AI that hallucinates rules is worse than a rulebook. | MEDIUM | Must index actual D&D 5e SRD compendium text, not rely on model training. SRD v5.2.1 updated December 2025 to 2024 rules wording. VoxChronicle has RulesReference + CompendiumParser — these need to be reliable and citation-producing. |
| Session-persistent context (same-session memory) | If the party killed an NPC 30 minutes ago, the AI must know this when suggesting dialogue for that NPC's ally. | HIGH | The rolling transcript + chapter tracking address this, but must work for a full 3-4 hour session without losing context. Hierarchical summaries reduce hallucination by ~41% per research findings. |
| Sub-5-second response time | Mid-session suggestions must arrive fast enough to be usable. A 30-second wait kills the table momentum. | MEDIUM | GPT-4o streaming text responses average 2-4s TTFT. With streaming display, first tokens appear in ~320ms. Use streaming for all suggestion responses. Silence-triggered suggestions must be queued to not block UI. |
| Non-intrusive UI | The DM cannot be heads-down in a UI during a session. Suggestions must surface without demanding attention. | MEDIUM | Existing MainPanel floating panel is the right approach. Suggestions should be glanceable — short, scannable, not paragraphs. Anti-pattern: modal dialogs, required confirmation steps, anything that takes >1 second of focus away from the table. |
| Current scene / chapter awareness | Suggestions must know where the party is in the adventure. A narration prompt for a dungeon room is useless if the party is in a tavern. | HIGH | ChapterTracker exists but its reliability in real gameplay is unvalidated. Must track active Foundry scene AND active journal page, not just scene name. |
| Silence detection as a trigger | The DM pauses = best moment to surface a suggestion. Not too aggressive (every pause) — calibrated to 20-30 second gaps. | LOW | SilenceDetector exists. The question is calibration: too sensitive = annoying noise; too conservative = never fires. 20-30 second threshold is the community sweet spot per DM feedback. |
| Graceful failure / degraded mode | If OpenAI API is down or slow, live mode must not crash or leave the DM with a broken UI. | MEDIUM | Circuit breaker exists in OpenAIClient. But the DM experience when AI is unavailable needs explicit design — not just an error toast, but a clear "AI unavailable, continuing session" state. |
| On-demand query (manual ask) | DM must be able to type a question and get a direct answer — not just wait for silence-triggered suggestions. | LOW | This is a text input field in the panel. Every comparable tool (Archivist, Phils AI Assistant, RPGX AI Librarian) has this. VoxChronicle's MainPanel likely needs a query input tab if not already present. |

---

### Differentiators (Competitive Advantage)

Features that set VoxChronicle apart from generic ChatGPT use or shallow competitors. These align with the project's core value proposition.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Transcript-driven context injection | No other tool combines real-time transcription + journal RAG + suggestion generation in one loop. The AI knows what was said in the session AND what the adventure says should happen next. | HIGH | This is VoxChronicle's moat. Archivist does transcription + recall but lacks real-time suggestion generation. RPGX AI Librarian does RAG but no transcription. VoxChronicle does both. The integration quality is the differentiator. |
| Scene type detection with suggestion calibration | Combat suggestions differ from social encounter suggestions. Detecting "we're in a fight" and switching to combat-optimized prompts (monster tactics, spell suggestions, environmental hazards) is a step above generic narration prompts. | MEDIUM | SceneDetector exists. The key is: does switching scene type actually change suggestion quality? Each scene type needs distinct prompt templates. Research from CALYPSO confirms DMs want context-specific content, not generic. |
| Adventure anticipation (foreshadowing next scene) | Knowing what's coming in the adventure text lets the AI suggest seeds to plant NOW that pay off LATER. No competitor does this. | HIGH | Requires RAG to retrieve not just the current scene but upcoming scenes. Must be careful about over-revealing to the DM things they haven't read yet (spoiler control). |
| NPC personality recall from journal | When the party talks to Strahd, the AI should surface Strahd's motivations, speech patterns, and secrets from the adventure text — not generic vampire lord tropes. | HIGH | This is the difference between "Strahd says something menacing" and "Strahd references his obsession with Tatyana and the players feel the weight of his history." Requires structured NPC extraction from journal text. |
| Post-session chronicle publishing | No live DM assistant tool also publishes to Kanka. The combination of live assistance + automatic chronicle creation is unique. | HIGH | Chronicle mode is out of scope for this milestone as primary focus, but must not break. |
| Off-track detection with recovery suggestions | When players go sideways, the AI detects it (session content diverges from journal) and offers both "here's what the adventure intended" and "here's how to improvise gracefully" options. | HIGH | No competitor explicitly does this. Requires comparing rolling transcript against expected adventure progression. Very high value when players inevitably go off-script. |
| Speaker-aware context | Knowing which player is speaking lets the AI weight suggestions — if the rogue has been quiet, maybe surface a "secret door / sneaky opportunity" prompt. | MEDIUM | SpeakerLabeling exists. SessionAnalytics tracks participation. Connecting participation data to suggestion selection is the differentiating step. |
| D&D 5e SRD citation in rules answers | When answering "how does grapple work?", citing the specific SRD page/section is more trustworthy than a prose answer. | LOW | RulesReference + CompendiumParser should produce citations. The key is whether citations surface in the UI output. Research confirms DMs trust cited answers over uncited prose. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but actively hurt DM experience or create more problems than they solve.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Replace the DM (full autonomous narration) | "AI can describe everything" | Destroys DM agency; AI consistently violates narrative consistency and established lore; players hate losing the human at the table; AI says "yes" to everything (no stakes). Community research is unanimous: AI as DM replacement fails. | Frame as "co-pilot not pilot" — AI surfaces options, DM delivers. |
| Continuous auto-suggestion (every few seconds) | "Maximize AI utility" | Causes suggestion fatigue. DM starts ignoring all suggestions because too many arrive. Analogous to notification overload. Table rhythm gets disrupted. | Silence-triggered (20-30s) + on-demand only. Let the DM pull, not have AI push constantly. |
| Full session transcript display in UI | "Show me everything that was transcribed" | Clutters the UI during live play; DM has no time to read it; real-time transcript is better used as AI input, not DM display. | Show only the last 2-3 spoken exchanges as context indicator. Full transcript available post-session. |
| Player-facing AI interface during session | "Let players also ask the AI questions" | Breaks immersion; players start querying lore and spoiling themselves; diffuses the DM-player dynamic; creates parallel AI conversations at the table. Archivist's permission controls exist for exactly this reason. | DM-only mode during live session. Player access for post-session recaps only. |
| Automatic dice rolling / mechanical arbitration | "AI can adjudicate rules on its own" | AI hallucinate mechanical outcomes; rolling dice is a sacred table ritual; DM agency over rulings is fundamental. Research confirms this breaks immersion. | AI answers "what does the rule say?" not "what happens now?" DM makes the call. |
| Real-time NPC voice synthesis (TTS) | "AI voices the NPCs" | High latency (~1-3s for TTS); interrupts DM mid-sentence; DM's own voice characterization is a core skill; adds brittleness (TTS API failures during session). | Suggest dialogue text the DM can read aloud in their own voice. |
| Image generation during live session | "Show players a portrait mid-session" | gpt-image-1 takes 10-30 seconds; kills table momentum; post-session image generation is the right workflow. | Queue images for post-session chronicle. Pre-generate key NPC images before the session starts. |
| Session state persistence across browser refresh | "Don't lose context if I refresh" | Complex to implement correctly; risks stale state causing incorrect suggestions; Foundry's own state model makes this fraught. | Design for single-session scope. At session start, rebuild context from recent journal + previous session summary. |
| Multi-system support (PF2e, etc.) | "Support other games" | PF2e has completely different mechanics, different SRD, different compendium structure; maintaining quality across systems requires 2x-3x the work for each addition. | D&D 5e only. Do one system excellently. |
| AI-generated maps and tokens | "Generate tokens for random NPCs" | Off-topic from the DM assistant core; adds image generation cost ($0.02-0.04/image) unpredictably during session; Foundry already has good token art workflows. | Keep image generation in chronicle mode workflow, not live mode. |

---

## Feature Dependencies

```
[D&D 5e SRD Compendium Indexing]
    └──required by──> [Rules Lookup with Citations]
                          └──required by──> [Rules Q&A (on-demand)]

[Journal Parsing + RAG Indexing]
    └──required by──> [Journal-Grounded Suggestions]
                          └──required by──> [NPC Personality Recall]
                          └──required by──> [Adventure Anticipation]
                          └──required by──> [Off-Track Detection]

[Rolling Session Transcript]
    └──required by──> [Session-Persistent Context]
                          └──required by──> [Speaker-Aware Suggestions]

[Scene Type Detection]
    └──enhances──> [Journal-Grounded Suggestions]
    └──enhances──> [Session-Persistent Context]

[Silence Detection]
    └──triggers──> [Journal-Grounded Suggestions]

[Chapter/Scene Tracking]
    └──required by──> [Adventure Anticipation]
    └──enhances──> [Journal-Grounded Suggestions]

[Speaker Labeling]
    └──enhances──> [Session-Persistent Context]
    └──enables──> [Speaker-Aware Suggestions]

[On-Demand Query]
    └──independent of── (works without other features active)
```

### Dependency Notes

- **Rules Lookup requires Compendium Indexing:** Rules Q&A without actual SRD text indexed = AI hallucination risk. The compendium must be parsed and indexed before rules answers are trustworthy.
- **Journal-Grounded Suggestions requires RAG Indexing:** Without the adventure text indexed, suggestions revert to generic D&D content (same as bare ChatGPT). This is the zero-to-one step.
- **Adventure Anticipation requires Chapter Tracking:** To know what's coming next, the system must know where the party currently is. Chapter/scene position is the anchor.
- **Off-Track Detection conflicts with continuous suggestions:** Don't fire suggestions AND off-track alerts simultaneously — too much noise. Prioritize one based on context.
- **On-Demand Query is the fallback:** When automatic triggers fail or the DM needs specific help, they can always type a question. This is the safety net for all other features.

---

## MVP Definition

### Launch With (v1 — Milestone focus)

The minimum that makes live mode genuinely useful during an actual 3-4 hour D&D session.

- [ ] **Journal-grounded suggestions that cite specific adventure content** — Without this, VoxChronicle is just another generic AI chat. The RAG pipeline must produce suggestions that reference the actual adventure text, not generic D&D lore.
- [ ] **D&D 5e rules lookup with SRD-grounded answers** — DMs stop sessions for rules disputes. An AI that gives wrong rules is worse than no AI. Must index actual compendium content and cite it.
- [ ] **Session-persistent context for a full 3-4 hour session** — If the AI forgets what happened 2 hours ago, it's useless for long sessions. Requires context management (hierarchical summaries or chunking).
- [ ] **Silence-triggered suggestions (20-30s threshold)** — The AI should surface help when the DM is thinking, not when they're mid-sentence. This is the core UX pattern.
- [ ] **On-demand text query** — Manual "ask the AI" fallback for anything the silence trigger misses. Table stakes for any AI tool.
- [ ] **Sub-5-second streaming responses** — Suggestions must arrive fast enough to act on. Streaming display with first tokens in under 1 second.
- [ ] **Graceful degradation when AI is unavailable** — Session continues even if OpenAI is slow or down. DM gets a clear status, not a broken UI.

### Add After Validation (v1.x)

Features to add once core suggestions are working reliably.

- [ ] **NPC personality surfacing** — Trigger: DM has used the tool for 2-3 sessions and journal-grounded suggestions are reliable. Then focus on NPC-specific prompts.
- [ ] **Scene type calibration (combat vs social vs exploration)** — Trigger: Scene detection is working accurately. Then tailor prompt templates per scene type.
- [ ] **Off-track detection with recovery suggestions** — Trigger: Baseline suggestions working. Off-track detection is the advanced capability that requires comparing expected vs actual session progression.
- [ ] **Speaker-aware suggestion weighting** — Trigger: Speaker labeling is stable. Then use participation data to weight suggestion content.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Adventure anticipation / foreshadowing prompts** — Requires reliable chapter tracking AND careful spoiler control. Significant prompt engineering. Defer to v2.
- [ ] **Cross-session memory (between sessions)** — Storing and retrieving what happened in previous sessions. Powerful but significant architecture work. Defer.
- [ ] **Multi-campaign RAG separation** — Needed when DMs run multiple campaigns. Defer until single-campaign is solid.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Journal-grounded suggestions (RAG) | HIGH | HIGH | P1 |
| Session-persistent context | HIGH | MEDIUM | P1 |
| D&D 5e SRD rules lookup | HIGH | MEDIUM | P1 |
| Silence-triggered suggestions | HIGH | LOW | P1 |
| On-demand text query | HIGH | LOW | P1 |
| Sub-5-second streaming responses | HIGH | LOW | P1 |
| Graceful degradation | MEDIUM | MEDIUM | P1 |
| Scene type detection + calibration | MEDIUM | MEDIUM | P2 |
| NPC personality recall | HIGH | HIGH | P2 |
| SRD citation display in UI | MEDIUM | LOW | P2 |
| Off-track detection | HIGH | HIGH | P2 |
| Speaker-aware weighting | LOW | MEDIUM | P3 |
| Adventure anticipation | HIGH | HIGH | P3 |
| Cross-session memory | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for live mode to be genuinely useful (this milestone)
- P2: Should have, add when P1 is stable and validated
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | RPGX AI Assistant + Librarian | Archivist | Foundry Familiar | VoxChronicle Approach |
|---------|-------------------------------|-----------|------------------|----------------------|
| Journal / lore grounding | RAG via separate Librarian module (premium) | Yes, but external tool | Yes (early alpha, limited) | RAG built-in via OpenAI File Search or RAGFlow — no separate purchase |
| Real-time transcription | None | Yes — audio capture, then summary | None | Yes — continuous GPT-4o transcription with diarization |
| During-session suggestions | Yes — manual query in chat | Manual query via sidebar | Manual query (alpha) | Yes — silence-triggered + on-demand |
| D&D 5e rules lookup | Generic LLM (no SRD grounding) | No | No | SRD compendium indexed via RAG — citations possible |
| Scene detection | None | None | None | SceneDetector (combat/social/exploration/rest) |
| Session analytics | None | None | None | SessionAnalytics — speaker participation, timeline |
| Post-session chronicle | None | Session recaps | None | Full workflow: transcription → entity extraction → Kanka publishing |
| Kanka integration | None | No | No | Full CRUD via KankaService |
| Privacy / local AI | Yes — Ollama local | Cloud only | Yes — Ollama local | Cloud (OpenAI) by default; LocalWhisperService for transcription |
| Foundry VTT integration | Deep (Foundry chat, actors, items) | Sync module | Native | Native (v13 API, scene controls, ApplicationV2) |
| System agnostic | Yes | Yes | Yes | D&D 5e focus (SRD, vocabulary) |

**Key takeaway:** VoxChronicle is the only tool combining real-time transcription + journal RAG + session analytics + post-session chronicle publishing. The competitive gap is in execution quality — none of these features matter if they don't work reliably during a live session.

---

## Sources

- [CALYPSO: LLMs as Dungeon Masters' Assistants (AAAI AIIDE 2023)](https://arxiv.org/abs/2308.07540) — Academic research on what makes AI DM assistants effective. Key finding: context-specific content + preserving DM agency. HIGH confidence.
- [RPGX AI Assistant — Foundry VTT Package](https://foundryvtt.com/packages/rpgx-ai-assistant) — Competitor feature set. MEDIUM confidence (official listing).
- [RPGX AI Librarian — Foundry VTT Package](https://foundryvtt.com/packages/rpgx-ai-librarian) — Companion RAG module feature set. MEDIUM confidence.
- [Archivist AI DM Assistant](https://www.myarchivist.ai/ai-dungeon-master) — Primary non-Foundry competitor combining transcription + campaign memory. MEDIUM confidence.
- [Archivist Foundry VTT Integration](https://www.myarchivist.ai/ai-dungeon-master/foundry-vtt) — Competitor Foundry integration details. MEDIUM confidence.
- [Foundry Familiar — Foundry VTT Package](https://foundryvtt.com/packages/foundry-familiar) — Early-alpha competitor. LOW confidence (self-described as "not ready for games").
- [Intelligent GM Assistant — Foundry VTT Package](https://foundryvtt.com/packages/intelligent-gm-assistant) — Paywalled, minimal public detail. LOW confidence.
- [Prompt Architecture for a Reliable AI Dungeon Master — DEV Community](https://dev.to/austin_amento_860aebb9f55/prompt-architecture-for-a-reliable-ai-dungeon-master-d99) — Practitioner experience with layered prompts, rules enforcement. MEDIUM confidence.
- [AI DM Emulator for D&D 5e — Oracle RPG](https://oracle-rpg.com/2025/05/ai-dm-emulator/) — Practitioner build with memory management + rules enforcement lessons. MEDIUM confidence.
- [RPG AI Tools Every DM Needs (LitRPG Reads, 2025)](https://litrpgreads.com/blog/rpg/rpg-ai-tools-every-dm-needs-for-running-better-campaigns-2025-update) — Ecosystem survey with table stakes identification. MEDIUM confidence.
- [GPT-4o Response Latency — OpenAI Official](https://openai.com/index/hello-gpt-4o/) — 232ms minimum, 320ms average audio response; 2-4s text streaming. HIGH confidence (official source).
- [D&D 5e SRD v5.2.1 — D&D Beyond](https://www.dndbeyond.com/srd) — Updated December 2025 to 2024 rules wording. HIGH confidence.
- [How to use AI as a Dungeon Master Tool — Modular Realms](https://www.modularrealms.com/en-us/blogs/news/dungeon-master-tools-how-can-ai-help-me-dm) — Community-sourced guidance on useful vs gimmicky features. LOW confidence (blog).
- [AI Dungeon Masters vs Human DMs — Alibaba Product Insights](https://www.alibaba.com/product-insights/ai-dungeon-masters-vs-human-dms-where-do-automated-rpg-tools-break-immersion-and-where-do-they-shine) — Where automation breaks immersion analysis. LOW confidence (single source).

---
*Feature research for: AI DM Assistant (Live Mode) — VoxChronicle Foundry VTT Module*
*Researched: 2026-02-28*
