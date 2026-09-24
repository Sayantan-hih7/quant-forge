# Strategy → backtest → paper monitoring

Three editable research strategies are saved in the local workspace. They are examples for testing the application, not claims of future profitability. The manual builder and AI assistant remain available.

| Strategy | Buy rules (all required) | Sell rule | Risk settings |
| --- | --- | --- | --- |
| Intraday · VWAP momentum | Daily close > SMA 200; 5-minute close > VWAP; EMA 5 > EMA 20; relative volume ≥ 1.3 | 5-minute close < VWAP OR EMA 5 < EMA 20 | ₹100,000 initial capital; 0.5% risk; 2 × ATR(14) on 5m; 2R target; no overnight holding |
| Swing · Trend pullback | Daily close > SMA 200 and EMA 20; EMA 5 > EMA 20; close within 3% of EMA 20; RSI ≥ 50 | Daily close < EMA 20 OR RSI < 45 | ₹100,000 initial capital; 1% risk; 2.5 × daily ATR(14); 3R target; overnight allowed |
| Long term · Weekly trend | Daily close > SMA 200; completed weekly close > EMA 20; weekly EMA 5 > EMA 20 | Completed weekly close < weekly EMA 20 | ₹100,000 initial capital; 1% risk; 10% trailing stop; 5R target; overnight allowed |

Each allows at most four simultaneous positions. Intraday slippage is 0.02% per fill and estimated fees 0.03% per side; swing/long-term use 0.05% slippage and 0.1% estimated fees per side. Fees are estimates, not a complete contract-note tax calculation.

## Verified local research, 24 September 2026

One fixed cohort was selected from the published qualified list by monthly turnover before inspecting results: **SBIN, LAURUSLABS, AXISBANK, KOTAKBANK, HINDALCO**. Dhan historical candles were downloaded through 23 September 2026 and stored in MongoDB. These runs did not use generated candles or fabricated fills.

| Strategy | Test period | Closed trades | Ending equity | Net P&L | Maximum drawdown |
| --- | --- | ---: | ---: | ---: | ---: |
| Intraday | 25 Aug–23 Sep 2026 | 115 | ₹101,841.42 | ₹1,841.42 | 3.05% |
| Swing (revision 2) | 24 Sep 2025–23 Sep 2026 | 53 | ₹115,323.80 | ₹15,323.80 | 5.68% |
| Long term | 25 Sep 2023–23 Sep 2026 | 90 | ₹116,068.66 | ₹16,068.66 | 7.13% |

All three completed without unavailable rule decisions. Swing finished with one open position; long-term with two. Ending equity includes their final stored closing valuations. Intraday finished flat. Different test lengths mean these returns are not directly comparable.

The current stock list and liquidity ranking were chosen after much of the replay period, so all these reports carry **selection/survivorship bias**. They demonstrate the mechanics, not an unbiased historical selection process. Historical-universe mode requires lists actually recorded at the time. Corporate-action share/cash adjustments and dividends are not separately modelled.

## How to use the screens

1. **Algo Strategies → Trading rules**: open one of the three cards. Inspect/edit Buy, Sell and Risk; save the pair together. The examples never overwrite an existing strategy when opened.
2. **Backtests**: the latest completed report for the selected strategy opens automatically. Inspect the equity curve, dated trades, remaining positions, and Data & assumptions. For another run, select stocks and dates and choose **Prepare data & run backtest**. The worker first downloads missing daily/minute history and indicator warm-up, then calculates the report. Progress distinguishes preparation from calculation. Completed downloads are reused.
3. **Review in Signal Runner**: carries the tested strategy and stock scope into the runner. **Check saved candles** evaluates both sides at the latest stored candle and never creates an order. It displays the candle timestamp and expandable condition checks.
4. **Start paper monitoring**: creates a separate paper ledger using a saved strategy snapshot and explicit stock scope. Confirmation mode waits for approval; automatic mode queues paper orders. Held shares keep their exits even if they leave qualification. Manual interventions pause automatic entries. Protective exits remain automatic.
5. **Stop monitoring** cancels unfilled orders and lets a new session use a newly saved revision. Held positions must be closed first so their exits are not abandoned.

The three initial paper sessions use confirmation mode. On verification, Motilal login succeeded but the broker returned a **broadcast limit of 0**. Therefore live execution is blocked and the sessions show **Waiting for feed**. Dhan research quotes are separate from the execution feed. No real broker order path exists; no live paper fill is claimed while Motilal cannot supply ticks.

## Implementation and limits

- Backend: native ESM TypeScript, Mongoose, Axios/interceptors, BullMQ and Redis. Calculation engine: Python/Pandas.
- Stock scope: 1–100 qualified stocks per backtest or paper session; each session's held stocks retain sell monitoring.
- Intraday backtests: at most 90 calendar days; daily replay: at most five years. The calculation also has a 150,000 raw-candle budget; reduce stock scope if exceeded.
- Indicator warm-up includes both operands and higher-timeframe context. Daily-only runs do not load unrelated minute data.
- Signals use completed candles; fills use the next stored bar open, with configured slippage/fees. If a candle touches both protective levels, stop loss wins. No final forced liquidation is used for overnight strategies.
- The read-only runner check anchors higher-timeframe inputs to the inspected candle's close, preventing later daily data from leaking into an older intraday check.
- Verified with backend unit/integration checks, Python engine regression tests, and actual browser navigation across all three examples; the mobile report was checked at 390px width.

Source layout: `backend/src/modules/strategies/config/research-presets.ts`, `backend/src/modules/backtesting/services/`, `backend/src/modules/paper-trading/services/`, and matching frontend modules. Local verification artifacts are in `.tools/artifacts/research-*`.
