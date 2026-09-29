# Strategies, backtests and signals

`/strategies` opens a searchable library. **New strategy** starts an editable blank plan or a starter for Intraday, Swing or Long term. A starter is copied into a local draft; it does not create a saved strategy or start monitoring.

The editor has five steps: **Setup → Buy rules → Sell rules → Risk → Review & save**. Both sides remain available in the manual builder. AI suggestions are reviewed in a drawer and require **Apply to builder** before becoming edits. Applying a suggestion never saves it.

Drafts survive reload on the same browser. Failed saves retain them. Saved revisions protect against overwriting changes from another browser. An older or unversioned draft that differs from the saved strategy requires explicit recovery through **Reload saved strategy**; it is not silently submitted against newer rules.

Backtests use a saved strategy. All qualified stocks, including manual additions, are selected by default (up to 200 per run). Users can narrow that selection or exclude manual additions. Changing the universe definition selects its new stock list; routine refreshes preserve a user's selection. `/api/backtests/universe` uses the same universe-selection service as the queue: current lists for retrospective research, or recorded historical lists for the requested dates. Historical eligibility starts at publication, as enforced by the engine. Current-list research requires acknowledgement that today's stock selection was not available historically.

Missing history is prepared before replay. Progress and failures appear under **Runs for this strategy**. Reports open separately and identify tests of earlier rules. **Use for paper trading** carries the report ID, saved strategy revision and tested stock selection into Signal Runner. Stocks that are no longer qualified are excluded. The frontend and backend reject a stale strategy revision or stocks outside the linked test. Simulated historical positions are never copied into paper trading.

Signal Runner (`/signal-runner`) opens directly on buy/sell alerts across all strategies, including expired alerts. Monitoring rows explain the cadence, currently eligible stocks, exclusions and latest result. Expand **Latest rule checks** to see both sides' conditions even when no signal matched. A stored-candle inspection remains optional inside setup: it creates no sessions, orders or live signals, and changing the saved strategy revision or selected stocks invalidates it.

**Monitor a strategy** selects qualified stocks and one execution choice:

- **Show signals only** records both buy and sell matches without creating orders. Sell alerts apply to existing holdings, not short sales.
- **Paper trade after I confirm** creates a confirmation request when a relevant buy or held-position sell rule matches.
- **Paper trade automatically** creates a paper order when a relevant rule matches, subject to qualification, position, cash and risk limits.

Starting monitoring automatically connects/subscribes live data. Saved monitoring restores when app services restart. Strategies wait for a newly completed candle; daily strategies wait for market close. No signal is invented when rules do not match or required data is unavailable. Changing modes does not execute previous alerts or automatically approve pending confirmation requests.

**Settings** changes future stock selection and execution mode without replacing the session's saved rules or cash. Held positions keep their exit monitoring when removed from the selection. Switching to signals only requires closing all held positions and cancels outstanding paper orders. Stop the old monitoring session and start a new one to use a newer strategy revision. An existing session is never silently upgraded from a backtest report.

Paper Trading (`/paper-trading`) contains paper accounts, open positions, outstanding orders and paged trade/order history. Each strategy has independent paper cash. Sizing uses available cash, initial stop distance, saved risk per trade and position limits; backtest profitability does not rank future buys. Pending orders reserve no cash. Current estimates use the same sizing function as fills, and transactional fill checks recalculate against the latest balance. Competing orders therefore can receive different quantities or be rejected once a limit is reached.

Stops and partial targets execute automatically in both paper modes; sell-rule orders follow the chosen confirmation/automatic mode. Manual buy/sell controls remain available and pause new automatic entries. Expired orders cannot be confirmed. Fresh quotes, an open market and the paper worker are required for fills; all execution is paper only.

## Verification

- `frontend/tests/algo-strategies.spec.ts`: paired rules, manual saves, AI proposals and failed refinements.
- `frontend/tests/strategy-workflow.spec.ts`: creation, explicit-save boundary, recovery, scope errors, backtest handoff, mobile layout and order-free inspection.
- `frontend/tests/paper-readiness.spec.ts`: visible signals across strategies, all-stock defaults, setup without connection/inspection steps, and exact backtest handoff. Writes are intercepted.
- `backend/test/signal-workflow.integration.test.ts`: signals-only isolation, mode changes, risk sizing, linked-report guards and paged order history in an isolated database.
- `backend/test/strategy-workflow.integration.test.ts`: current/manual/historical scope and stale-revision guards. Requires `RUN_DB_TESTS=1`; uses a uniquely named temporary test database.
- `engine/tests/test_backtest.py`: replay, next-bar fills, protective exits and historical eligibility.
# Partial profit exits

