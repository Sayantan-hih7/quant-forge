# Manual paper trading

Every stock screen (stock drawer) has **Buy** and **Sell** buttons beside the price. They trade a separate **Manual trading** paper account: its own simulated money, any active NSE/BSE stock (not limited to the qualified list, which remains the base for algo strategies), and no effect on any strategy session. Nothing is sent to a broker.

## Account

The first Buy opens the account with a starting amount (default ₹1,00,000). Internally it is a paper session with mode `manual` and strategy id `manual-trading`; it has an empty stock selection, so it never subscribes to the qualified list. Live data is subscribed only for its holdings, open orders and active conditions. It appears on **Paper trading** as "Manual trading" (and never on Signal Runner). Closing it (`DELETE /api/paper/manual/account`) requires no open positions, like stopping a strategy session.

## Order ticket

| Section | Options |
|---|---|
| Product | **Delivery** (overnight) or **Intraday** (no new buys after 15:15; square-off queued at 15:15 per position, even in an account that also holds delivery) |
| When | **Now**, or **When a condition is met** (see below) |
| Order type | **Market** (next live price + 0.05% slippage, valid 2 minutes), **Limit** (buy at or below / sell at or above, valid till close), **Stop** (buy when price rises to the trigger — breakout; sell when it falls to the trigger) |
| Quantity | Shares, rupee amount, or **max loss ₹** (shares = max loss ÷ distance to stop) |
| Stop-loss (required on every buy) | % below buy, a price, × 14-day ATR (computed from daily history at order time), or trailing % (follows the highest price) |
| Targets (optional, up to 3) | % above buy or price, each selling a % of the original shares (total 100%). No target: exits only by stop, trailing stop, a sell condition or your sell |
| Protect profits | Breakeven after Target 1 or after +1R; trailing after Target 1 or after +1R (trails by the initial risk distance) |

The ticket previews the stop price, money at risk, target prices, reward : risk at Target 1, order value, estimated charges and paper cash, and blocks invalid tickets (stop above price, targets not increasing, sell % not 100, not enough cash, selling more than held). The server re-validates everything. Approximate costs: 0.12% per side delivery, 0.05% intraday.

The ticket is converted into the same per-position plan the paper engine uses for strategies (`manual-plan.ts`), so manual positions get identical stop, target, breakeven, trailing and square-off handling. Positions and orders carry the plan; strategy positions without one keep using their strategy's risk settings. Manual quantities are limited by cash, not by a strategy risk percentage. One position and one open order per stock.

## Conditions ("buy/sell when…")

A condition uses the same rule builder and engine as strategies: any indicator/price/fact conditions with AND/OR groups, checked on **1, 5 or 15-minute or daily candles** that complete *after* it was saved (never on an earlier candle). Validity: today, 7, 30 or 90 days (intraday: today only, minute candles only). When met, it places one market order with the ticket's stop-loss/targets, then becomes `triggered`. If the stock already has an open order, is already held (buy) or no longer held (sell), or an intraday buy matches after 15:15, it is marked `failed` with the reason instead of acting. Missing data for a candle is reported and checked again on the next candle. Up to 50 active conditions. Sell conditions require a holding.

## Stock screen panel

Under the chart: the holding (shares, average price, live P&L, current stop with Trailing / At-cost tags, targets, delivery/intraday), **Sell / add sell condition** and **Exit all at market**, open orders with Cancel (automatic protective exits cannot be cancelled), waiting conditions with Cancel, and recent fills and condition outcomes.

## Requirements

Fills, stops, targets and condition checks run in the paper worker on live prices during market hours (09:15–15:30 IST). Orders cannot be placed while the market is closed; save a condition instead. If the worker is offline the panel says so.

## API

`GET /api/paper/manual?instrumentId=` · `POST /api/paper/manual/account {capital}` · `DELETE /api/paper/manual/account` · `POST /api/paper/manual/orders` · `POST /api/paper/manual/triggers` · `POST /api/paper/manual/triggers/:id/cancel` · existing `POST /api/paper/orders/:id/cancel` and `POST /api/paper/positions/:id/exit`.
