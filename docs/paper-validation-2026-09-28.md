# Paper trading validation — 28 September 2026

The local workspace now has a freshly published monthly universe, three saved and backtested strategies, and automatic paper monitoring. Market prices are real Dhan data; cash, orders and fills are simulated. These are research configurations, not strategies established to be profitable.

## Data and monthly qualification

The user-cancelled scan `f2e543c1-3491-4765-a632-9bac7cba7f66` was left cancelled. Before changing the setup, a credential-free backup was saved at `.tools/workspace-backups/2026-09-28-before-paper-setup.json`.

Monthly rule revision 6 uses AND across these conditions:

| Condition | Threshold |
| --- | --- |
| Market capitalization | At least ₹5,000 crore |
| Completed month's total traded value | At least ₹500 crore — this is not daily average turnover |
| Reported ROE | At least 12% |
| Reported promoter pledge | At most 5% |
| Completed monthly close | At least ₹100 |
| Monthly close versus monthly EMA 21 | Close at or above EMA 21 |
| Monthly EMA 5 versus monthly EMA 21 | EMA 5 at or above EMA 21 |

Scan `23ea631f-8e28-42f9-8c66-b4569c64a201` evaluated 5,458 companies. All seven conditions were checked for every passing stock before publication:

- **184 qualified and published** for September 2026.
- 5,225 rejected by the conditions.
- 23 excluded because required data is unavailable.
- 26 excluded because their available listing history is insufficient.

The published list matches the saved rule fingerprint. All 184 members are active instruments. Missing data was not converted to zero, and no candles were invented for recent listings.

The three previously active sessions used old revisions and stock selections. They were stopped after verifying that they had no positions or outstanding orders. Earlier signals, backtests and orders remain as historical records; stopped-session signals are now labelled as previous sessions. Valid older candles were retained for indicator warm-up and research.

After refresh, the audit found 775,308 daily candles across 712 stocks and 145,361 minute candles across 180 stocks, as of approximately 12:35 IST. Counts continue growing with live data. Invalid OHLC and future-dated candle counts were both zero, and the instrument/interval/time unique index is present. This verifies basic integrity, not completeness of every provider session.

## Strategies and completed backtests

Each strategy has a separate ₹1,00,000 paper account and a maximum of three positions. Simultaneous buys follow current signals, risk limits and remaining cash; backtest profits do not rank or select live orders.

| Strategy | Buy conditions | Exit/risk plan |
| --- | --- | --- |
| Intraday · Liquid momentum, revision 2 | Completed 5-minute close above VWAP; EMA 5 above EMA 21; RSI 50–68; relative volume at least 1 | Sell below VWAP or when EMA 5 falls below EMA 21; 0.25% equity risk; ATR 14 × 2 initial stop; 40% at 1R and remaining shares at 2R; no overnight holding |
| Swing · Quality pullback, revision 3 | Daily close above SMA 200; EMA 5 above EMA 21; close at/above and within 3% of EMA 21; RSI 50–65 | Sell below EMA 21 or RSI below 45; 0.5% risk; daily ATR 14 × 2.5; 40% at 1.5R, remainder at 3R; overnight allowed |
| Long term · Weekly trend, revision 2 | Daily close above SMA 200; completed weekly close above weekly EMA 21; weekly EMA 5 above EMA 21; weekly RSI 50–70 | Sell below completed weekly EMA 21; 0.5% risk; daily ATR 14 × 3; 40% at 2R, remainder at 4R; overnight allowed |

All three move the remaining stop to entry after Target 1 actually fills, then trail by a fixed initial 1R distance. A rounded-to-zero target does not activate breakeven. Costs are estimates: intraday slippage 0.02% and fees 0.03% per side; swing/long-term slippage 0.05% and fees 0.10% per side.

The intraday scope was selected **before** seeing backtest returns: the ten most liquid qualified companies by completed-month average daily turnover — BSE, ICICIBANK, BHARTIARTL, NETWEB, SBIN, HINDCOPPER, MCX, BAJFINANCE, M&M and LAURUSLABS. Swing and long-term reports use all 184 qualified stocks.

| Backtest | Period | Stocks | Reported net P&L | Max drawdown | Fully closed positions |
| --- | --- | ---: | ---: | ---: | ---: |
| Intraday | 25 Aug–25 Sep 2026 | 10 | −₹13,711.23 (−13.71%) | 14.58% | 345 |
| Swing | 26 Sep 2025–25 Sep 2026 | 184 | −₹107.19 (−0.11%) | 4.56% | 98 |
| Long term | 26 Sep 2025–25 Sep 2026 | 184 | +₹120.00 (+0.12%) | 2.10% | 22 |

These results include marked open positions. Neither the small long-term gain nor the other results establishes a profitable strategy. All tests use today's selected universe on older prices, so selection bias remains. Three swing and six long-term decisions lacked SMA 200 warm-up and were skipped explicitly.

### Historical intraday limitation discovered

