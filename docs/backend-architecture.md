# Backend architecture

One local workspace, long-only NSE/BSE cash equities, through paper trading. All Node application modules are TypeScript native ESM. Mongoose owns persistence; shared Axios clients add authentication and sanitize provider errors through interceptors.

## Processes and persistence

- `server.ts`: Express API, local workspace session, feature routes and browser SSE.
- `worker.ts`: BullMQ durable source imports, monthly qualification and Python backtest jobs.
- `feed.ts`: isolated Motilal SDK child, authenticated subscriptions, all-tick minute aggregation, Redis quote cache and a bounded tick stream. Pub/Sub is used for expendable UI notifications.
- `paper.ts`: independent paper worker; rule decisions and durable order/position accounting. It never calls broker order APIs.
- `engine/quantforge`: Python indicators, completed-timeframe aggregation, rule evaluation and chronological backtests. No broker credentials or MongoDB access.

MongoDB stores instrument IDs/mappings, candles, dated facts, source receipts, rules, scan results, monthly snapshots, paired strategy revisions, backtests and paper ledger records. Candle imports can refresh provider history; they are not immutable point-in-time price versions. Fact collection time and reporting period are distinct. MongoDB replica-set transactions protect universe publication, manual edits, strategy revisions and paper fills. Unique signal/order keys and concurrent transaction retries prevent duplicate ledger entries.

Redis stores BullMQ jobs, leases, short-lived authenticated workspace sessions, latest quotes, a bounded tick stream and expendable notifications. MongoDB remains the accounting authority. On restart, paper processing begins with new ticks; missed historical ticks never turn into retroactive fills.

## Source mapping

| Data | Adapter |
| --- | --- |
| NSE/BSE cash-equity identity | Public Dhan detailed master; ISIN/exchange/security ID |
| Motilal subscription code | Motilal exchange CSV, joined by exchange/ISIN and verified code |
| Live LTP and cumulative volume | Isolated Motilal broadcast SDK; no fabricated timestamps |
| Daily/one-minute OHLCV | Dhan Data API, bounded request rate and date windows |
| Market cap, valuation, debt/equity, profitability, ownership | Dhan `/v2/data/companyinfo`; dated snapshots |
| Missing ROE / ROCE | Dhan public company financial pages, matched by ISIN; reported annual ratios or ROE calculated from matching annual statements. Cached up to seven days; observation time is never backdated. See [monthly qualification](monthly-qualification.md). |
| Monthly turnover, volume-weighted delivery | Complete NSE/BSE daily report sets |
| Promoter encumbrance / pledge limit | NSE consolidated disclosures, then per-company NSE equity/SME XBRL and BSE shareholding detail/summary. Identity, report period and promoter denominator are checked; no-promoter companies retain N/A. |
| Index memberships | Configured official NIFTY/BSE constituent sources; 22-index catalogue |
| Index prices and charts | Independent NSE/NSE Indices/BSE website adapters; 114 curated indices, with dated daily reports for daily-only indices and persisted fallback data. See [index data](index-data.md). |
| Growth/news/patterns/F&O | Unsupported until verified source adapters exist |

Broker login uses password/PAN or other supported 2FA, TOTP/OTP, then a separate access-token request. Retail broadcast-limit requests omit the client code; including it returns MO2031. SDK 3.1 discards the limit method's response, so its Axios instance is observed for that response only. A zero limit is displayed explicitly and does not fall back to a made-up entitlement.

## Evaluation and execution

Monthly scans freeze the saved rule and collection cutoff, evaluate primary company listings in batches, and use completed monthly technical candles plus dated available facts. Users review missing coverage before publishing. Manual stocks retain independent notes, without a claim that they passed the rule. Monthly scheduling is currently manual.

Trading decisions evaluate the published current-month entry universe plus held positions for exits. Sessions pin the original buy/sell/risk snapshot. Five-stock calculation batches limit payload size. Signal IDs include the session, stock, side and candle close. The runner reports stale/missing observations and waits for actual data.

Paper orders require a later fresh Motilal quote. Account cash is integer paise; every fill updates orders, positions and session cash atomically. Long-only checks, risk sizing, maximum open positions, entry membership, fees and slippage apply to manual and strategy orders. Manual intervention pauses automatic entries. Stops, targets and session exits bypass confirmation because they protect already-held paper positions. There are no broker orders.

The feed processes each tick before coalescing browser quotes. Minute candles reject startup fragments and gaps. A bounded Redis tick stream preserves intrabatch stop crossings for paper processing. Restart/outage gaps need explicit history backfill; automated repair is not implemented. Missing ticks cannot guarantee a fill or prevent a gap beyond a stop.

Backtests precompute causal indicator series, select observations whose bars have closed at each decision, fill on the next stored bar open, and process portfolio cash/positions chronologically. Same-bar stop/target ambiguity chooses the stop. Gaps through a stop use the worse opening price. Trailing highs affect subsequent bars. Final open positions are marked, not forced closed. Historical list membership is evaluated at each timestamp; current-list research is labelled biased. Missing stock history fails a report rather than yielding fake results. Partial-history completeness, corporate actions, liquidity/slippage realism and exchange holidays remain validation limits.

## Deployment boundary

The API binds to loopback locally. Cookie bootstrap verifies the exact local origin and is disabled in production. Production workspace authentication must be added before exposing the UI/API publicly. Tokens are encrypted at rest; credentials stay in private environment variables and the SDK child never forwards its raw logs/errors. Python receives only its engine token and calculation inputs.

See [deployment preparation](deployment.md). Docker/Compose uses separate local databases; the scrapped project is read-only reference material.
