# Quant review of the QuantForge algo system: 30 September 2026

Written for: the system owner, who wants to know what stops this from being a trustworthy trading system.

**Scope.** I read the code on the critical path: `engine/quantforge/backtest.py`, `replay.py`, `market.py`, `stop_management.py`, the paper-trading `runner`, `fill`, `order-estimate`, `stop-management`, `protection`, `square-off` and `evaluation-window` services, and the risk schema. I also read the README and the 28–29 Sept validation and audit docs. I did not run the system or the test suite, and I did not read every module (AI assistant, indices, stock-details and frontend were skimmed at most). Findings marked *inferred* come from grep or docs rather than from tracing code.

## 1. Verdict

The **plumbing is unusually careful for a retail-scale system**:
- Signals use completed bars only, and fills happen at the next bar's open.
- Money is held as integer paise, and fills run in DB transactions.
- Stale quotes are rejected after 15 seconds.
- A stop wins when a stop and a target touch in the same bar, and gaps fill at the worse price.
- Missing data fails closed instead of being invented, and entry events are deduplicated.
- The docs are honest about their own limits.

The **research layer is not yet able to tell you whether any strategy has an edge**. Current evidence:

| Strategy | Result | Trades | Reliable? |
| --- | --- | ---: | --- |
| Intraday | −13.7% | 345 | No. 184 of 230 sessions lack the 15:15 exit bar. |
| Swing | −0.11% | 98 | No. Selection bias, no significance test. |
| Long term | +0.12% | 22 | No. 22 trades is noise. |

All three are stock-standard indicator combinations (EMA/RSI/VWAP), so no edge should be assumed. Fixing the validation stack below matters more than adding features.

## 2. Gaps, ranked

### P0: results cannot be trusted yet

**1. No corporate-action handling.** Dividends and splits/bonuses are not modelled, and there is a documented gap around split/bonus-adjusted comparisons (`rule-data-coverage.md:49`). It is unclear whether Dhan candles are adjusted. If they are not, an unadjusted 1:1 bonus shows up as a −50% overnight gap. That gap triggers stops, corrupts SMA200 and ATR, and can fake a signal. This affects every 184-stock, 1-year daily test. *Fix:* store an adjustment-factor table (NSE corporate-actions feed), adjust candles at read time, and add a data-quality gate that flags overnight moves of −35% or worse with no matching action.

**2. Universe look-ahead in the backtests.** The monthly filter uses fundamentals (ROE, pledge, market cap) from Dhan snapshots that are not point-in-time. Historical mode only works for months you have recorded, so any long test falls back to "current list", which selects today's winners. The −0.11% and +0.12% results are contaminated in a direction that flatters them. *Fix:* start snapshotting the universe and fundamentals every month now (you already publish monthly lists). Until 12 or more months exist, report a **liquidity-only, price-based universe** that can be reconstructed as of any date, as the honest baseline.

**3. Intraday history has holes.** 184 of 230 sessions have no exit bar. That means bad data pipeline coverage, not just "provider gaps". *Fix:* run a per-session completeness check (375 one-minute bars per session) after every import and backfill from a second source. Refuse to report a strategy result if completeness is below a threshold, and exclude those sessions from the test instead of delaying the exit to the next day.

**4. Not enough statistics to say anything.** Reports show net P&L, max drawdown, win rate and profit factor only. There is no Sharpe/Sortino, CAGR, expectancy, average win/loss, payoff ratio, exposure or time in market, turnover, or MAE/MFE. There is no benchmark comparison (Nifty 50 buy-and-hold) and no confidence interval. *Fix:* add these to the engine result. Add a **bootstrap of trade P&L** and a **Monte Carlo trade-order shuffle** for drawdown distribution. Do not treat any result under about 100 closed trades as a conclusion.

**5. No out-of-sample discipline.** There is no walk-forward, train/test split, parameter sweep or deflated-Sharpe adjustment. The strategies have many knobs (periods, ATR multiples, R targets) and you are looking at 3 configurations after seeing data. *Fix:* freeze a holdout period the UI cannot see until a strategy is "locked". Add a walk-forward runner and a parameter-stability heatmap. A profitable strategy should also be profitable when nudged ±20% on each parameter.

### P1: backtest and paper do not model the market equally

**6. The two sizers disagree.**
- Backtest (`backtest.py`) sizes on mark-to-market equity.
- Paper (`order-estimate.ts:buySize`) sizes on `cash + min(entry, stop) × quantity`, which is a conservative floor.

The same strategy therefore takes different position sizes in backtest and paper, and paper results will not reconcile to the backtest. *Fix:* one shared sizing definition, and a parity test that replays the same candles through both paths.

**7. Position sizing has only one risk control.** Size = risk% ÷ stop distance, capped by cash. With a tight stop, one trade can consume nearly all cash (BAJFINANCE was cash-capped at 5 shares). There is no max notional per position as a % of equity, no cap on ADV participation (for example ≤1% of average daily volume), and no portfolio heat (sum of open risk). *Fix:* add `maxPositionPercent`, `maxAdvParticipation` and `maxOpenRiskPercent` to the risk schema, enforced identically in engine and paper.

**8. Simultaneous signals are ranked arbitrarily.** Backtest processes `sorted(events[at], key=x[0])`, so it goes by instrument-id order. With 184 stocks and 3 slots, which stocks fill first is decided by the id, not by signal quality, and paper has the same effect. *Fix:* rank candidates by a declared score (relative strength, ATR-normalised trend, liquidity), and test it against random ordering as a null.

