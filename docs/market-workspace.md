# Market workspace

## Stocks and watchlist

`/market-data/watchlists` browses active cash-equity listings from the imported instrument master. NSE and BSE listings remain separate, with the exchange visible. Search matches a symbol, company name or ISIN. Browsing is paginated in MongoDB; only the visible page requests live quotes from the shared feed.

The All stocks and Watchlist tabs share one personal watchlist, stored as `watchlists/personal`. Click the star to add or remove a stock. On first use, existing named lists are merged transactionally, without truncating their contents; originals remain archived. Migration runs only once so removed stocks are never reimported. Old list bookmarks open the merged list. New lists, renaming and deleting lists are no longer offered.

Additions are atomic and idempotent, with a 10,000-listing bound. Inactive saved listings remain removable. Watching a stock never modifies qualification, strategy eligibility, monitoring sessions or orders.

All stocks, Watchlist and monthly scan results offer **Add to qualification**. The action asks for your reason and requires a published list for the current month. The stock is marked **Manually added**, not as having passed the monthly rules. Qualification deduplicates NSE/BSE listings by ISIN; adding an already-qualified company is a no-op and never changes its source. Strategy signals and risk checks still control subsequent trading.

Click a stock to open the existing price, candle, indicator and company-details drawer. This works independently of qualification. The drawer states whether the stock is in the current published universe.

## Qualification results

**Not qualified** shows the latest completed current-month scan's non-passing results, excluding companies already in the published list. It separates failed conditions, missing required data and insufficient monthly history. Search, filtering, pagination, expandable checks, stock charts, watchlist stars and manual qualification are available. A warning identifies results generated with earlier saved rules.

Manual additions disappear from this view and appear in Qualified stocks. Removing a manual addition makes it eligible to appear again. **Review results** retains the original scan decisions and evidence. Only manually added qualified stocks can be removed; scan-qualified members remain protected.

## Qualified table

The table offers 10, 20, 50 or 100 rows per page and sorting by stock, qualification source, sector, delivery, last price and day change. Filters and sort changes reset pagination. Live subscriptions follow the sorted page, rather than the original array order.

Price sorting fetches quote snapshots for the full filtered list in batches of up to 100. Unavailable values sort last in either direction. Subsequent live ticks update prices without moving rows. **Refresh sort** obtains another snapshot and reorders the list. A stored historical price retains its historical-price label.

## Index updates

The index page and dashboard share one browser polling loop. Both the API and browser enforce the regular cash-market session (09:15–15:30 IST). After close, on weekends, and on configured trading holidays, the page reads saved snapshots and stops automatic polling. It resumes at the next regular opening. A manual refresh outside hours reads the cache, without initiating an exchange download. The same restriction applies to BSE chart downloads.

The authoritative schedule is `backend/src/shared/market-calendar.ts`, also used by paper execution. Its bundled 2026 holidays reference [NSE circular CMTR71775](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf). Unknown years fail closed until their calendar is configured; special sessions require explicit support. Existing downloads initiated during an open session may finish after the close. Stored timestamps are never advanced just because a user refreshed the page.

## Stock discovery

In **Stocks & watchlist → All stocks**, discovery groups filter the full active listing universe before ranking, search and pagination. The single personal watchlist is unchanged. Every group exposes its actual AND conditions in **View rules**, and every match has **Why included** with the saved inputs, source, observation time and reporting period where supplied.

| Group | All required conditions | Ranking |
| --- | --- | --- |
| Top gainers | Price ≥₹20, estimated session traded value ≥₹1 Cr, change >0% | Percentage gain descending |
| Top losers | Price ≥₹20, estimated session traded value ≥₹1 Cr, change <0% | Percentage change ascending |
| Most traded | Price ≥₹20, estimated session traded value ≥₹1 Cr | Estimated traded value descending |
| Session momentum | Price ≥₹20, estimated traded value ≥₹10 Cr, gain ≥2%, price > session VWAP | Percentage gain descending |
| Large companies | Market cap ≥₹20,000 Cr | Market cap descending |
| Mid-sized companies | ₹5,000 Cr ≤ market cap <₹20,000 Cr | Market cap descending |
| Smaller companies | ₹500 Cr ≤ market cap <₹5,000 Cr | Market cap descending |
| High ROE · low debt | Market cap ≥₹2,000 Cr, ROE ≥15%, 0 ≤ debt/equity ≤0.5 | ROE descending |

These market-cap bands are app filters, not official index classifications. Ratios need sector-specific interpretation. No group is a trade recommendation or a qualification decision. Missing and expired inputs are excluded and counted separately from valid non-matches; no missing ratio defaults to zero. No synthetic trending/popularity scores are used.