Direct requests to Dhan confirmed missing closing minutes for eight of the ten stocks. The report has 186 incomplete stock sessions out of 230, including 184 without a candle at/after the 15:15 exit time. Replay cannot manufacture those fills: delayed exits can occur on the next stored day, and one position remains open at the test end. Therefore the intraday return is **not reliable evidence of intraday performance**.

Reports now show this warning prominently, including existing reports annotated without rewriting their original fills or returns. Live paper session exits continue to require fresh ticks.

## Actual live-data paper execution observed

Orders below were submitted/fired in the real local application. No mocked quote or forced strategy signal was used.

| Time IST | Stock | Action | Shares | Fill price | Origin |
| --- | --- | --- | ---: | ---: | --- |
| 12:27:26 | BSE | Buy | 2 | ₹3,151.03 | Manual order through the UI |
| 12:28:03 | BSE | Sell | 1 | ₹3,147.97 | Manual partial exit through the UI |
| 12:29:09 | BSE | Sell | 1 | ₹3,149.77 | Manual final exit through the UI |
| 12:32:58 | BHARTIARTL | Buy | 53 | ₹1,777.76 | Automatic strategy signal |
| 12:33:06 | BAJFINANCE | Buy | 5 | ₹981.20 | Automatic strategy signal |

The manual round trip reduced shares from 2 → 1 → 0. It booked −₹8.09 including ₹3.77 in estimated fees. Manual intervention paused new automatic entries; they were resumed using the app's **Resume new buys** button.

The automatic buys used risk sizing: BHARTIARTL's initial stop is ₹1,773.12, with targets ₹1,782.40 (21 shares) and ₹1,787.04 (32 shares). BAJFINANCE's initial stop is ₹978.27, with targets ₹984.13 (2 shares) and ₹987.06 (3 shares). The second position was limited to five shares by remaining cash.

At the 12:37 IST ledger check, those two positions were still open. Available intraday cash was ₹834.89. The ledger independently reconciled all filled-order cash movements and share balances, with no oversells or discrepancies. Every checked fill used a quote newer than its order and within the 15-second freshness limit. Automatic exits remain governed by the saved sell rules, stops and targets; they were not forced for this demonstration.

## Active flow in the application

1. **Qualification → Qualified stocks:** the 184-stock published September list.
2. **Algo Strategies → Backtests:** completed reports for each saved strategy, with data and bias warnings.
3. **Signal Runner:** three automatic monitoring sessions linked to their exact tested revisions and stock scopes. The intraday session checks new five-minute candles. Swing/long-term wait for a new daily close; resulting daily orders can fill in the next regular session.
4. **Paper Trading:** live prices, open P&L, stops/targets, manual controls, booked P&L and paged order history.

The swing and long-term sessions were started through **View report → Use for paper trading → Paper trade automatically**, confirming that the UI carried over all 184 tested stocks. Feed subscriptions are automatic and cover the union of the three scopes. Keep the app services running for monitoring and fills; closing the browser alone does not stop them.

At 12:40 IST, a service restart was also verified with the two simulated positions open. New buys were temporarily paused first. All three sessions, account balances, held quantities, stops and targets survived; the feed reconnected automatically. New buys were then resumed for all three sessions. No retrospective fills were created during the outage.

## Repairs and validation

- Added quote-timestamped paper position marks and open P&L, plus booked account P&L.
- Corrected the header's obsolete “DATA SETUP” label to “PAPER TRADING / No real orders”.
- Fixed subscription comparison so a holding/order priority change does not reconnect an unchanged subscription set.
- Clarified paused monitoring status; it no longer incorrectly says no stocks are published.
- Added historical intraday completeness diagnostics and annotated existing reports.
- Fixed known closed-day history gaps: Saturday/Sunday requests had been producing provider errors. Coverage now records the configured regular-session calendar as its source without making artificial candles. The September 26–28 gaps were repaired for the active stock scope; subsequent history refresh reported zero failures.
- Preserved the old, cancelled scan and historical records while retiring obsolete active sessions.

Passed checks: production frontend/backend build; frontend/backend lint; valuation and history-quality unit tests; isolated database tests for fills, concurrent writes, partial targets/breakeven, signal/backtest linkage, subscription recovery and closed-day history caching; five selected browser workflow tests. Real-page desktop/mobile inspection and actual UI order entry also passed. These checks verify the exercised paths, not a promise that every provider or market scenario is flawless.

Reproducible scripts:

- `backend/scripts/audit-paper-workspace.ts` — read-only integrity and scope audit; optional credential-free backup.
- `backend/scripts/configure-paper-research.ts` — research plans; prints by default, explicit `--apply` guarded against changing active sessions/positions.
- `backend/scripts/annotate-backtest-history.ts` — diagnostic-only report annotations; explicit `--apply`.
- `backend/scripts/verify-paper-ledger.ts` — consistent snapshot audit of filled-order cash, shares and quote timing.

Detailed local evidence is in `.tools/paper-validation-state.json`, `.tools/paper-validation-*-report.json`, `.tools/paper-validation-qualified.json`, `.tools/paper-workspace-audit-after.json`, `.tools/paper-ledger-verification.json` and `.tools/artifacts/paper-validation/`. These files contain local research data, not broker credentials.
