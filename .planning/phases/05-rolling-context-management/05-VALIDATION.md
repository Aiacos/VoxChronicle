---
phase: 5
slug: rolling-context-management
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (jsdom environment) |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run tests/narrator/RollingSummarizer.test.js tests/narrator/AIAssistant.test.js tests/narrator/PromptBuilder.test.js -x` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/narrator/RollingSummarizer.test.js tests/narrator/AIAssistant.test.js tests/narrator/PromptBuilder.test.js -x`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SESS-03 | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -x` | No - W0 | pending |
| 05-01-02 | 01 | 1 | SESS-03 | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "rolling" -x` | No - extend | pending |
| 05-01-03 | 01 | 1 | SESS-03 | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "async" -x` | No - extend | pending |
| 05-02-01 | 02 | 1 | SESS-03 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "budget" -x` | No - extend | pending |
| 05-02-02 | 02 | 1 | SESS-03 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "budget" -x` | No - extend | pending |
| 05-03-01 | 03 | 2 | SESS-03 | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -t "debug" -x` | No - W0 | pending |
| 05-03-02 | 03 | 2 | SESS-03 | unit | `npx vitest run tests/orchestration/CostTracker.test.js -t "summarization" -x` | No - extend | pending |
| 05-03-03 | 03 | 2 | SESS-03 | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -t "failure" -x` | No - W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/narrator/RollingSummarizer.test.js` -- stubs for SESS-03 (summarizer core, debug, failure)
- [ ] Extend `tests/narrator/AIAssistant.test.js` -- rolling history + async summarization
- [ ] Extend `tests/narrator/PromptBuilder.test.js` -- token budget enforcement
- [ ] Extend `tests/orchestration/CostTracker.test.js` -- summarization cost tracking

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Summary age badge visible in MainPanel | SESS-03 | UI rendering requires Foundry VTT | Enable debug mode, start live session, verify badge appears after 8+ turns |
| Full prompt dump in console at debug level | SESS-03 | Console output requires running environment | Enable debug mode, run live cycle, check browser console for prompt dump |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