Session groups use Dhan `POST /marketfeed/quote`, in batches of at most 1,000 listings. Estimated traded value is volume × average price / 10,000,000, not reported exchange turnover. Each quote must carry a valid trade timestamp in the displayed session. A shared Redis allowance spaces requests by at least 1.7 seconds across discovery and stock details; provider rate limits establish a shared cooldown and discovery retries a batch once. A Redis lease prevents parallel bulk refreshes. Snapshot publication is atomic in MongoDB `stock_discovery_snapshots`, so readers never see half-written batches. Provider failures preserve existing results or publish available results with an incomplete-data warning.

On demand while the market is open, a shared snapshot refresh is allowed approximately every two minutes. The browser checks for completion and pauses when hidden. After close, one closing/initial snapshot may be collected; ongoing automatic refresh is paused on nights, weekends and known holidays. Explicit refresh respects the same cooldown. Old snapshots retain their session date and timestamps; current row quotes can be newer than the values used to rank the group. Company groups reuse the latest unexpired facts, including existing Dhan public ROE fallback precedence, and do not trigger bulk historical/company imports.

The exchange selector scopes all group counts and results. Both exchange listings of a company remain separate and labelled. Group bookmarks use `?group=...`; clearing a group preserves search/exchange filters. Star, stock chart and manual qualification actions work in every group. Manual qualification still requires a reason and preserves the scanned/manual distinction.

APIs: `GET /api/stock-discovery` (catalog, coverage, freshness), `GET /api/stock-discovery/stocks` (validated group, exchange, literal search, sorting and pagination). Tests: `stock-discovery.test.ts`, `stock-discovery.integration.test.ts`, discovery cases in `watchlists.spec.ts`.

After the close, NSE snapshot changes use the matching dated NSE daily report's `PREV_CLOSE` field, matched by symbol and series. This corrects observed broker net-change resets without substituting another exchange's price. The previous-close source is disclosed in each matching stock's evidence. If the reference is unavailable, NSE price and activity remain usable but percentage-change groups exclude that listing. Verified references are reused for that session rather than downloaded for each page.

## Dashboard

`GET /api/dashboard` reads real saved qualification, strategy, backtest and paper-trading data. The dashboard shows:

- Published stock count separately from the latest scan's results and data gaps.
- Monitoring sessions, execution modes, paused entries and saved revision differences.
- Open positions, pending/confirmation orders, and realized/unrealized/total paper P&L across paper accounts, including earlier accounts.
- Recent buy and sell signals with their recorded order state and date.
- Backtest revisions, periods and completion states, plus watchlist shortcuts.
- Actual index snapshots, including freshness and unavailable values.

P&L is all-time, not today's P&L. If any open position lacks a mark, total and unrealized P&L are unavailable rather than fabricated. Stale marks are disclosed; unrealized P&L excludes future exit costs. Dashboard reads do not start monitoring or submit trades. The dashboard is part of the real workspace and does not mount the demo runtime.

### Dashboard preferences

Open **Settings → Dashboard** or **Customize** on the dashboard. Preferences are workspace-wide and persist in MongoDB (`dashboard_preferences`), so reopening the app retains them. Appearance remains a separate device preference.

- Choose 1–8 supported NSE/BSE indices (including NIFTY 100), reorder them, and show or hide mini price charts. Unavailable provider values retain their existing status.
- Show, hide and reorder summary, market, monitoring, qualification, signal, backtest and watchlist sections. At least one section must remain visible.
- Choose and order summary cards; select comfortable or compact spacing.
- Configure monitoring rows per page, recent signal count and buy/sell filtering, and recent backtest count. Signal filters run before limiting results.
- Show or hide the single watchlist shortcut. Legacy pinned-list settings are normalized without resetting other dashboard preferences.

The layout preview reflects the draft. **Save dashboard** applies it; **Discard changes** reloads the last saved form values. **Restore defaults** first loads a draft that still requires saving. `GET/PUT /api/dashboard/preferences` validates selections and uses a revision check to reject conflicting saves from another window. Unsupported stored preferences fall back to defaults with a warning in Settings, without overwriting the saved record automatically.

Worker/feed problems and pending order-confirmation alerts remain outside configurable sections. These settings only change dashboard presentation; they do not modify trading rules, limits, sessions or orders. Hiding Market overview removes this view's index polling subscription. Any visible index page or popover still follows the shared market-hours-aware polling policy.

News is deferred.

## Regression coverage

- Backend: `watchlists.integration.test.ts`, `market-workspace.integration.test.ts`, `dashboard-preferences.integration.test.ts`, `deployment-scheduling.test.ts`, `indices.test.ts`.
- Browser: `watchlists.spec.ts`, `dashboard-recovery.spec.ts`, `dashboard-settings.spec.ts`, `market-indices.spec.ts`, `stock-details.spec.ts`.
- Database tests use disposable `quantforge_test_*` databases. The market-workspace integration test mocks provider requests and Redis reads; it must not run against trading state as test fixtures.
