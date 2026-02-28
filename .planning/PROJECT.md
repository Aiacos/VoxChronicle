# VoxChronicle — Stabilization & Intelligent DM Assistant

## What This Is

VoxChronicle is a Foundry VTT module that provides AI-powered real-time assistance for Dungeon Masters running D&D 5e sessions. It captures session audio, transcribes with speaker diarization, and offers contextual suggestions, rules lookups, and narration prompts — all driven by the adventure content in Foundry journals. Post-session, it can extract entities and publish chronicles to Kanka.

## Core Value

The AI must follow the adventure journal as the source of truth — knowing where the party is in the story, what happened before, and what's coming next — so every suggestion is relevant and useful during actual play.

## Requirements

### Validated

<!-- Shipped and confirmed working in codebase (from codebase map analysis). -->

- ✓ Audio recording via browser microphone or Foundry WebRTC — existing (`AudioRecorder`)
- ✓ Audio chunking for files >25MB — existing (`AudioChunker`)
- ✓ GPT-4o transcription with speaker diarization — existing (`TranscriptionService`)
- ✓ Local Whisper transcription backend support — existing (`LocalWhisperService`)
- ✓ Speaker label mapping (SPEAKER_00 → player names) — existing (`SpeakerLabeling`)
- ✓ Entity extraction from transcripts (NPCs, locations, items) — existing (`EntityExtractor`)
- ✓ AI image generation with gpt-image-1 — existing (`ImageGenerationService`)
- ✓ Kanka API integration for publishing entities — existing (`KankaService`, `KankaEntityManager`)
- ✓ Relationship extraction and visualization — existing (`RelationshipGraph`)
- ✓ RAG provider system (OpenAI File Search + RAGFlow) — existing (`RAGProviderFactory`)
- ✓ Custom vocabulary dictionary for transcription accuracy — existing (`VocabularyDictionary`)
- ✓ Unified 6-tab floating panel UI — existing (`MainPanel`)
- ✓ 7-language i18n support — existing (`lang/*.json`)
- ✓ Session analytics (speaker participation, timeline) — existing (`SessionAnalytics`)
- ✓ Comprehensive test suite (4240+ tests, 46+ files) — existing

### Active

<!-- Current milestone scope — make live mode reliable and the AI assistant genuinely useful. -->

- [ ] Live mode survives a full 3-4 hour D&D session without crashes or state loss
- [ ] AI follows the adventure journal as source of truth for all suggestions
- [ ] AI tracks current chapter/scene position in the adventure
- [ ] AI provides contextual narration prompts that fit the current scene
- [ ] AI answers rules questions with accurate D&D 5e SRD references
- [ ] AI maintains session awareness — remembers what happened earlier
- [ ] AI knows NPC names, personalities, and motivations from adventure text
- [ ] AI anticipates what's coming next in the adventure
- [ ] AI suggestions are useful across all session moments (scene transitions, NPC dialogue, combat lulls, improvisation)
- [ ] Chronicle mode (transcription → extraction → Kanka publish) works end-to-end
- [ ] CSS namespace collision risk eliminated (214 un-namespaced classes fixed)

### Out of Scope

- NPC dialogue generation (on-the-fly NPC voice) — deferred, narration prompts are priority
- Mobile/tablet optimized UI — Foundry VTT is desktop-focused
- Multi-system support (PF2e, etc.) — D&D 5e only for this milestone
- Session state persistence across browser refresh — acknowledged tech debt, not blocking for this milestone
- TypeScript migration — future v4.0 consideration
- AIAssistant refactoring into smaller classes — nice to have, not required unless it blocks quality

## Context

- **Game system**: D&D 5e with SRD compendiums available in Foundry
- **Journal structure**: Mixed — some adventures have structured chapter/page layouts, others are loose notes. The AI needs to handle both.
- **Session usage**: DM glances at VoxChronicle during scene transitions, mid-NPC-conversation, combat lulls, and when players go off-script. Suggestions must be quick and relevant, not generic.
- **Current state**: Module has extensive code and tests but live mode has never been tested in actual gameplay. The existing narrator services (AIAssistant, SceneDetector, ChapterTracker, RulesReference) exist but their real-world reliability is unknown.
- **Known tech debt**: AIAssistant is a 1614-line god object, SessionOrchestrator has complex state machine (1359 lines), 214 CSS classes lack namespace prefix. See `.planning/codebase/CONCERNS.md`.

## Constraints

- **Tech stack**: JavaScript ES6+ modules (.mjs), Foundry VTT v13 API, no npm runtime dependencies
- **AI provider**: OpenAI APIs only (GPT-4o for transcription/chat, gpt-image-1 for images)
- **Testing**: Must maintain test suite health — no regressions allowed
- **Performance**: AI suggestions must return fast enough to be useful mid-session (seconds, not minutes)
- **Cost**: OpenAI API usage should be reasonable for a single DM session (~$1-3 per session target)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Journal-first AI context | DM says adventure journal is the source of truth, not generic D&D knowledge | — Pending |
| D&D 5e only | DM runs D&D 5e; multi-system adds complexity without value for this milestone | — Pending |
| Stabilize before new features | Live mode untested — make existing code work before adding capabilities | — Pending |
| Chronicle mode secondary | Live DM assistance is the primary use case; chronicle workflow should work but isn't the focus | — Pending |

---
*Last updated: 2026-02-28 after initialization*
