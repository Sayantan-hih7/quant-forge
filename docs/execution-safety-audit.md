# Execution and backtest audit — 5 October 2026

## Verified findings

- Windows Time is stopped. Independent NTP samples put this PC about 15.1 seconds
  ahead. Normal service start was denied; the Windows administrator prompt was
  cancelled. The OS clock has NOT been repaired by this work.
- Current October membership referenced inactive KABRAEXTRU NSE:1805. The active
  NSE:8784 has the identical ISIN INE900B01029. Current membership is now repaired.
  The audit recorded 61 unique same-ISIN/same-exchange provider-ID replacements.
  This is not 61 newly qualified stocks. The current pool still contains 42 stocks.
- Long-term revision 15 really contains daily close <= 0 with a dormant weekly
  EMA5 field. It cannot match a positive cash price. The intended comparison must
  be chosen in the builder; no strategy was silently rewritten.
- Latest saved long-term report: -48.713654%, 893 closed positions, 826 stop-loss
  exit legs, 421 stop exits on the same IST date as entry. The supplied audit's
  614 same-day figure was not reproduced with this definition/latest report.
  These observations do not prove the stop alone caused the loss.
- Latest intraday report: 109,798 zero-volume bars, 2,505 missing minutes; swing:
  79 unavailable decisions. Old results remain immutable.

## Implemented controls

1. Paper worker verifies time using two independent NTP servers every 30 seconds.
   Agreement and uncertainty are checked; an offset plus uncertainty above three
   seconds blocks execution and signal evaluation. Failed/stale verification also
   blocks. UI reports this separately from exchange-to-receive stream delays.
   No local timestamp offset is silently applied to trades or candles.
2. Stock-master sync remaps current/future membership, active session selections,
   open positions, pending orders and watchlists transactionally. Identity is
   exchange + exact ISIN, never symbol alone and never cross-exchange. A new
   membership snapshot and migration audit record are written. Original snapshots,
   reports, executed orders, stored price series and qualification evidence remain.
   Ambiguous mappings/position collisions need review. Historical reports with old
   IDs are not rewritten. Backtest inactive-stock errors now identify each stock.
3. Nonpositive price comparisons are mathematically checked by rule review. Invalid
   saved strategies cannot start new backtests/paper sessions. Tight overnight
   stops receive an advisory, not an automatic strategy change.
4. Emergency entry halt is persistent and serialised with buy fills. It cancels
   pending/confirmation buys and blocks subsequent buys; it does NOT disable exits
   or pretend to liquidate holdings without quotes. Release is explicit.
5. Per-session daily equity loss cap defaults to 2%, configurable in Monitoring
   settings. Baseline is the first fresh portfolio valuation that day, preserved
   across restarts. It includes realized and open P&L after that baseline. It is
   not a previous-close loss measure and cannot measure moves while data is absent.
   Reaching it latches new-buy blocking until the next trading day; exits continue.
6. New signal/manual buys store a reference price and reject fills more than the
   configured distance away (default 2%). Existing legacy orders without references
   retain earlier behaviour. Sell/protective exits are not blocked by this limit.
7. Known circuit limits from the current feed session block quote-only fills at or
   beyond a band, including after slippage. This is conservative. Missing circuit
   metadata is NOT evidence of unlimited liquidity and remains a coverage gap.
8. A detected ISIN reissue suspends existing position automation for reconciliation
   and cancels pending orders. This prevents applying old levels to a known changed
   security; it does not detect every bonus/split or automatically adjust holdings.
9. UI names holdings whose stops cannot execute because quotes are unavailable.
   Existing provider reconnect/failover remains enabled; there are no broker-hosted
   stops and no out-of-app alert delivery in this local paper workspace.

## Backtest changes (portfolio-stream-v5)

- Initial unavailable BUY checks are counted as warm-up only until the stock first
  reaches an evaluable entry decision. Later unknown checks and unknown exits stay
  data gaps. Never-ready stocks still block report handoff. Warnings retain skipped
  counts and first-ready times. Old reports need a rerun to obtain this evidence.
- Optional Indian cash cost model uses Dhan-style rates captured 2026-10-05:
  https://dhan.co/pricing/
  Intraday brokerage min(20 rupees, 0.03%); delivery brokerage zero; STT, stamp duty,
  exchange/SEBI/IPFT, GST and DP included. Statutory rounding is explicit and tested.
  Exchange rate is a saved input: default NSE 0.0030699%; standard BSE is 0.00375%,
  but other BSE groups differ. Each delivery sell is treated as a DP instruction.
  Overnight strategy means delivery pricing; historical rate changes, same-day
  delivery netting and contract-note aggregation are not modelled. Existing saved
  cost assumptions are preserved until edited. Paper and Python share reference
  fee fixtures; the frontend sizing example uses the same formula.
- CAGR (one year minimum), daily-return Sharpe/Sortino (20 observations minimum,
  252 sessions, zero risk-free/target return), closed-position net expectancy and
  monthly net returns are calculated from full equity data before chart sampling.
  Null is displayed when history is insufficient. Data-gap warnings still apply.

## Remaining work, in order

1. Administrator must run Start-Service w32time then w32tm /resync. Verify the app's
   clock status turns healthy. Clock monitoring is a guard, not an OS repair.
2. Review the intended long-term sell comparison. Use current liquidity profiles
   to choose an intraday subset and rerun; do not loosen data checks to hide gaps.
3. Validated corporate-action feed, reconciliation UI and dividend/share accounting;
   comprehensive circuit/depth coverage; persistent external outage notifications.
4. Verified future exchange calendars before trading another year. The existing
   unknown-year fail-closed policy remains. Do not invent 2027 holidays.
5. Benchmark-aligned returns, time-weighted exposure and point-in-time data audits.
6. Out-of-sample/walk-forward and Monte Carlo research with documented selection
   and optimisation bias. No optimiser should be used to manufacture a target return.

No claim of parity with any named commercial platform has been verified. No real
orders were placed. Automated trading should remain paper-only.


## Verification

- Backend regression suite: 207 passed, 32 integration cases skipped.
- Separately enabled database suites: safety repair, paper history/controls, paper runner and strategy workflow passed in disposable databases. Repeated identity repair was also verified.
- Python engine: 155 passed.
- Browser: 19 passed across reports, paper readiness and risk configuration.
- TypeScript compilation and scoped lint passed.
- Restarted API, engine and frontend each returned HTTP 200. No real or paper orders were created in the user database.
- Last live clock read was unverified (network time samples unavailable/inconsistent); previous measurements confirmed approximately 15.1 seconds drift. Both states intentionally pause execution. Windows administrator time synchronisation is still outstanding.

## Follow-up: exchange scope, suitability and clock sync

The user synchronised Windows time. Microsoft and Google samples verified less than 0.04 seconds offset. A third independent NTP source now tolerates one unavailable server; two agreeing valid samples remain mandatory. The restarted worker reports healthy. The Windows Time service is still stopped: a one-off Sync now is not ongoing OS synchronisation. Checks apply to the backend host, not browser-device time.

Qualified-stock viewing and new backtest selections default to NSE, with a remembered BSE/all choice. Published membership is unchanged. Current-list backtests expose the existing holding-period research profiles and their dated criteria; matches can be selected explicitly. These are current screening heuristics, not validation of arbitrary strategy rules. Historical-list tests do not apply present-day profiles.
