# Market workspace

## Stocks and watchlists

`/market-data/watchlists` browses active cash-equity listings from the imported instrument master. NSE and BSE listings remain separate, with the exchange visible. Search matches a symbol, company name or ISIN. Browsing is paginated in MongoDB; only the visible page requests live quotes from the shared feed.

Named watchlists persist in the `watchlists` MongoDB collection. They support creating, renaming, deleting, adding stocks and removing stocks. A list holds up to 500 exchange listings; additions are atomic and idempotent. Inactive saved listings remain removable. Watching a stock never modifies qualification, strategy eligibility, monitoring sessions or orders.

Click a stock to open the existing price, candle, indicator and company-details drawer. This works independently of qualification. The drawer states whether the stock is in the current published universe.

## Qualified table

The table offers 10, 20, 50 or 100 rows per page and sorting by stock, qualification source, sector, delivery, last price and day change. Filters and sort changes reset pagination. Live subscriptions follow the sorted page, rather than the original array order.

Price sorting fetches quote snapshots for the full filtered list in batches of up to 100. Unavailable values sort last in either direction. Subsequent live ticks update prices without moving rows. **Refresh sort** obtains another snapshot and reorders the list. A stored historical price retains its historical-price label.

## Index updates

The index page and dashboard share one browser polling loop. Both the API and browser enforce the regular cash-market session (09:15–15:30 IST). After close, on weekends, and on configured trading holidays, the page reads saved snapshots and stops automatic polling. It resumes at the next regular opening. A manual refresh outside hours reads the cache, without initiating an exchange download. The same restriction applies to BSE chart downloads.

The authoritative schedule is `backend/src/shared/market-calendar.ts`, also used by paper execution. Its bundled 2026 holidays reference [NSE circular CMTR71775](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf). Unknown years fail closed until their calendar is configured; special sessions require explicit support. Existing downloads initiated during an open session may finish after the close. Stored timestamps are never advanced just because a user refreshed the page.

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
- Show the five recently updated watchlists or pin up to eight in a chosen order. Deleted pins are skipped on the dashboard and identified in Settings.

The layout preview reflects the draft. **Save dashboard** applies it; **Discard changes** reloads the last saved form values. **Restore defaults** first loads a draft that still requires saving. `GET/PUT /api/dashboard/preferences` validates selections and uses a revision check to reject conflicting saves from another window. Unsupported stored preferences fall back to defaults with a warning in Settings, without overwriting the saved record automatically.

Worker/feed problems and pending order-confirmation alerts remain outside configurable sections. These settings only change dashboard presentation; they do not modify trading rules, limits, sessions or orders. Hiding Market overview removes this view's index polling subscription. Any visible index page or popover still follows the shared market-hours-aware polling policy.

News is deferred.

## Regression coverage

- Backend: `watchlists.integration.test.ts`, `market-workspace.integration.test.ts`, `dashboard-preferences.integration.test.ts`, `deployment-scheduling.test.ts`, `indices.test.ts`.
- Browser: `watchlists.spec.ts`, `dashboard-recovery.spec.ts`, `dashboard-settings.spec.ts`, `market-indices.spec.ts`, `stock-details.spec.ts`.
- Database tests use disposable `quantforge_test_*` databases. The market-workspace integration test mocks provider requests and Redis reads; it must not run against trading state as test fixtures.
