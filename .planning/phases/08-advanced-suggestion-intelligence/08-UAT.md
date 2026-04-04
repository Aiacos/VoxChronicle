---
status: testing
phase: 08-advanced-suggestion-intelligence
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md]
started: 2026-03-20T12:15:00Z
updated: 2026-03-20T12:15:00Z
---

## Current Test

number: 1
name: On-Demand General Query
expected: |
  Open the VoxChronicle panel. The input field at the bottom should show placeholder "Ask anything..." (or the localized equivalent). Type a general question like "describe the tavern scene" and press Enter. The input clears immediately. A streaming suggestion card appears in the feed with the AI's response grounded in adventure journal context. The card has a type badge (narration/dialogue/action).
awaiting: user response

## Tests

### 1. On-Demand General Query (SUG-04)
expected: Type a general DM question (not a rules question) in the panel input. A streaming card appears with the AI answer, grounded in the loaded adventure journal. Card has a type badge. Input placeholder says "Ask anything..."
result: [pending]

### 2. Rules Query Still Works (SUG-04 — regression check)
expected: Type a rules question like "how does grapple work" in the same input field. It should still route to the rules lookup pipeline — a purple-tinted rules card appears with compendium excerpt, then refines with AI synthesis. Rules behavior unchanged.
result: [pending]

### 3. Scene-Type Adapted Suggestions — Combat (SUG-05)
expected: During a live session in a combat scene (or manually set scene type to combat), AI suggestions should lead with tactical options, initiative-aware actions, and enemy ability reminders. The suggestion content visibly differs from non-combat suggestions.
result: [pending]

### 4. Scene-Type Adapted Suggestions — Social (SUG-05)
expected: During a social scene, AI suggestions should lead with NPC dialogue hooks, relationship dynamics, and persuasion/deception opportunities. Different from combat suggestions.
result: [pending]

### 5. Off-Track Detection — Recovery Card (SUG-06)
expected: During live mode, speak off-topic content that diverges from the adventure path for 2+ consecutive AI cycles. After the second cycle detects moderate+ off-track severity, an amber-tinted recovery card appears with "Off Track" badge, showing the adventure hook the party diverged from. The card has a dismiss button.
result: [pending]

### 6. Off-Track — Single Cycle No Card (SUG-06)
expected: Speak slightly off-topic for just 1 cycle. No recovery card should appear (threshold is 2+ consecutive cycles). The off-track detection resets if the next cycle is on-track.
result: [pending]

### 7. Quiet Speaker Engagement (SUG-07)
expected: During a live session with 3+ speakers, if one speaker has contributed less than 15% of total speaking time, the AI suggestions should include engagement opportunities for that quiet player's character. No separate UI indicator — the effect is in the suggestion content.
result: [pending]

### 8. Recovery Card Dismiss (SUG-06)
expected: When an off-track recovery card is visible, clicking the dismiss button removes it from the feed. The card does not reappear until off-track is detected again for 2+ consecutive cycles.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]

## Notes

- All code quality issues resolved (0 errors, 232 warnings remaining)
- All tests passing (5119/5119)
- Ready for manual UAT execution
- ESLint configuration updated to handle browser globals and test-specific patterns
