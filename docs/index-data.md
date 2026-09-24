# Index data

`backend/src/modules/market-indices` owns providers, parsers, MongoDB caches, controllers and routes. All application code is TypeScript ESM. The UI uses the existing Axios client, a shared Zustand subscription and Recharts. No Motilal login or Dhan token is needed for this page.

| Data | Primary source | Alternative / fallback |
| --- | --- | --- |
| NSE intraday snapshots | `www.nseindia.com/api/allIndices` | NSE Indices `liveindexsa.niftyindices.com/jsonfiles/LiveIndicesWatch.json`, using its published trading-name mapping |
| NSE daily-only closes | `nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv` | Last successfully saved dated report |
| BSE intraday snapshots | `mservice.bseindia.com/BseIndiaAPI/api/IndexMovers/w` | BSE's `api.bseindia.com` host, then saved data |
| BSE daily-only closes and detailed charts | `www.bseindices.com/AsiaIndexAPI/api/AsiaIndicesGraphData/w` | Collected actual snapshots / last saved chart |

Verified on 23 September 2026: 57 NSE indices (45 snapshots, 12 daily closes), 57 BSE indices (48 snapshots, 9 daily closes). This is price coverage; BSE's snapshot endpoint does not supply open/high/low/52-week ranges. These remain null rather than being inferred from sampled chart points. NSE daily-only indices likewise do not have intraday OHLC.

`GET /api/market-indices` returns saved data immediately and starts a bounded refresh when due. MongoDB retains the last good values across restarts. Redis leases and per-exchange cooldowns deduplicate requests across clients. One exchange's outage does not remove the other exchange's quotes. Background requests are read-only and never enter the paper order/fill path.

Snapshot refresh is limited to once per 15 seconds per exchange; daily-source checks to once per hour. The browser polls briefly while a refresh is in progress, then every 15 seconds, and pauses when hidden or when the user disables auto-update. Manual Refresh remains available. Prices briefly highlight up/down movements from the previous observation. Public data is labelled **Snapshot**, not guaranteed streaming/live execution data. **Daily close** carries the actual report date; stale snapshots are **Last saved**. HTTP retrieval time is distinct from the provider timestamp. Old or future-dated observations cannot overwrite newer valid quotes.

The official NSE page exposes a public streaming URL for derivatives/broad-market indices, but the local server handshake returned HTTP 403. No working WebSocket connection is claimed. The functional exchange snapshot adapters continue independently. NSE reference-day/week/month/year values, actual reference dates, advancing/declining counts and supplied valuation metrics are exposed in the detail drawer; unsupported BSE fields stay unavailable.

`GET /api/market-indices/chart?id=...` adds BSE intraday history on demand. Overview sparklines use collected, timestamped snapshots or published daily points; they never generate intermediate prices. NSE's inspected intraday chart file was dated December 2025, so it is deliberately not shown next to September 2026 quotes. A newly collected chart needs two points. BSE auction values (`value1`) are excluded from regular-session charts; daily closes use actual final dated points, not graph header values. Charts explicitly state their time range and basis.

The curated category/derivatives metadata remains separate from price providers and keeps existing links stable. Unavailable entries stay searchable and count separately from unchanged prices. CSV exports include each observation's original timestamp, source URL and retrieval time.

These public website adapters support the current local research/paper UI. Before public/commercial deployment, verify exchange/vendor data licensing and move to an entitled contracted feed where required; website availability and coverage are not an SLA.
