---
phase: 6
slug: state-machine-ui-accuracy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x with jsdom |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SUG-02 | unit | `npx vitest run tests/ai/OpenAIClient.test.js -t "postStream" -x` | Partial | pending |
| 06-01-02 | 01 | 1 | SUG-02 | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "streaming" -x` | Partial | pending |
| 06-02-01 | 02 | 1 | SUG-03 | unit | `npx vitest run tests/narrator/SilenceMonitor.test.js -t "cycle in flight" -x` | Partial | pending |
| 06-02-02 | 02 | 1 | SUG-03 | unit | `npx vitest run tests/narrator/SilenceDetector.test.js -t "fires once" -x` | Partial | pending |
| 06-03-01 | 03 | 2 | UI-02 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "suggestion card" -x` | Partial | pending |
| 06-03-02 | 03 | 2 | UI-02 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "status badge" -x` | Partial | pending |
| 06-03-03 | 03 | 2 | UI-02 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "streaming card" -x` | Partial | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/OpenAIClient.test.js` — add `postStream` SSE parsing test stubs
- [ ] `tests/narrator/SilenceMonitor.test.js` — add cycle-in-flight guard test stubs
- [ ] `tests/ui/MainPanel.test.js` — add status badge, streaming card, suggestion card structure test stubs

*Existing test infrastructure covers framework and config; only new test stubs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual pulse animation on ANALYZING badge | UI-02 | CSS animation timing requires visual inspection | 1. Start live mode 2. Trigger transcription 3. Verify amber pulse is gentle, not aggressive |
| Auto-scroll respects manual scroll position | UI-02 | Scroll behavior hard to test in jsdom | 1. Start live mode 2. Scroll up in suggestions 3. Verify new suggestion does NOT auto-scroll 4. Scroll back to bottom 5. Verify next suggestion DOES auto-scroll |
| Chapter context updates on scene change | UI-02 | Requires Foundry VTT scene navigation | 1. Start live mode 2. Navigate to different Foundry scene 3. Verify chapter label updates within next cycle |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
