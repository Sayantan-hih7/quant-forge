# Paper-trading audit decisions - 6 October 2026

Scope: cash equities, paper execution only. No real-money broker order path added. Existing strategies, sessions, orders and historical reports were not migrated or rewritten.

## Verified and changed

1. **15 January 2026 closure:** confirmed against NSE/CMTR/72260 and added to the calendar. Read-only replay of the saved 42-stock long-term scope over 1 October 2024 through 5 October 2026 completed: 37 ready, five excluded for actual missing sessions or starting history. No report or trading state was saved by this verification.
2. **Missing minutes:** retained strict readiness for unverified gaps. Missing records do not prove zero trading; relaxing to a percentage could hide a stop breach. Research mode already permits the broader scope but retains warnings and blocks clean-data paper handoff. All-stock absence now explicitly reports a calendar/provider mismatch. We do not automatically declare an outage a holiday.
3. **Re-entry:** new paper BUY evaluation is rejected when its candle closes at or before that instrument's latest filled exit in the session. A subsequent completed candle may still signal. Guard runs inside the database transaction.
4. **Protective exits:** full-position protective orders are re-armed instead of silently expiring. After five seconds a fresh best bid can fill an already-triggered protective market exit. Requires the active provider session, bid updated within five seconds and after the trigger, known lower circuit, price above the circuit after slippage, and sufficient displayed quantity for the whole exit. Targets retain their later-tick behaviour. Each book fill records fillSource=book. Thin, stale or absent books remain pending. No fabricated trades or forced fills.
5. **Protection alerts:** worker checks run even when clock verification has paused execution. Incident records persist in paper_protection_alerts and are logged, with optional HTTPS webhook delivery; unchanged incidents are throttled to five minutes. Alerts are not an independent watchdog when this process or PC is stopped. NTP remains mandatory: UDP 123 must reach independent time servers. HTTP Date headers were not substituted because caching and second-level precision need a separate uncertainty model.
6. **Candidate ranking:** not changed. Exact selection parity under slot competition is NOT established by matching BUY condition sets. Coordinated ranking, pending-slot reservation, expiry/failover policy and chronological batch tests are still needed. No claim of perfect paper/backtest fill parity.
7. **Costs:** new drafts/starters and new saves default to Indian cash estimates unless explicitly overridden. Existing definitions retain their original settings and expose an explicit 'Use Indian cash charges' action in Risk. Save a new revision and rerun to compare; existing paper sessions keep their saved snapshot. Reports show the cost model.
8. **IPFT:** the claimed 1000x bug is outdated. NSE/FA/73061 moved IPFT from Rs 10/crore to Rs 0.01/crore effective 1 March 2026 and increased exchange charges correspondingly. Current 1e-9 multiplier is correct for the stated current-rate estimate. Shared independent paise fixtures verify Python and TypeScript. Historical date-dependent tax/rate schedules are still not implemented.
9. **Research labels:** all-stock research now says stocks retained / readiness warnings, not zero included. The stored audit preserves its diagnostic readiness counts.
10. **Entry cutoff:** new strategies default to 15:00 IST, editable in Risk; legacy snapshots without this field retain 15:15. Signal creation, order cancellation and fills respect cutoff. Backtest entry signals/fills use the same configured boundary. Exits and 15:15 square-off remain enabled.
11. **Benchmarks:** not added in this safety repair. A fair Nifty comparison needs aligned coverage and explicit price-return versus total-return basis. Equal-weight current-list buy-and-hold must not be represented as a historical investable universe; corporate-action adjustments are still an outstanding prerequisite for trustworthy long-range comparisons.
12. **Daily parity job:** not added. Re-evaluating today's mutable candle database is not proof of what was available when a historical paper signal fired. A reliable audit needs frozen inputs, strategy revision, engine version, held/pending state and separate checks for signals, sizing and execution. New targeted regression tests cover the confirmed bugs; the supplied 104/104 claim was not independently reproduced.
13. **2027 calendar:** no verified official 2027 circular was found. No speculative holiday dates were inserted. Added a warning 31 days before configured coverage expires; unknown years remain blocked. Administrators may configure verified years/holidays using existing MARKET_CALENDAR_YEARS / MARKET_HOLIDAYS settings.

## Running the changes

Restart the root npm run dev stack: paper, feed and job workers do not hot reload. Re-run failed backtests; old reports remain unchanged. Do not force-stop an active workload merely to refresh a browser page.

External alerts are optional: set PAPER_ALERT_WEBHOOK in backend/.env to an HTTPS endpoint you control, then restart the paper worker. Payload contains incident time, message and position count, never broker credentials. Delivery failure is recorded locally. No endpoint was configured or contacted by this change.

The bid fallback currently requires a primary execution feed publishing a fresh bestBidAt and circuit information (Motilal). Research-only Dhan depth is not accepted as execution liquidity. Backtests use historical OHLCV, so bid-based exits cannot promise tick/depth-exact parity without historical books.

## Verification

- Engine suite: 165 tests passed.
- Targeted backend unit suite: 27 tests passed (calendar, stale entry, book validity, costs, targets, stops, data-quality checks and feed routing).
- Isolated MongoDB integration: actual book fill rejected insufficient depth, then reconciled quantity, fees, realized P&L and cash; duplicate call could not double-fill.
- Browser checks: research-mode wording, missing-audit paper block and new-plan defaults passed.
- TypeScript and scoped lint checked.

## Sources

- Holiday amendment: https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf
- NSE rates effective 1 March 2026: https://nsearchives.nseindia.com/content/circulars/FA73061.pdf
- Dhan current tariff: https://dhan.co/pricing/

The comparison table supplied by the other AI was not treated as verified product research. Features and limitations of other platforms depend on product tier, data vendor and configuration.
