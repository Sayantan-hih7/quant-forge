# Strategies, backtests and signals

`/strategies` opens a searchable library. **New strategy** starts an editable blank plan or a starter for Intraday, Swing or Long term. A starter is copied into a local draft; it does not create a saved strategy or start monitoring.

The editor has five steps: **Setup → Buy rules → Sell rules → Risk → Review & save**. Both sides remain available in the manual builder. AI suggestions are reviewed in a drawer and require **Apply to builder** before becoming edits. Applying a suggestion never saves it.

Drafts survive reload on the same browser. Failed saves retain them. Saved revisions protect against overwriting changes from another browser. An older or unversioned draft that differs from the saved strategy requires explicit recovery through **Reload saved strategy**; it is not silently submitted against newer rules.

Backtests use a saved strategy. Dates, stock scope and manual-stock inclusion are chosen explicitly. `/api/backtests/universe` uses the same universe-selection service as the queue: current lists for retrospective research, or recorded historical lists for the requested dates. Historical eligibility still starts at publication, as enforced by the engine. Stocks outside the chosen scope must be removed before submitting.

Missing history is prepared before replay. Progress and failures appear under **Runs for this strategy**. Reports open separately and identify tests of earlier rules. A report's Signal Runner link carries its strategy and stock selection, not its simulated positions.

Signal Runner separates **Inspect rules** from **Monitoring sessions**. Inspection checks both sides against stored completed candles and shows the candle date and individual checks. It creates no sessions, orders or live signals. Changing the strategy, its saved revision, or the selected stock set invalidates the displayed inspection.

Continuous monitoring requires a separate **Start paper monitoring** action after inspection. Confirmation or automatic mode applies to paper orders only. The existing session retains its starting strategy revision. Fresh execution data and the paper worker are required for ongoing processing; their status appears in Monitoring sessions.

## Verification

- `frontend/tests/algo-strategies.spec.ts`: paired rules, manual saves, AI proposals and failed refinements.
- `frontend/tests/strategy-workflow.spec.ts`: creation, explicit-save boundary, recovery, scope errors, backtest handoff, mobile layout and order-free inspection.
- `backend/test/strategy-workflow.integration.test.ts`: current/manual/historical scope and stale-revision guards. Requires `RUN_DB_TESTS=1`; uses a uniquely named temporary test database.
- `engine/tests/test_backtest.py`: replay, next-bar fills, protective exits and historical eligibility.
