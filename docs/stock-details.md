# Stock prices and chart details

Open **Qualification → Qualified stocks**. The current table page receives last prices and daily movement. Click a ticker or **Chart & details** for the research drawer. Previous/next follows the filtered list; closing the drawer preserves the list position and filters.

The chart uses **TradingView Lightweight Charts**, with candlesticks/line, volume and optional EMA 5/21. Intervals: 1m, 5m, 15m, daily, weekly and monthly. Zoom, pan and crosshair inspection are supported. This is the open-source charting library, not TradingView's licensed Advanced Charts terminal.

## Data flow

- `GET /api/stocks/quotes?ids=NSE:1023,...`: initial Dhan quote snapshot, then cached quotes. Maximum 100 instruments per request. A shared Redis permit enforces the quote endpoint's one-request-per-second limit. Snapshot metadata refreshes at least once a minute while requested, including previous close.
- `GET /api/stocks/stream?ids=...`: authenticated SSE to the browser, backed by one shared Dhan WebSocket per API process. Reference-counted subscriptions cover visible table stocks and open drawers. Batches contain at most 100 instruments; the local union is capped at 1,000. The socket closes after its final view disconnects. Credentials remain server-side. Background browser tabs stop streaming.
- `GET /api/stocks/:id/chart?timeframe=1d`: reuses stored Dhan candles, filling missing history through the shared rate-limited importer. Minute history refreshes no faster than 45 seconds; daily history no faster than an hour. UI refreshes chart history every minute. Interactive provider waits are bounded, returning stored candles with an explanation on failure.
- `GET /api/stocks/:id`: dated company facts, exchange/ISIN/index memberships and the actual published qualification context. Missing company data is fetched on demand using the existing daily receipt cache. Manually added stocks show their note and do not claim to pass the saved rule.

Research quotes use their own `quantforge:research:*` Redis keys. They **do not** publish execution ticks, replace Motilal subscriptions, start strategies or place/fill any orders.

## Time and availability

- **Live** requires an open stream, a verified trade timestamp less than 30 seconds old and receipt less than 15 seconds old. Disconnected, old and timestamp-less prices cannot be marked live.
- **Snapshot** is a recently retrieved REST quote, not a streaming claim. **Last received** retains the last valid quote through interruptions. **Historical close** is an explicitly dated fallback from stored daily data. Missing prices/metrics are shown as `—`, never zero.
- Dhan REST trade times are interpreted in IST. The verified live feed encodes IST wall-clock seconds; the binary timestamp is calibrated against the explicit REST timestamp or an unambiguous current candidate. Future/ambiguous timestamps are rejected. NSE and BSE security IDs remain exchange-qualified.
- Daily chart bars end at the last completed session. Intraday charts use completed minute data; 5m/15m buckets align to 09:15 IST and omit the currently forming bucket. Available provider candles are plotted without inventing missing candles. Weekly/monthly bars aggregate completed daily bars; the current week/month can still be forming. Monthly qualification remains based on completed months.
- The dashed **LTP** line updates from quotes independently of candle history; it does not fabricate a forming candle from an isolated tick. EMAs follow the selected chart timeframe, and are not the historical qualification cutoff values.
- Fundamental dates, quote timestamps and the original scan cutoff are separate. Live price changes never mutate the published monthly list.

## Deployment

The API runtime needs Node 24 (native WebSocket), an active saved Dhan session and Data API access. Keep stock SSE on the API process and disable proxy buffering. The current single-workspace API shares one provider socket; horizontal API scaling needs a dedicated quote gateway / Redis distribution so extra replicas do not consume Dhan's connection allowance.

Sources: [Dhan market quotes](https://dhanhq.co/docs/v2/market-quote/), [Dhan live feed](https://dhanhq.co/docs/v2/live-market-feed/), [Dhan history](https://dhanhq.co/docs/v2/historical-data/), [Lightweight Charts](https://tradingview.github.io/lightweight-charts/docs).

Charts use TradingView Lightweight Charts™. Copyright © 2026 TradingView, Inc. The chart includes TradingView attribution and a link to https://www.tradingview.com/.
