# Strategy revision history

Open **Algo strategies → History** on a strategy card, or **Revision history** while viewing a saved strategy.

- Every saved revision is listed with its save time (IST), changed sections and linked backtests / monitoring sessions. The list paginates; it is not limited to the last ten revisions.
- Select a revision to see its complete buy rules, sell rules and risk / execution settings. Compare it with any recorded revision. The comparison always reads from the older revision to the newer one.
- Backtest runs and reports, signal records, monitoring sessions, paper positions, pending orders and trade history have clickable revision labels. Earlier rules are identified alongside the current saved revision.
- Opening a label from a result uses that result's exact embedded strategy snapshot. An archive with the same revision number never replaces the recorded run definition.
- History is read-only. Inspecting a revision does not save rules, launch a backtest, change a monitoring session or place an order. Running sessions retain their original strategy revision.

## Storage and legacy history

`strategies` stores the latest definition. `strategy_revisions` archives each saved definition under `strategyId:revision`. Saves use a MongoDB transaction and expected-revision check; a legacy current definition is archived before it is replaced. An existing archive is never overwritten.

`GET /api/strategies/:id/revisions` returns saved definitions and the backtest/session references that used them. If an old archive is absent, the endpoint can show a genuinely recorded embedded snapshot from `backtest_runs` or `paper_sessions`. Missing revision ranges and conflicting definitions sharing a revision number are explicit. No historical rules are invented from the current strategy.

The current workspace was checked on 29 September 2026: Intraday has revisions 1–2, Swing 1–3, and Long term 1–10. All are recorded; no conflicting snapshots were found. Existing strategies, backtests and trading records required no rewrite.

## Verification

Backend checks cover complete history, missing ranges, recovered legacy definitions, conflicting snapshots, metadata differences, transactional preservation of the previous definition and rejection of stale saves. Browser checks cover comparisons, historical report links, exact report snapshots, paper / signal provenance, retry states, mobile layout and cross-strategy report rejection. Existing strategy, backtest-report and paper-order workflows are also exercised.