**9. Costs and slippage are flat.**
- Fees are a single % per side. STT, stamp duty, exchange charges, GST and the per-scrip DP charge (about ₹13–16 per delivery sell) are not modelled. On a ₹1L account with 3 positions, DP charges on small exits are not negligible.
- Slippage is constant (0.02% or 0.05%) regardless of stock, volatility, time of day or order size. Intraday and open-of-bar fills are systematically worse than the average.
- Target sells (limit orders) also have slippage applied, which is over-conservative. Buy limits and target fills at gap-up opens are filled at the target price, not the better open, which is slightly conservative.

*Fix:* an itemised Indian-equity cost model (intraday vs delivery), and slippage as a function of spread proxy, ATR and participation.

**10. Portfolio-level risk is missing.** There is no daily loss limit, no drawdown circuit breaker, no consecutive-loss pause, no sector/correlation cap and no market-regime filter. Three positions in banks (ICICI, SBIN, BAJFINANCE) are one bet. *Fix:* portfolio guardrails in schema, backtest and paper, plus optional index-regime conditions (for example Nifty above its 200-day average) and a sector concentration cap. Sector data already exists in Dhan company snapshots.

### P1: live and paper execution risks

**11. Protective exits depend entirely on a healthy tick stream.** In `processPaperOrders`, `if (!sessionTime().open || feed.state !== 'live') return`. When the feed goes degraded, an open position has **no stop protection and nothing alerts you**. Protection also works through *orders*: a trigger creates a SELL order with 60-second expiry that fills on a *later* tick. That adds latency, and a fast move can skip the stop by more than the modelled slippage. *Fix:* feed-health alerting (push or email) when a position is held and ticks stop, a stale-feed policy (flatten or alarm), and stop fills that reflect worst-of(stop, next tick). Log realised stop slippage versus the model as a live calibration metric.

**12. Paper fills are optimistic in ways that matter.**
- Fills use the last-trade price plus fixed slippage, with no bid/ask or depth.
- There are no partial fills, no queueing and no rejected orders due to liquidity.
- Circuit-limit stocks (locked upper or lower) can be "filled" on ticks a real order could not execute against.

Before trusting paper P&L, compare paper fills against the actual quote or depth at fill time (`depth.service` exists in stock-details), and reject fills on circuit-locked or zero-depth instruments.

**13. Concurrency and single-point-of-failure risks.**
- A tick is processed per session with a Mongo transaction each, and decisions take one HTTP round trip per 5 stocks. `decisionTime >= expiresAt` silently drops signals when the engine is slow, and it only shows up as "missing or stale observations".
- A single worker lease means no failover. The stream cursor resets to "now" on restart, so ticks during downtime are never replayed (safe for fills, but stops are unmonitored during downtime).

*Fix:* measure decision latency per cycle, alert when signals are dropped for lateness, and add a heartbeat for the paper worker.

**14. Silent drops are not counted.** Several paths simply `continue` or `return` with no counter or reason: pending BUYs dropped when `maxPositions` is reached, the `unfilledLimits` counter, and stocks skipped because of insufficient warm-up. Report "signals generated → orders → fills → skipped, by reason" as a funnel for every report and session.

### P2: before real money, and hygiene

**15. Live-trading readiness.** There is no OMS (order state machine, idempotent client order IDs, broker reconciliation), no kill switch, no position and cash reconciliation against a broker, and no rate limiting. India's retail algo rules (SEBI/exchange framework: registration, static IP, order-rate thresholds) need an explicit compliance check. Everything today is paper-only, which is fine. Do not extend to live until items 1–10 are done.

**16. Model realism gaps flagged in the docs but unaddressed:** long-only, cash equity only (no shorting, no F&O), and no gap or halt handling for stocks in surveillance or ban.

**17. Trade the process, not the anecdote.** The paper sample is 14 fills in the workspace. Set a pre-registered promotion rule such as "≥ N closed trades, positive expectancy after costs with a lower confidence bound above zero, and paper-vs-backtest slippage within X" before any strategy is called validated.

**18. Dead or duplicated code** (from `strategy-builder-gaps-and-roadmap.md`): five unused strategy files, a mock `ScannerPage`, and three overlapping stop-management mechanisms. These do not affect P&L but raise the risk of mistakes in the stop logic, which is the most sensitive code path.

## 3. Suggested order of work

1. **Data integrity (items 1, 3):** corporate-action adjustment and intraday completeness gating. Nothing else is meaningful until this is done.
2. **Truthful metrics (items 4, 5, 2):** full statistics, a benchmark, holdout and walk-forward, and a point-in-time universe policy.
3. **Parity (items 6, 7, 8, 14):** a shared sizing module, exposure caps, candidate ranking and a signal funnel, with a backtest-versus-paper replay test.
4. **Cost and risk realism (items 9, 10):** an itemised cost model, slippage model and portfolio guardrails.
5. **Operational safety (items 11–13):** feed-health alerts, latency monitoring and fill-quality checks against depth.
6. Only then consider new strategies or live execution.

## 4. What is already good (keep)

- Causal, completed-bar-only indicators with warm-up requirements.
- Fill logic that never uses data from before an order was eligible.
- Fixed 1R defined at entry, stops that only tighten, and partial-target accounting reconciled to paise.
- Fail-closed handling of missing data, with explicit "unavailable" counters.
- Ledger reconciliation scripts (`verify-paper-ledger.ts`) and a broad automated test suite.
