---
phase: 2
slug: journal-context-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest with jsdom |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CTX-01 | unit | `npx vitest run tests/ui/JournalPicker.test.js -x` | No — W0 | pending |
| 02-01-02 | 01 | 1 | CTX-01 | unit | `npx vitest run tests/ui/MainPanel.test.js -x` | Yes (needs new tests) | pending |
| 02-02-01 | 02 | 1 | CTX-02 | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -x` | Yes (existing) | pending |
| 02-02-02 | 02 | 1 | CTX-02 | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -x` | Yes (existing) | pending |
| 02-03-01 | 03 | 2 | CTX-03 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -x` | Yes (needs new tests) | pending |
| 02-04-01 | 03 | 2 | CTX-04 | unit | `npx vitest run tests/narrator/JournalParser.test.js -x` | Yes (needs new tests) | pending |
| 02-04-02 | 03 | 2 | CTX-04 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -x` | Yes (needs new tests) | pending |
| 02-05-01 | 03 | 2 | CTX-05 | unit | `npx vitest run tests/main.test.js -x` | Yes (needs new tests) | pending |
| 02-05-02 | 03 | 2 | CTX-05 | unit | `npx vitest run tests/main.test.js -x` | Yes (needs new tests) | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `tests/ui/JournalPicker.test.js` — stubs for CTX-01 (journal selection dialog)
- [ ] New test cases in `tests/ui/MainPanel.test.js` — stubs for CTX-01 (inline confirmation banner)
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` — stubs for CTX-03, CTX-04 (chapter context + chunking params)
- [ ] New test cases in `tests/main.test.js` — stubs for CTX-05 (debounced re-index hook)

*Existing infrastructure covers ChapterTracker (CTX-02) — tests already exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Journal picker renders correctly in Foundry VTT | CTX-01 | Requires live Foundry instance + ApplicationV2 rendering | Open MainPanel > click Change > verify folder tree, multi-select, primary radio |
| Content warnings display for edge-case journals | CTX-01 | UI notification rendering in Foundry | Select a journal with <500 chars content, verify yellow warning banner |
| Index health indicator updates during live session | CTX-05 | Requires real RAG indexing operation | Start live mode, edit journal page, observe dot color change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