In the strategy editor, open **Risk → Profit targets → Partial exits**. Set two to
five increasing price gains and the percentage of the original position to sell.
The last allocation is calculated automatically so the total is 100%. For example,
with 100 shares bought at ₹100, a +2% / 40% first target sells 40 shares at the
target; a +5% final target sells the remaining 60. Actual fills include the saved
slippage and fee settings.

- Existing strategies retain their single target in R unless partial exits are enabled.
- Choose **Initial risk (R)**, **Gain (%)**, **Gain per share (₹)**, or **Exact target price (₹)** for all
  levels. Percentage and rupee gains are added to the actual filled entry; exact prices
  stay fixed. A reference entry price in the editor previews equivalent prices/gains
  and converts values when switching units. It is not saved as a buy-price override.
  Switching units without a reference clears the target values for explicit entry.
- Exact prices apply to every selected stock. Backtests count skipped entries and
  paper orders are rejected if any target is at/below the actual fill, or rounding
  produces identical prices. These rejected entries spend no cash or fees.
- Share allocations use the original
  quantity, rounded down cumulatively; the final target closes the entire balance.
  A zero-share allocation is skipped, never treated as a filled first target.
- **Move or trail the stop-loss** lets breakeven and trailing activate independently:
  at a profit multiple (R) or after a selected partial target fills. Entry-price
  breakeven excludes costs, and never lowers an already higher stop. The older
  Target-1 breakeven setting remains supported on saved strategies.
- Manual sells reduce the available balance. Later targets are capped to that balance;
  sell-rule signals, stop-losses and session exits still close all remaining shares.
- In both automatic and confirmation modes, protective targets run automatically.
  A fresh tick triggers an exit and a subsequent eligible tick fills it. Target state,
  position size, remaining cost and cash changes persist transactionally. Replaying
  a filled order cannot sell the same target twice. A stop overrides a pending target.
- Backtests record one row per exit fill, with shares sold and remaining. Win rate
  and profit factor count fully closed positions, combining all their partial exits.
  Realized P&L also includes partial exits from positions still open at the test end.
- OHLC replay cannot infer the intrabar path: the existing stop wins when a bar touches
  both it and a target. New breakeven/trailing stops apply on the next replay bar.
  Paper trading instead reacts to subsequent live ticks.

Save the strategy and run a new backtest before starting a new paper monitoring
session. Existing sessions and historical reports retain their saved definitions.

## Entry price, initial risk and adjustable stops

**Risk → Entry price** offers market entry or an optional maximum limit-buy price.
Buy rules still have to match before an automatic order is created. The limit is
an actual order constraint, separate from the reference price used for target previews.
It applies to every stock selected for the strategy; fixed-price plans are best
used with an explicitly selected stock. A fill can be better than the limit, never
worse, including configured slippage. Signal-generated limits expire at 15:15 IST
for intraday plans and 15:30 IST for overnight plans in the eligible session.
Daily close signals use the next eligible session. Manual buys respect the same
limit but bypass buy rules and retain their 60-second expiry. Sell rules and manual
sells remain market exits. Cash and risk checks run when a paper fill is attempted;
pending orders do not reserve cash, so another position may consume the budget first.

Initial stops can use a percentage, ATR distance, rupee distance, exact price, or
the completed signal candle's low.
The filled entry minus its initial stop is stored as **1R** for that position.
For entry ₹100 and initial SL ₹96, 1R is ₹4; 2R / 4R / 5R targets are ₹108 / ₹116 /
₹120. With allocations 30% / 30% / remainder, 100 shares exit as 30 / 30 / 40.
If a limit fills at ₹99 with the same fixed SL ₹96, initial risk is ₹3 and the
targets adjust to ₹105 / ₹111 / ₹114. Stops at or above the actual fill reject the
entry before any cash is spent. Moving the stop later never recalculates R or targets.

For example, enable **Move stop to entry** at +1R and **Trail the remaining position**
after Target 1 fills, with a 1R trailing distance. Price ₹104 moves the stop to ₹100
without selling shares. After the first target actually fills, trailing follows
the highest subsequent observed price at a ₹4 distance. A rise to ₹112 moves the
stop to at least ₹108. A fall never lowers the stop. A target that rounded to zero
shares does not count as a fill and cannot activate a target-based adjustment.

OHLC replay uses the existing stop first and applies stop changes from the next
bar. If a limit fills inside a candle, the earlier high may precede entry: the
initial stop can still be hit, but profit targets and stop adjustments wait until
a later bar. Reports expose skipped invalid stops and expired, unfilled limits.

## Candle protection and target stop steps

In **Sell rules → Exit plan**, choose **Stops and targets only** if no indicator
sell condition is wanted. Buy rules remain required. Stops, targets, manual exits
and intraday square-off still operate. Signals-only monitoring does not invent
sell alerts from hypothetical positions; protective exits belong to paper holdings.

