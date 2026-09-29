# Strategy builder & scanner: gaps and stage-wise roadmap

Analysis of `/strategies` (strategy builder) and `/scanner` (redirects to `/signal-runner`), compared against trader-facing scanner tools like Chartink and StockEdge. Goal: make it as easy for a trader to define a conditional entry, a stop-loss, and staged targets (T1/T2/T3) as it would be on those platforms.

## Gaps

### A. Strategy builder (`/strategies`)

1. **Staged stop-loss is split across 3 overlapping mechanisms**: `breakevenAfterTarget1` (legacy flag), `stopManagement` (`breakeven`/`trailing`, trigger on price or target), and per-target `moveStopTo`. All three can express "move the stop after target N fills," and the schema needs mutual-exclusion checks to stop them from conflicting. The capability a trader wants (entry → SL → T1 → move SL to entry → T2 → move SL to T1 → T3) already exists, but is scattered across two form sections plus a hidden legacy path.
2. **Dead/legacy code** still lives in the strategies module and can mislead future work: `StrategiesPage.tsx`, `TradingStrategyEditor.tsx`, `StrategyExamples.tsx`, `StrategyPipeline.tsx`, `tradingTemplates.ts` — none are reachable from the live route (`BackendStrategiesPage.tsx` is what `/strategies` actually renders).
3. **No ATR-based trailing stop** — only fixed-percentage or R-multiple trailing is supported.
4. **Long-only** — no short-side entry/exit modeling.
5. **Targets must share one unit** — can't mix, e.g., "T1 in %, T2 in R" within the same plan.
6. **No browsable template gallery.** Starting a new strategy is either a blank condition builder or one of a handful of backend-seeded "starter" examples — nothing like Chartink's library of public scans to clone from.

### B. Scanner (`/scanner` → `/signal-runner`)

7. **The dedicated "Scanner" page is a non-functional mock.** `ScannerPage.tsx` filters 4 hardcoded rows and is tagged "SIMULATION"; the `/scanner` route redirects straight to `/signal-runner` (`AppRouter.tsx`), so this page is unreachable dead code.
8. **No lightweight "just screen the universe" flow.** The only way to check which stocks match a set of conditions today is to build and save a complete tradeable strategy (entry + exit + risk). Chartink and StockEdge are built around the opposite flow: write conditions, get a stock list instantly, decide whether to trade it after.

### C. Not gaps — existing strengths

- Entry conditions are already a real, form-based scanner builder (indicator + operator + value, AND/OR groups) wired to a live indicator engine — functionally equivalent to a Chartink scan formula.
- An AI chat can build a full rule set (entry, exit, risk, staged SL) from a plain-English description — no equivalent in Chartink or StockEdge.

## Stage-wise improvement plan

### Stage 1 — Cleanup (low risk, immediate clarity)
- Remove or clearly deprecate the 5 dead strategy files and the mock `ScannerPage.tsx`.
- Reword wizard copy throughout to plain trader language, ahead of any schema changes.

### Stage 2 — Unify staged stop-loss
*(Detailed implementation plan already written; see the plan file referenced in the originating conversation.)*
- Collapse the 3 SL mechanisms into one: target-fill triggers live entirely on the target rows (`exitTargets[i].moveStopTo`, extended to also support "trail by R"); profit-multiple triggers live entirely in stop management (`stopManagement`, risk-trigger only).
- Retire `breakevenAfterTarget1` via a one-time data migration, then delete it from the schema.
- Add a plain-language recap per target row, e.g. *"After Target 1 fills (30% sold), stop-loss moves from ₹96 → ₹100 (entry)."*
- Touches: frontend schemas/components under `frontend/src/modules/strategies/{schemas,components,utils}`, backend validations under `backend/src/modules/strategies/validations`, execution logic in `backend/src/modules/paper-trading/services/stop-management.ts`, and the AI proposal plumbing (`backend/src/modules/ai/services/{proposal.service,risk-intent.service,assistant.service}.ts`, `proposal-error.ts`) which also references these fields.

### Stage 3 — Build a real quick-scan mode (closes the actual Chartink-parity gap)
- Repoint `/scanner` at a genuine lightweight screener: reuse the existing `ConditionGroupsEditor` and live indicator engine, but skip risk/SL/target setup entirely.
- Trader gets a matching stock list instantly; "turn this into a full strategy" becomes an optional next step rather than a prerequisite.

### Stage 4 — Template gallery
- Expand the existing "Use starter" preset option into a browsable, named library (e.g. "RSI dip buy, 3-target trail", "20-day breakout") so a new trader clones a working example instead of starting from a blank condition builder — closer to Chartink's public-scans experience.

### Stage 5 — Advanced / differentiators
- ATR-based trailing stop-loss.
- Short-side support.
- Mixed target-unit basis within a single plan.
