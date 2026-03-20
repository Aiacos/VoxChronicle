---
phase: 08
slug: advanced-suggestion-intelligence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-20
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/narrator/PromptBuilder.test.js tests/narrator/AIAssistant.test.js -x` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SUG-05 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "scene" -x` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | SUG-07 | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "speaker" -x` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | SUG-06 | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "offTrack" -x` | ✅ | ⬜ pending |
| 08-02-02 | 02 | 2 | SUG-06 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "offTrack" -x` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 3 | SUG-04 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "general query" -x` | ✅ | ⬜ pending |
| 08-03-02 | 03 | 3 | SUG-06 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "recovery card" -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or framework changes needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scene-type suggestions visibly differ in structure | SUG-05 | Requires human visual assessment of AI output | Start live mode in combat scene, verify suggestions lead with tactical options; switch to social scene, verify NPC dialogue hooks |
| Off-track recovery card appears after 2+ cycles | SUG-06 | Requires multi-cycle live session with deliberate off-track dialogue | Speak off-topic content for 2+ cycles, verify amber recovery card appears |
| On-demand query returns within 5 seconds | SUG-04 | Timing requirement needs real API calls | Type question, measure response time |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
