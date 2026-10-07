# Backtest candle replay

Open **Algo Strategies â†’ Backtests â†’ View report â†’ a stock â†’ Replay trade**.
Choose a trade by its entry date, then play, pause, change speed, move one step,
move to the next candle, or jump to its buy signal, entry or next exit.

The chart reveals a candleâ€™s open first and its completed OHLC/volume later.
It shows only indicators available at that step. Signal conditions, entry fill,
remaining shares, realized P&L, targets and stop adjustments appear as they happen.
Raised stops take effect from the next execution candle. Going backwards restores
the earlier position and hides later fills and outcomes.

This is a historical explanation, not recorded market ticks. Daily OHLC cannot
establish the exact intraday path. Intrabar limit fills and protective exits are
revealed after the candle completes and are labelled accordingly. The stop-first
assumption when stop and target both occur in one bar is retained. Intraday runs
use the saved engineâ€™s one-minute execution frame; daily runs use daily candles.
The replay ends at the final exit, or at the report cutoff if the trade stays open.

## Data and verification

New backtests include a bounded `result.replay` decision log. It records signal
OHLC and rule checks, entries, exits and changes to the stop. It only observes the
engineâ€™s existing decisions; execution calculations are unchanged. The log is
limited to 20,000 events and 4 MB, with an explicit incomplete flag.

`GET /api/backtests/:id/stocks/:instrumentId/replay` returns a self-contained stock
history snapshot. For older or truncated reports it runs the saved strategy and
portfolio configuration against stored history, without downloading data or saving
a new report. Reconstructed explanations are accepted only when trades, open
positions, closed trade count and net P&L match the original report exactly.
Otherwise playback falls back to recorded fills and marks the missing evidence.
Missing execution candles prevent playback rather than guessing event placement.
Corrections to a recorded signal candle are called out in the response.

The API coalesces duplicate requests, allows two concurrent preparations, and
caches up to eight prepared stock snapshots for 15 minutes. The initial older
report reconstruction can take time; no new backtest, strategy revision, signal,
order or paper session is created. The ordinary report API excludes the trace
payload; the dedicated replay route retrieves the needed explanation.

## Verified example

FINCABLES, saved revision 14, report `273664ce-d43a-438c-bd1a-17b62f0ef011`:

- 3 October 2025: green signal candle, 85.9098% of body above EMA 5.
- 6 October open: 330 shares at â‚¹832.42 including slippage; initial stop â‚¹817.20.
- 6 October close: only now reveal the later low â‚¹818.35 and close â‚¹828.05.
- 7 October: recorded stop exit at â‚¹816.79, net realized P&L âˆ’â‚¹5,702.14.

Reconstruction matched all recorded portfolio trades, open positions and P&L.
Browser checks confirmed the signal â†’ open-only entry â†’ completed candle â†’ exit
sequence. Automated coverage includes partial exits, next-bar stop changes,
backwards navigation, minute-boundary ordering, missing history, old-report
fallback, no-future indicator calculations, mobile/dark layout and read-only API
behavior. Existing strategy and paper-trading records remain unchanged.

## Portfolio calculation limits

Portfolio requests use the authenticated `/backtest-stream` endpoint. Node reads
one stock at a time and transfers compact OHLCV records with backpressure; Python
spools the upload to temporary disk and validates its final stock/candle counts.
The engine then merges each stock's chronological iterator into one portfolio,
sharing capital, position limits and risk sizing across the entire selection.
It never splits the selection into independent portfolios to bypass a limit.

The previous 150,000-candle aggregate restriction no longer applies to backtests.
Safety bounds remain: 200 distinct stocks, 500,000 stored candles per stock,
8 million candles overall including warm-up, 64 MiB per record and 1 GiB per
upload. Only one portfolio calculation runs in an engine process at a time.
Intraday tests retain the 90-day date-range limit. A missing or truncated upload
fails rather than producing a report for a partial selection.

Results record `inputCandles` and `engineVersion` (`portfolio-stream-v3`). This
version sizes entries using the same conservative equity basis as paper trading:
cash plus remaining shares valued at the lesser of entry price and current stop.
Report equity still uses market prices. Fills and fees round to the nearest paise,
with half-paise amounts rounding up, matching the paper engine. Previous reports
are retained; their reconstructed replay still must match the recorded result.

Minute gaps remain explicit in `historyQuality`. Streaming removes a processing
limit; it does not synthesize missing candles or improve a strategy's returns.


## Data quality and trading profiles (October 2026 audit)

The v3 replay cannot fill entries, exits, stops or targets on zero-volume bars,
and those bars cannot advance trailing stops. Indicators still see provider
observations. Intraday market signals expire at the next evaluation boundary;
intraday day-limit entries expire at the session cutoff. Historical prices do
not prove executable depth: nonzero-volume fills still assume sufficient liquidity
for the whole order, with configured slippage and fees.

Preparation rechecks absent one-minute observations, capped at 40 provider
requests per run. Valid responses are stored; omissions are never filled with
invented prices. Recheck receipts last seven days, failures one hour. Locally
lost candles bypass a successful receipt. The report separates leading,
internal, trailing and entirely absent regular sessions, as well as zero-volume
bars and missing exit liquidity. Unknown calendar years cannot establish wholly
absent sessions, and no-candle dates can include dates before a listing.