In **Risk → Initial stop method**, choose **Completed signal candle low** and its
timeframe. For a daily green-candle entry, choose Daily. The low is taken from the
last completed candle at the buy decision and frozen on the order. It is not the
unfinished entry day's final low, which is unknown when buying. Manual buys use
the latest completed candle when submitted. Missing data blocks the order; a fill
at/below the stored low is rejected without spending capital.

Each non-final row under **Profit targets → Partial exits** has **After Target N
fills, move SL to**. Choose entry, an earlier target price, or keep the current
stop. For entry ₹100 and signal low ₹96:

- T1 at 2R is ₹108; sell 40%, then move SL to ₹100.
- T2 at 5R is ₹120; sell 30%, then move SL to ₹108.
- Define a final target for the remaining 30%. The app does not infer “and so on.”

Percentages are of the original share count. A stop step requires actual shares
to fill, cannot lower a higher stop, and keeps initial R unchanged. Continuous
trailing is a separate optional setting. In OHLC backtests, new stops take effect
on the next replay bar; paper trading applies them after the actual partial fill.

Each crossover event can trigger one entry attempt per stock per monitoring
session, even when several daily checks see the same weekly crossover. The event
is consumed when its signal/order is created, including confirmation, cancellation
or later rejection. Events persist beyond worker restarts and daily evaluation
expiry. A new crossing is a new event. OR branches remain independent; state
conditions such as EMA 5 above EMA 21 can match again after exiting. Manual buys
remain available. Backtests apply the same entry-event policy within each run.

AI assistance understands these settings and asks for missing allocations or
later target levels. It produces a draft for review, not a saved or running strategy.
Existing saved records and paper session snapshots are not rewritten.

Coverage: `engine/tests/test_strategy_protection.py`,
`backend/test/entry-events.test.ts`, `backend/test/stop-management.test.ts`,
`backend/test/paper-runner.integration.test.ts`,
`backend/test/partial-targets.integration.test.ts`, and
`frontend/tests/risk-workflow.spec.ts` exercise the shared behavior and edit flow.
Paper execution uses fresh ticks and persists the original risk, target fills,
activation flags and trailing high across worker restarts.

## Risk editor and example calculator

The Risk screen separates **Initial stop-loss**, **Profit targets**, and
**Move or trail the stop-loss**. The initial stop protects the position from entry;
targets sell shares; adjustments raise that same stop for the shares still held.
Optional adjustments stay collapsed until enabled. ATR settings identify the
completed-candle timeframe used to calculate the initial distance.

The **Example calculator** accepts a hypothetical filled entry and, for ATR plans,
an example ATR. It shows the starting risk budget, whole-share sizing, initial stop,
fixed 1R, target prices/allocations and stop activations together. These values are
local preview inputs and never become order prices or get saved in the strategy.
They can also convert target units. The real limit-buy field remains in Entry price.

Trailing from entry is configured under the same adjustment section as delayed
trailing. It retains its percentage distance and existing saved execution meaning;
delayed trailing retains its independent R distance. Changing unrelated fields
does not migrate old strategies. Removing a target or changing to single-target
mode is blocked while a stop adjustment depends on an affected target.

Fixed buy limits, exact stops and exact targets are identified in the editor and
review. Backtest and Signal Runner selection warn when those same absolute prices
would apply to multiple stocks. Saving discards inactive limit/stop prices, and
editing is locked while the save response is pending so it cannot overwrite a
newer edit.

## Stock-wise backtest review

The report opens on Stock results. Each stock shows its period P&L, realized and
open P&L, entries, completed trades and win rate. One entry with several partial
exits counts as one trade. Its outcome is determined only after the entire
position closes; open positions do not enter the win-rate denominator.

Select a stock to review its historical candles and saved-revision indicators.
Entry and exit markers link to the trade history below; expand a trade to see
each partial fill, quantity, price, date and realized P&L. The default view covers
the test period; selecting a trade focuses its fill. Chart data comes from the
stored history, includes indicator warm-up and excludes candles after the test
cutoff. It may reflect later data corrections; it is not an immutable copy of the
original provider response. Opening the report never downloads data or trades.

The condition picker supports searchable presets and an explicit Custom condition
option. Choosing Custom retains operands; choosing another preset resets hidden
parameters. Presets with different offsets or timeframes open as Custom so these
settings stay visible. Numeric threshold crossovers, such as RSI crossing 30,
validate consistently in the manual builder and AI drafts.

Signal Runner identifies sessions whose saved strategy now has a newer revision,
and stock selections with no current qualified buy candidates. Session rules
remain pinned to the revision used at start; updating library rules does not
silently rewrite a running paper-trading session.
