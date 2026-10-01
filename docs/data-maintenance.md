# Scheduled data refreshes

Every dataset that research pages and rules read is refreshed automatically by the data worker (`src/worker.ts`). Refreshes run on a separate BullMQ queue, `quantforge-maintenance`, with concurrency 1, so a multi-hour refresh never delays a qualification run or backtest on `quantforge-jobs`. Provider rate limits (Dhan API, Dhan public pages, exchange filings) are enforced through Redis and shared by both queues.

| Task | Schedule (IST) | What it does | Missed-run catch-up on worker start |
|---|---|---|---|
| `daily-closes` | Weekdays 19:30 | NSE `sec_bhavdata_full` and BSE UDiFF bhavcopy closes for the last 10 days | Backfills 400 days the first time; otherwise if no run in 2 days |
| `memberships` | Mondays 07:00 | 42 NSE/BSE index constituent files (broad, size-tier, sector and theme) | If index tags expire within 2 days |
| `fundamentals` | Saturdays 02:00 | Dhan company info for every primary listing; ROE falls back to Dhan's public company page | If no run in 8 days |
| `news` | Every 30 min, 06:00–23:30 | Headlines, NSE filings, per-company Google News, AI scoring and news facts ([news.md](news.md)) | If no run in the last hour |
| `pledge` | Sundays 08:00 | NSE/BSE promoter pledge disclosures | If no run in 8 days |
| `delivery-nse`, `delivery-bse` | 1st of the month 06:00 | Previous month's delivery %, turnover and traded value | If the previous month is not published |
| `monthly-universe-refresh` | 1st of the month 02:00 | Instrument master ([monthly-universe.md](monthly-universe.md)) | Existing catch-up |

Each task is idempotent and only fetches what is missing or expired (dataset receipts and source artifacts are reused). A failed job retries three times with exponential backoff (10 minutes and up); after that the next scheduled run resumes the work. **Connections & Data → Scheduled refreshes** shows the schedule, next run, last result and last error. A newly added schedule appears once the worker restarts; manual imports remain available.

## Daily closes

`daily_closes` stores one unadjusted exchange close per company (ISIN) and session: `{ isin, date, close, prevClose, exchange }`. NSE is the reference series for dual-listed companies (it overwrites BSE); BSE fills BSE-only companies. A weekday with no file is recorded as closed once it is more than three days old. BSE either serves a file for another date (detected by its trade date) or times out for a missing file; a BSE timeout on a day NSE recorded as closed is a holiday. A BSE file still missing after ten days on a normal NSE session is recorded as unavailable and not retried (only BSE-only companies lose that session). Rows older than three years are pruned.

These closes are **research data only**. They are not split/bonus adjusted and are never used as backtest candles (`candles`). Consumers must tolerate corporate-action jumps; related-stock co-movement ignores any daily move above ±35%. The NSE delivery import stores closes from the same file it already downloads.

## Company snapshots

Dhan's company endpoint currently returns shareholding (`SHP`) without `REPORTING_PERIOD`. Such values are stored as an observed snapshot valid for 35 days, never backdated to a quarter. A dated period keeps the 150-day quarter window. Also stored: `dividendYield`, `ebitda`, `high52w`, `low52w`. Dhan returns `ROE` as null, so ROE comes from the public company page fallback during the weekly run.

## Index membership resilience

A single unavailable index no longer blocks the import. Its constituents from the previous snapshot (up to 21 days old) are carried forward and reported as `carriedForward`. An index with neither fresh nor carried constituents is reported as `unavailable` and omitted from `coverage`. Rule capabilities only offer indices in the latest coverage, so `NOT IN` never evaluates against a gap. The import fails if fewer than half of the indices are covered. Labelled dummy (demerger placeholder) rows with `DU…` codes are skipped.

## Known gaps

- About 300 companies (mostly SME/new listings) have no sector or industry from Dhan. NSE's per-company classification API needs a browser session cookie; the exchange readers deliberately stay cookie-free, so this is not collected.
- Company metrics and index membership are current snapshots, not point-in-time history. They must not be used to reconstruct what was known in the past.