Qualified-stock research profiles are independent of monthly qualification and
strategy buy/sell rules. They allow multiple matches and expose all thresholds,
values, sources and dates. Intraday uses price, estimated 20-day turnover,
ATR percentage and active minutes; swing uses liquidity, SMA20/SMA50 trend and
ATR percentage; long-term uses SMA200, market cap and ROE. These are transparent
default screening profiles, not validated profitability forecasts. They are not
used to retrospectively filter a backtest.

The published pool's daily, recent minute and relevant company history refreshes
in the maintenance worker at 18:00 IST on weekdays, on startup catch-up and when
a new published pool is viewed. Receipts reuse history and prevent repeat
downloads. Monthly membership and original scan evidence are not rewritten.

The local 43-stock audit used 401,518 candles. The saved v3 report is
74033257-37a8-4d7c-a0ad-a7faed3dcb0c: 544 closed positions, no open positions,
net P&L -8,642.22 on 100,000 initial capital. Forty provider rechecks recovered no
minutes; one session was deferred by the budget. All 1,223 missing minutes preceded
the first reported candle. The old v2 report had 60 distinct fill timestamps on
zero-volume candles; the v3 report has none. Old reports remain unchanged.

Reference behaviour:
- TradingView Bar Magnifier uses lower-timeframe observations to reduce OHLC path
  assumptions: https://www.tradingview.com/support/solutions/43000669285-what-is-bar-magnifier-backtesting-mode/
- QuantConnect documents order-specific fill assumptions and rejects stale data
  for limit and stop orders: https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/trade-fills/supported-models/equity-model

Remaining model limits include within-minute price ordering, lack of queue/depth
and participation simulation, provider corporate-action consistency, historical
fundamental availability, and selection bias when today's universe is tested
against earlier prices. The current-list warning remains essential.

## Daily-history recovery audit — 5 October 2026

Dhan documents five years of intraday history and daily history from inception:
https://dhan.co/support/platforms/dhanhq-api/what-timeframe-data-is-available-through-dhan-s-historical-data-apis/
The intraday request-window limit is not a five-year retention limit.

Daily downloads now save validated calendar-year windows independently and retry
invalid payloads by calendar month. Conflicting windows are not marked complete;
valid windows survive a later failure. HTTP/authentication failures do not trigger
monthly retry storms. Conflicting prices are never selected arbitrarily.

Targeted repair of the original 49 unavailable stocks resolved five: one qualified,
four failed actual conditions, and 44 remained unavailable. A separate full scan
062b967a-4b80-4c8e-b5fc-277631807208, using the current dated inputs, evaluated
5,458 stocks: 42 qualified, 5,230 rejected, 46 unavailable, 140 awaiting history.
The existing 43-stock published list and earlier scan evidence were preserved.
Counts differ from the targeted subset because the full scan reevaluates all stocks.

Live provider probes found conflicting same-date prices for MOTHERSON and volumes
for ABREL. Daily history is documented as corporate-action adjusted; raw exchange
EOD prices cannot simply be spliced into this series:
https://dhan.co/support/platforms/dhanhq-api/is-the-historical-data-from-dhan-s-data-api-adjusted-for-corporate-actions-like-bonuses-and-splits/
Motilal's published API lists EOD data but no verified date-range historical candle
endpoint: https://invest.motilaloswal.com/moAPI/APIDocumentation/Introduction

History readiness is exchange-specific, not proof of a company's IPO date. Live
Dhan probes returned 249 daily bars for 2024 for each alternative BSE listing:
MOSCHIP (532407), PROTEAN (544021), NIBE (535136). These were read-only probes;
BSE candles were not merged into their selected NSE series. A future explicit
exchange selection can use those separate histories after full validation.

Completed reports with missing minute observations, missing exit sessions, or
unavailable rule decisions now show Data incomplete - research only. Both the UI
and backend reject a backtest-linked paper handoff for those reports. Zero-volume
observations alone do not mark a report incomplete. This is a known-gap guard,
not a guarantee that provider data or the simulation model is perfect.

Validation: backend/frontend TypeScript and scoped ESLint passed; four focused
unit tests, four integration tests, and five backtest-report browser tests passed.
Local probe evidence is in ignored backend/data/provider-history-probe.json,
alternative-history-probe.json, and qualification-repair-results.json.

## Opening execution reconciliation — 5 October 2026

Calculation version portfolio-stream-v4 resolves existing position protection
at the observed opening price before replaying unknown intrabar price paths and
before sizing new entries. Previously a candle opening above a target and later
falling below its stop could incorrectly be recorded entirely as a stop loss.
Opening target fills receive the opening price, with configured sell slippage
and fees. Ambiguous intrabar touches retain the conservative stop-first model.
Stop adjustments still take effect on the next replay bar, as disclosed.

Eight independent hand-ledger cases cover opening target/stop gaps, ambiguous
ranges, partial-target remainder stops, multiple targets crossed at the open,
Decimal-based fee/slippage accounting, and shared position-slot/capital release.
They do not reuse production sizing or exit helpers for expected results.
All 152 engine tests pass. Existing reports remain untouched; rerun to obtain
v4 results. This validates these execution cases, not broker fill parity or a
complete independent implementation of every indicator and trading strategy.

## Execution safety audit, 5 October 2026

Engine `portfolio-stream-v5` adds optional Indian cash charges, explicit initial indicator warmup, and performance metrics. See [the verified safety audit](execution-safety-audit.md) for clock protection, instrument-ID repairs, paper entry safeguards, and remaining limitations. Existing reports retain their original engine and assumptions.
