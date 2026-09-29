# Stock charts and trade inspection

Stock names in Qualification, Signal Runner, paper positions, pending orders, paper order history and backtest exit fills open an interactive candlestick chart. Signals also offer a stock picker in each expanded monitoring row, so a stock can be inspected before it produces a signal.

## Controls

- Switch between candles and a line, or between 1m, 5m, 15m, 1h, 4h, daily, weekly and monthly views. Expand the drawer for more space.
- Indicators offers EMA, SMA, session VWAP, Wilder RSI, Wilder ATR, MACD (12/26/9) and relative volume. Moving averages, RSI, ATR and RVOL have configurable periods. VWAP is intraday only.
- Strategy indicators are enabled by default for paper/signal charts. They retain their saved periods, timeframes and completed-candle offsets. Higher timeframe values are aligned only after their source candle closes; changing the chart interval does not redefine the strategy.
- Custom indicators affect only the chart. They never save rules, create orders or change a running session.
- Blue circles identify signals; arrows identify actual paper fills. Selecting an event in the activity list locates its candle and shows its recorded values. Events outside loaded history remain in the list instead of being attached to the wrong candle.
- Entry, initial stop (if moved), current stop and remaining targets come from the current paper position. Target share counts account for partial exits and manual reductions. Booked P&L is scoped to the stock and session, includes fees, and is withheld if the activity window is truncated. Historical stop movements are not invented.
- Backtest arrows are separately labelled historical simulation. Partial exits belonging to the same entry share a single entry marker. The chart loads a historical window around the selected exit and does not receive live candles or submit orders. Historical candles may have been corrected since a report ran; saved backtest prices and results remain the reference.

## Data and boundaries

Open charts and visible stock rows register renewable demand with the shared market-feed worker. They reuse the same upstream price and provider session as paper monitoring. Motilal supplies the first 200 mapped stocks and Dhan supplies overflow/fallback. Chart demand never starts a paper session or enables execution. Minute previews are built before browser coalescing; a late subscription, provider switch, reconnect or timestamp/volume gap marks them incomplete. These research preview bars are never stored in the execution candle collection or used to make trading decisions. Closing/hiding a view releases its demand; crashed API instances expire after 25 seconds.

The browser merges provider history with received previews. Provider-confirmed minutes take precedence. Completed aggregated intervals missing constituent minutes are omitted and reported. Incomplete previews are excluded from indicators; strategy indicators use stored completed candles. Daily previews use the provider's session OHLCV; weekly/monthly previews combine constituent daily bars without double-counting volume. Stored daily candles take precedence over stale quotes.

Short intraday charts request the recent seven days; hourly charts request sixty days; daily-based charts request up to six years. Backtest charts anchor those windows to the selected exit. Older or unavailable events can still be inspected in the activity list or a longer timeframe. No price or missing candle is generated to fill a gap.

Paper chart context is a read-only MongoDB snapshot scoped to one strategy session and stock (latest 200 fills / 100 signals). Chart controls do not call trading mutations. Execution decisions continue to use the existing engine.

## Verification

- Frontend and backend builds and lint.
- Calculation tests: EMA/SMA, Wilder RSI/ATR, MACD warm-up, session VWAP, prior-volume RVOL, completed higher timeframes and offsets, signal/fill candle mapping, incomplete previews and daily volume merging.
- Backend tests: raw-tick preview extremes/volume, reconnect/out-of-order handling, chart aggregation with missing provider minutes and read-only isolation of paper stock/session history. Database tests use disposable databases.
- Browser coverage: Qualification, Signals, partial paper exits and moved stops, indicator controls, older order history, live previews/disconnects, backtest partial exits, responsive layouts and absence of trading writes.
- Real local workspace: BHARTIARTL chart inspected against current Dhan data with live price, strategy indicators and recorded position levels. No chart interaction placed or altered a paper order.

For the calculation-only suite: `node --import tsx --test frontend/tests/chart-model.unit.ts`. Browser suites: `npm run test:ui -- tests/paper-charts.spec.ts tests/stock-details.spec.ts tests/paper-readiness.spec.ts`.
