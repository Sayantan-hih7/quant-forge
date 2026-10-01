# Stock prices and chart details

Open **Qualification → Qualified stocks**. The current table page receives last prices and daily movement. Click a ticker or **Chart & details** for the research drawer. Previous/next follows the filtered list; closing the drawer preserves the list position and filters.

## Recent and related stocks

**Market Data → Stocks & watchlist** shows the last four viewed companies above the stock browser; **Show all** expands to the last ten. Viewing a stock in the shared detail drawer records it after its listing is loaded. History stays in this browser, survives reloads, and can be cleared. ISIN deduplication keeps one entry per security and reopens its most recently viewed exchange.

The stock **Overview → Related stocks** section starts with a **This company** strip (size band, sector › industry, rank in sector, market cap, P/E, ROCE, D/E) as the comparison baseline, then offers three lenses of up to twelve companies (six shown, **Show more** for the rest):

- **Closest peers** — same reported industry *or* sector (industries can cross Dhan sectors, e.g. Energy › Oil Exploration). Ranked by a weighted similarity: industry (3), market-cap ratio (3, with a small bonus for the same size band within 4×), P/E (1.5), ROCE (1.25), leverage (1), index co-membership (1), ROE (0.75), average daily turnover (0.75), P/B (0.5). A missing value scores 0.3, like a typical unrelated company, so sparse data neither wins nor sinks a peer. Where both companies have at least 60 shared sessions in the last 400 days of exchange closes (`daily_closes`, refreshed every weekday for the whole market; stored Dhan candles fill in for a company not yet covered), the correlation of daily log returns lifts the score slightly (ρ above 0.3) and appears as **Moves together** from ρ 0.5. Daily moves above ±35% (splits/bonuses in unadjusted closes) are ignored. Missing history never lowers a score, and this section never downloads history. Dividend yield (weight 0.5) is also compared.
- **Other large/mid/small/micro caps** — the same size band outside the sector (or within 2× market cap when bands are unavailable), ranked by financial profile. Useful for comparing businesses of the same scale or diversifying.
- **Sector leaders** — the largest companies in the sector by saved market cap.

Each card shows the size band, industry, key metrics, a match strength (close ≥ 0.72, good ≥ 0.55, otherwise partial; not shown for leaders) and up to three reasons it matched. **Size bands** use the SEBI/AMFI rank method on one market cap per ISIN: ranks 1–100 large, 101–250 mid, 251–500 small, and 501+ micro (NIFTY Microcap convention; SEBI counts these as small cap). Bands are withheld when fewer than 750 companies have a saved market cap, and may differ from AMFI's official semi-annual list. Unknown/unclassified sectors produce an explanation rather than unrelated suggestions. Duplicate series and the current company's other listing are excluded.

`GET /api/stocks/:id/related` reads existing, dated company facts (sector, industry, market cap, P/E, P/B, ROE, ROCE, D/E, turnover, index membership), sharing a five-minute peer-data cache, plus stored daily closes for the candidate pool. It does not download a new universe or start scans. Opening a related stock keeps the original list in place and offers **Back to [original stock]**. Original paper fills, position controls and strategy markers are hidden when researching a different company and restored on return.

The chart uses **TradingView Lightweight Charts**, with candlesticks/line, volume and optional EMA 5/21. Intervals: 1m, 5m, 15m, daily, weekly and monthly. Zoom, pan and crosshair inspection are supported. This is the open-source charting library, not TradingView's licensed Advanced Charts terminal.

## Data flow

- `GET /api/stocks/quotes?ids=NSE:1023,...`: initial Dhan quote snapshot, then cached quotes. Maximum 100 instruments per request. A shared Redis permit enforces the quote endpoint's one-request-per-second limit. Snapshot metadata refreshes at least once a minute while requested, including previous close.
- `GET /api/stocks/stream?ids=...`: authenticated SSE to the browser, backed by one shared Dhan WebSocket per API process. Reference-counted subscriptions cover visible table stocks and open drawers. Batches contain at most 100 instruments; the local union is capped at 1,000. The socket closes after its final view disconnects. Credentials remain server-side. Background browser tabs stop streaming.
- `GET /api/stocks/:id/chart?timeframe=1d`: reuses stored Dhan candles, filling missing history through the shared rate-limited importer. Minute history refreshes no faster than 45 seconds; daily history no faster than an hour. UI refreshes chart history every minute. Interactive provider waits are bounded, returning stored candles with an explanation on failure.
- `GET /api/stocks/:id`: dated company facts, exchange/ISIN/index memberships and the actual published qualification context. Missing company data is fetched on demand using the existing daily receipt cache. Manually added stocks show their note and do not claim to pass the saved rule.

Research quotes use their own `quantforge:research:*` Redis keys. They **do not** publish execution ticks, replace Motilal subscriptions, start strategies or place/fill any orders.

## Time and availability

- **Live** requires an open stream, a verified trade timestamp less than 30 seconds old and receipt less than 15 seconds old. Disconnected, old and timestamp-less prices cannot be marked live.
- Streamed changes flash briefly: green when a value rises, red when it falls (price, change, session high/low, volume, average price, circuits, depth price/quantity). Reduced-motion settings show the colour without animation. Market depth shows a pulsing **Live** tag while the stream delivers order-book updates.
- **Snapshot** is a recently retrieved REST quote, not a streaming claim. **Last received** retains the last valid quote through interruptions. **Historical close** is an explicitly dated fallback from stored daily data. Missing prices/metrics are shown as `—`, never zero.
- Dhan REST trade times are interpreted in IST. The verified live feed encodes IST wall-clock seconds; the binary timestamp is calibrated against the explicit REST timestamp or an unambiguous current candidate. Future/ambiguous timestamps are rejected. NSE and BSE security IDs remain exchange-qualified.
- Daily chart bars end at the last completed session. Intraday charts use completed minute data; 5m/15m buckets align to 09:15 IST and omit the currently forming bucket. Available provider candles are plotted without inventing missing candles. Weekly/monthly bars aggregate completed daily bars; the current week/month can still be forming. Monthly qualification remains based on completed months.
- The dashed **LTP** line updates from quotes independently of candle history; it does not fabricate a forming candle from an isolated tick. EMAs follow the selected chart timeframe, and are not the historical qualification cutoff values.
- Fundamental dates, quote timestamps and the original scan cutoff are separate. Live price changes never mutate the published monthly list.

## Deployment

The API runtime needs Node 24 (native WebSocket), an active saved Dhan session and Data API access. Keep stock SSE on the API process and disable proxy buffering. The current single-workspace API shares one provider socket; horizontal API scaling needs a dedicated quote gateway / Redis distribution so extra replicas do not consume Dhan's connection allowance.

Sources: [Dhan market quotes](https://dhanhq.co/docs/v2/market-quote/), [Dhan live feed](https://dhanhq.co/docs/v2/live-market-feed/), [Dhan history](https://dhanhq.co/docs/v2/historical-data/), [Lightweight Charts](https://tradingview.github.io/lightweight-charts/docs).

Charts use TradingView Lightweight Charts™. Copyright © 2026 TradingView, Inc. The chart includes TradingView attribution and a link to https://www.tradingview.com/.
