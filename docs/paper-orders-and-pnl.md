# Paper orders and profit/loss

The Paper Trading page shows **realized P&L** (shares already sold), **open P&L** (shares still held), and their **total**. The strategy filter applies to all three, including stopped accounts. An absent quote leaves open/total P&L unavailable; an old quote is explicitly described as last received.

Trade history lists every exit fill, including individual partial targets and manual partial sales. Each row includes the entry, exit, quantity, allocated entry fee, exit fee and net P&L. Expand a row for timestamps and order changes. All-orders view also includes buys, pending, cancelled, expired and rejected orders. Totals cover the complete filtered history, not only the visible page.

Costs use integer paise. A partial sell removes `round(remaining cost × shares sold / remaining shares)` from the position. The final exit receives the remaining cost exactly. Net realized P&L is sell proceeds minus exit fees minus that allocated cost. Open P&L includes the remaining entry fees but excludes future exit fees. Slippage is already included in fill prices. These are the configured simulated fees, not a broker contract note or an exhaustive tax calculation.

New fills store exit accounting in the same transaction as cash and position changes. Older fills are reconstructed from the complete chronological stock/account ledger on read, with missing entry records shown as unavailable rather than zero. Reading history does not change historical cash, orders or fills.

## Manual controls

- **Exit all** on a position asks for confirmation, then queues a market sell of all shares remaining at fill time. It replaces a waiting signal/limit/partial-target order. An existing full protective exit remains in force. The position's opening timestamp prevents an old button from closing a later position in the same stock.
- **Sell quantity** opens the held stock with its full remaining quantity. Enter a smaller quantity or use 50%. Market and limit orders are available. The backend rechecks held quantity at fill.
- **Modify price** is available only for unfilled, non-protective orders. Buy limits fill at the limit or lower; sell limits at the limit or higher. A market order uses the next eligible price. Amendments keep the original expiry and confirmation requirement and cannot consume quotes from before the edit. Stops, automatic targets, square-off orders and completed fills cannot be repriced here.
- Manual intervention pauses future automatic buys; existing stops and targets remain active. An explicitly edited buy may still fill. Resume new buys in the paper account controls when wanted.

Market manual orders expire after 60 seconds. New manual limits expire at 15:15 IST for intraday strategies or 15:30 IST when overnight holding is allowed. An edit never extends an existing expiry. A reached limit is simulated against the verified quote with configured slippage, not exchange queue/depth matching.

## Intraday square-off

At **15:15 IST**, the worker cancels unfilled intraday buys and queues full market exits for intraday positions. This applies in automatic and confirmation modes, including accounts with new buys paused. Unfilled protective exits expire and are retried. Swing/long-term strategies with overnight holding enabled are exempt.

The clock can queue square-off without a recent tick, but filling still requires a subsequent quote from the active feed session no older than 15 seconds, during the regular cash session. The app services and feed must remain running. If the market closes before a fill, the position stays visibly open and is queued for exit at the next regular open; no close price is fabricated.

Feed ticks and order submissions wake the paper worker through Redis Pub/Sub after persistence. A one-second timer remains as a recovery path; rule evaluation/history downloads run separately. Quote freshness, position identity, cash and risk checks continue to apply.

Validation: isolated Mongo integration tests cover fee allocation/legacy history across pages, repeated exits, market/limit edits, stale edits, edit/fill races, protective-order restrictions, paused confirmation-mode square-off, expiry retries and prevention of new intraday fills after cutoff. Browser tests cover totals/history, direct and partial sells, price editing, chart navigation and mobile overflow.
