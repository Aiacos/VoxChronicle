---
phase: 7
slug: rules-lookup-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest with jsdom |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/narrator/RulesLookupService.test.js -x` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/narrator/RulesLookupService.test.js tests/narrator/RulesReference.test.js -x`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | RULE-01 | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -t "lookup" -x` | W0 | pending |
| 07-01-02 | 01 | 1 | RULE-01 | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -t "synthesis" -x` | W0 | pending |
| 07-01-03 | 01 | 1 | RULE-02 | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -t "citation" -x` | W0 | pending |
| 07-01-04 | 01 | 1 | RULE-01 | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -t "cooldown" -x` | W0 | pending |
| 07-02-01 | 02 | 1 | RULE-03 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "rules.*fire" -x` | Extend | pending |
| 07-02-02 | 02 | 1 | RULE-03 | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "rules.*fail" -x` | Extend | pending |
| 07-03-01 | 03 | 2 | RULE-01 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "rules card" -x` | Extend | pending |
| 07-03-02 | 03 | 2 | RULE-01 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "rules query" -x` | Extend | pending |
| 07-03-03 | 03 | 2 | RULE-01 | unit | `npx vitest run tests/ui/MainPanel.test.js -t "rules.*dismiss" -x` | Extend | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/narrator/RulesLookupService.test.js` — new test file for RULE-01, RULE-02 (lookup, synthesis, cooldown, citation)
- [ ] Extend `tests/orchestration/SessionOrchestrator.test.js` — RULE-03 (fire-and-forget, failure isolation)
- [ ] Extend `tests/ui/MainPanel.test.js` — RULE-01 (rules card rendering, on-demand input)

*Existing infrastructure covers RulesReference detection and search (already tested).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Purple-tinted card visual distinction | RULE-01 | CSS visual check | Open MainPanel, trigger rules card, verify purple background tint vs suggestion cards |
| In-place card transition smoothness | RULE-01 | Animation quality | Trigger rules lookup, verify compendium excerpt fades smoothly to AI synthesis |
| Input field persistence across re-renders | RULE-01 | DOM state behavior | Type in rules input, trigger panel re-render (e.g., new suggestion), verify text preserved |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
