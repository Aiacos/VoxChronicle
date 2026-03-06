---
phase: 4
slug: session-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest with jsdom environment |
| **Config file** | vitest.config.js / package.json |
| **Quick run command** | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js tests/ai/OpenAIClient.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/orchestration/SessionOrchestrator.test.js tests/ai/OpenAIClient.test.js tests/orchestration/CostTracker.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SESS-02 | unit | `npm test -- --run tests/ai/OpenAIClient.test.js` | ✅ (needs new cases) | ⬜ pending |
| 04-01-02 | 01 | 1 | SESS-02 | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | ✅ (needs new cases) | ⬜ pending |
| 04-01-03 | 01 | 1 | SESS-04 | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | ✅ (needs new cases) | ⬜ pending |
| 04-02-01 | 02 | 2 | SESS-05 | unit | `npm test -- --run tests/orchestration/CostTracker.test.js` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | SESS-05 | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | ✅ (needs new cases) | ⬜ pending |
| 04-02-03 | 02 | 2 | SESS-01 | integration | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | ✅ (needs new cases) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/orchestration/CostTracker.test.js` — new test file for SESS-05 cost tracking
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` — shutdown deadline (SESS-02), health status (SESS-04), rolling window (SESS-01), cost cap (SESS-05)
- [ ] New test cases in `tests/ai/OpenAIClient.test.js` — external AbortSignal cancellation (SESS-02)

*Existing infrastructure covers framework and fixtures. Only new test files/cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status dots render correctly in panel header | SESS-04 | Visual CSS rendering | Start live mode, simulate API failure, verify green→yellow→red dot transitions |
| Footer bar shows cost during live session | SESS-05 | UI visual verification | Start live mode, verify "Tokens: X | Cost: $Y" updates each cycle |
| "Stopping..." spinner displays during shutdown | SESS-02 | UI animation timing | Click Stop during active cycle, verify spinner appears and resolves within 5s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
