# Rule and data capability audit

Updated 28 September 2026. This describes implemented capabilities, not a promise that every stock has complete downloaded data.

## What is connected

| Trader's request | Input and implementation | Status |
| --- | --- | --- |
| EMA 9 above EMA 21, RSI 60, ATR 10 | Cached Dhan candles; configurable periods in the common calculation engine | Supported in the manual builder and AI drafts |
| Yesterday's high / previous candle's close | OHLC series with a completed-candle offset | Supported; daily offset 0 already refers to the latest completed session during intraday trading |
| Break above the previous 20-candle high | Rolling high, period 20, offset 1; compare to current completed close | Supported; excludes the signal candle from resistance |
| Within 20% of the 52-week high | Rolling **364-day** high, using daily candles even in monthly qualification | Supported; requires a full year's history, not 52 monthly bars |
| At least 70% of a candle's body above EMA 21 | Portion of the open-to-close body above that candle's EMA, excluding wicks | Supported; a zero-body candle is unavailable for this measurement |
| Volume above twice its previous 20-candle average | Volume compared with `avgVolume`, multiplier 2; average excludes the evaluated candle | Supported across the permitted timeframes |
| Last completed day's turnover above ₹20 crore | Actual NSE/BSE session turnover from the existing exchange report parsers | Supported as `dailyTurnover`; never approximated using close × volume |
| Average turnover across the last 20 sessions | Complete session reports aligned to daily candles | Supported as `avgDailyTurnover`; an absent report makes the window unavailable |
| Monthly average daily turnover | Existing imported monthly exchange aggregate | Preserved as `turnover`; old rules retain their meaning |
| Market cap, debt/equity, ROE, ROCE, P/E, promoter and institutional holdings | Existing dated company observations and source fallbacks | Exposed where a source is integrated; per-stock coverage and freshness still matter |
| Promoter pledge | Existing exchange filings and verified no-promoter handling | Coverage-dependent; missing is never assumed zero |
| Index and sector membership | Existing imported, dated membership/company snapshots | Monthly categorical rules; current snapshots cannot establish historical membership |

Daily turnover reports are fetched only when an active strategy/backtest needs them. One exchange file serves every matching stock; MongoDB receipts allow reuse. Downloads run during data preparation, not inside each signal evaluation. Failed requests have a retry delay. These reports are additional to Motilal/Dhan streaming prices; they do not replace the live feed.

Report preparation continues across dates and exchanges when a provider file is missing or malformed. Backtests retain a count and list of unavailable report dates; paper history remains partial and retries later. Database failures still fail the operation. Existing cached rows keep their original `knownAt` timestamps. Missing-input messages name the actual missing operand, its period and candle offset, including when it is on the comparison side.

Signal Runner displays execution readiness before monitoring, using quote coverage for the selected stocks. A running candle monitor does not imply paper orders can fill: fills and protective exits require fresh execution quotes during market hours. Existing sessions show selected, currently qualified, excluded and held stocks separately. Excluded stocks cannot receive new buys, while held shares retain exit monitoring. Saved stock selections change only through user actions. Execution-feed subscriptions are managed automatically for active paper sessions, pending orders and held positions; they restore after restarts. An explicit feed pause remains paused until monitoring is started or resumed.

Official source contracts: [Dhan historical candles](https://dhanhq.co/docs/v2/historical-data/) provide OHLCV. Actual turnover and delivery come from [NSE reports](https://www.nseindia.com/all-reports) and the application's existing BSE gross-delivery report integration.

## Meaning of periods and offsets

- Periods count candles of the selected timeframe. EMA 21 on Monthly means 21 completed months.
- Offset 0 means the latest completed candle; offset 1 means the candle before it. An offset shifts the computed indicator, not the order execution time.
- `highestHigh` includes the evaluated candle unless offset 1 is chosen. `avgVolume` always excludes that candle. `avgDailyTurnover` includes the latest completed day's report.
- Monthly qualification still accepts only monthly technical observations and dated company/exchange facts. Daily turnover conditions belong in Algo Strategies.
- Configurable indicator periods default to their catalogue values when absent. Previously saved fixed fields such as `ema5`, `ema21` and `sma200` remain compatible.

## Remaining gaps and their required work

| Request | What is still required |
| --- | --- |
| Cup-and-handle, VCP, six-month resistance with multiple touches | Explicit, testable definitions for touches, tolerances, consolidation and breakout. A rolling high is available but must not silently replace a chart pattern. |
| News sentiment, earnings surprise, analyst upgrades | A reliable dated feed, entity mapping, publication timestamps and historical archives. OHLCV cannot supply these facts. |
| Revenue/profit growth across quarters | Consistent financial statement periods, standalone/consolidated basis and verified publication dates. Do not infer absent financials from price candles. |
| Relative strength versus an index or sector | Benchmark candle history aligned to stock sessions, plus a precise relative-strength formula. |
| “Yesterday's turnover” on the same daily candle close | The report may be published after close. Use the previous published session if that is the intended rule, or intraday evaluation on the following session. The app does not pretend the closing report was known earlier. |
| Arbitrary proprietary formulas | A bounded expression language, allowed functions, validation, history planning and calculation tests. The AI cannot install executable code from chat. |
| Historically correct fundamentals/universes for years of backtests | Point-in-time archives. Downloading today's snapshot does not reconstruct what was known in the past. |
| Uniform split/bonus-adjusted comparisons | A verified corporate-action policy across historical candles and live observations. Provider adjustment conventions need explicit reconciliation. |

The AI receives the supported catalogue and the editable draft, not live market research. It must explain a missing capability, ask only relevant questions and request approval before substituting another measurement. More data does not resolve an ambiguous strategy definition by itself.

## Backtest and data limits

Reports retain their verified `knownAt` timestamp. A file first obtained today is unavailable to a backtest decision from last month. Fetching that archive now does not remove this restriction. Historical runs can therefore report missing inputs even though a current strategy can use them. Missing values never pass conditions by default.

New listings need sufficient completed candles for each rule. A 21-month EMA, an offset and a crossover can require more than 21 months. History preparation accounts for each operand independently and adds indicator warm-up; insufficient history remains explicit.

The catalogue lives in `packages/rule-catalog/fields.json`; frontend forms, AI metadata and Python validation/calculation use it. TypeScript and Python tests check parameter validation, calculation parity, report timestamps and history requirements. Provider outages and live Gemini response quality remain external dependencies.
