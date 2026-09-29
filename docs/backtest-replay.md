# Backtest candle replay

Open **Algo Strategies → Backtests → View report → a stock → Replay trade**.
Choose a trade by its entry date, then play, pause, change speed, move one step,
move to the next candle, or jump to its buy signal, entry or next exit.

The chart reveals a candle’s open first and its completed OHLC/volume later.
It shows only indicators available at that step. Signal conditions, entry fill,
remaining shares, realized P&L, targets and stop adjustments appear as they happen.
Raised stops take effect from the next execution candle. Going backwards restores
the earlier position and hides later fills and outcomes.

This is a historical explanation, not recorded market ticks. Daily OHLC cannot
establish the exact intraday path. Intrabar limit fills and protective exits are
revealed after the candle completes and are labelled accordingly. The stop-first
assumption when stop and target both occur in one bar is retained. Intraday runs
use the saved engine’s one-minute execution frame; daily runs use daily candles.
The replay ends at the final exit, or at the report cutoff if the trade stays open.

## Data and verification

New backtests include a bounded `result.replay` decision log. It records signal
OHLC and rule checks, entries, exits and changes to the stop. It only observes the
engine’s existing decisions; execution calculations are unchanged. The log is
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
- 6 October open: 330 shares at ₹832.42 including slippage; initial stop ₹817.20.
- 6 October close: only now reveal the later low ₹818.35 and close ₹828.05.
- 7 October: recorded stop exit at ₹816.79, net realized P&L −₹5,702.14.

Reconstruction matched all recorded portfolio trades, open positions and P&L.
Browser checks confirmed the signal → open-only entry → completed candle → exit
sequence. Automated coverage includes partial exits, next-bar stop changes,
backwards navigation, minute-boundary ordering, missing history, old-report
fallback, no-future indicator calculations, mobile/dark layout and read-only API
behavior. Existing strategy and paper-trading records remain unchanged.
