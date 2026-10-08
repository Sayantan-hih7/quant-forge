# Qualification and backtest readiness

Qualification is the saved investment-rule decision, not a promise of executable trades or complete history. NSE remains the default exchange preference; BSE stays selectable.

New runs default to dataPolicy=ready. Preparation downloads and repairs candles, then the engine checks the selected scope before allocating capital. Every requested ID and exclusion reason is persisted as selectionAudit. Only included IDs become the tested config.ids and can be linked to paper trading. Legacy reports are not rewritten. Chart replay uses the tested scope without silently selecting a different subset again.

## Scenarios

- Good stock with missing download: retry first; exclude from this run if preparation remains unavailable. Keep qualification.
- IPO or insufficient EMA/weekly history: require completed inputs at the first decision candle in data-ready mode. Start later, shorten indicator lookback deliberately, or choose all-stock research mode. Never invent pre-listing bars.
- False entry rule / zero trades: still data-ready when inputs exist. No performance-based filtering.
- Missing day or minute / suspension: exclude before replay; all requests and reasons remain visible.
- All-zero traded volume or no intraday exit liquidity: exclude from data-ready scope.
- NSE series other than EQ: exclude from intraday data-ready scope pending proper settlement support. Current series is not historical series membership.
- Missing dated fundamentals or benchmark inputs: do not silently pass. Shared provider/engine failures may stop the run.
- Data disappears after initial readiness / sell inputs expire: simulation reports the limitation; existing data-quality checks block paper handoff. No position is removed to clean the results.
- No eligible stocks: failed run with a reviewable exclusion table, not a successful zero-return report.
- Research mode: retains original scope and limitations. Completely absent replay history still prevents calculation.

## Limits

Coverage filtering inspects the test period and can introduce selection bias. It must not be described as point-in-time stock selection. Historical qualification snapshots still determine entry eligibility. Full-period readiness is intentionally conservative; it does not implement dynamic IPO admission.

Known regular-session calendar dates are combined with observed peer-stock session dates. Unknown-year calendars, special sessions, corporate-action adjustments and historical instrument classifications remain separate data capabilities; readiness is not a certification that all prices or assumptions are correct. Trading suitability is a heuristic, distinct from these strategy/date-specific checks. Runtime quote freshness, clock checks, capital limits and stops still apply in paper trading.

Sources: https://www.quantconnect.com/docs/v2/writing-algorithms/historical-data/warm-up-periods ; https://www.tradingview.com/pine-script-docs/concepts/strategies/ ; https://www.nseindia.com/static/market-data/legend-of-series


### Long calculation progress and recovery

The worker checks engine availability, progress-protocol compatibility and entry-rule validation before preparing history. Backtest uploads reuse benchmark history across stocks. Calculation responses use NDJSON heartbeats and report loading, readiness and replay dates; the UI no longer presents history's 100% as overall completion. Only a complete final result can become a report.

A missing heartbeat fails after 60 seconds; an active calculation can continue beyond the former 10-minute response limit, up to a two-hour safety bound. Upload/connection establishment retains a 10-minute bound. Engine disconnect, timeout, busy, authentication and validation failures have distinct messages. Downloaded candles remain in storage for retries. There is no automatic resubmission that could launch duplicate calculations. Restart the Python engine and worker together when deploying this protocol update. Existing reports are unchanged.

## Stock eligibility for paper trading

A completed backtest now has a **Paper eligibility** tab. Configurable filters cover minimum closed-position win rate, minimum closed trades, positive closed net profit and optional maximum closed-trade drawdown in rupees. Defaults (55%, 10 trades, positive profit) are exploratory starting points, not calibrated performance claims. Partial exit fills are combined by entry; still-open positions never count as wins. Closed drawdown excludes intratrade/unrealized losses.

A separate, later, non-overlapping report of the same strategy revision may be required for validation. The same thresholds apply there. Without this, the UI explicitly identifies selection of historical winners as exploratory. Eligibility is not a prediction or an entry signal.

Filters persist with the report and session. Server checks reject incomplete reports, old strategy revisions, inactive/unqualified stocks, failed thresholds and invalid validation periods. Applying a shortlist keeps its IDs fixed until explicitly updated. Existing same-revision sessions retain cash, mode and position protection; removed stocks lose pending buys but held exits remain managed. A different active revision must be stopped without open positions before starting the tested revision. Live market freshness, candle-close signals and execution risk checks still control all paper fills. No live brokerage orders are enabled.
