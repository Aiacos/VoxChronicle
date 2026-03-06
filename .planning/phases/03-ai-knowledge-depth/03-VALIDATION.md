---
phase: 3
slug: ai-knowledge-depth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x with jsdom |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/narrator/NPCProfileExtractor.test.js tests/narrator/PromptBuilder.test.js tests/narrator/AIAssistant.test.js --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/narrator/ tests/orchestration/SessionOrchestrator.test.js --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CTX-06 | unit | `npx vitest run tests/narrator/NPCProfileExtractor.test.js -x` | No -- W0 | pending |
| 03-01-02 | 01 | 1 | CTX-06 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "NPC detection" -x` | No -- W0 | pending |
| 03-01-03 | 01 | 1 | CTX-06 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "NPC" -x` | No -- W0 | pending |
| 03-02-01 | 02 | 1 | CTX-07 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "lookahead" -x` | No -- W0 | pending |
| 03-02-02 | 02 | 1 | CTX-07 | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -t "sibling" -x` | Partial | pending |
| 03-03-01 | 03 | 1 | SUG-01 | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "source" -x` | No -- W0 | pending |
| 03-03-02 | 03 | 1 | SUG-01 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "source" -x` | No -- W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/narrator/NPCProfileExtractor.test.js` — stubs for CTX-06 NPC extraction and profile mapping
- [ ] New test cases in `tests/narrator/PromptBuilder.test.js` — NPC injection, lookahead, source schema
- [ ] New test cases in `tests/narrator/AIAssistant.test.js` — source field parsing
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` — NPC mention detection, live enrichment

*Existing infrastructure covers test framework; only new test files/cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NPC extraction quality on real journals | CTX-06 | LLM output quality varies per journal format | Load a real adventure journal in Foundry, start live mode, verify NPC profiles in console logs |
| Source citation accuracy | SUG-01 | LLM may hallucinate citations | Run live mode with a journal, check that cited chapters/pages exist in the journal |
| Foreshadowing subtlety | CTX-07 | Subjective quality judgment | Start live mode mid-adventure, verify suggestions reference upcoming content naturally |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
