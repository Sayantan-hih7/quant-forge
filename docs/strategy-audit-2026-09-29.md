# Strategy workflow audit — 29 September 2026

## Repairs

- Custom condition is selectable from a preset and retains the current operands.
  Switching to another preset clears unrelated offsets and periods. Conditions
  with hidden custom settings are not misrepresented as a simple preset.
- Presets are searchable, fields have accessible labels, and Set condition
  validates before collapsing the editor. Pattern summaries distinguish detected
  from not detected. Crossover summaries retain their occurrence window.
- RSI crossing a numeric threshold now passes manual and AI validation; the
  engine already supports it. Crossovers against company snapshots stay invalid.
- ADX, Supertrend and engulfing patterns now request their proper minimum history.
  ADX/DI and Supertrend also receive warm-up history in backtests and qualification.
- Bollinger bands/width, ADX, DI, Supertrend and accumulation/distribution can be
  plotted with the same formulas/seeds as the engine. Candle patterns remain
  conditions rather than numeric chart overlays.
- Backtest reports aggregate by stock and whole positions, including partial
  exits, fees and remaining holdings. Stock charts use stored history over the
  original period and the strategy saved with that report, without downloading
  history or changing orders. Recorded fills remain visible when a candle is absent.
- Signal Runner labels sessions using older rules and selections with no eligible
  stocks. Changing a saved strategy never silently changes an existing session.
- Chart resizing is scheduled after the browser's resize notification pass to
  avoid feedback loops when adding indicator panes or changing drawer width.

## Existing local data

Read-only audits found:

- All 3 saved strategies pass the current risk schema and engine rule validation.
- 62 published stocks are active and match the current monthly rule fingerprint.
- 1,255,279 daily candles and 164,240 minute candles have no invalid OHLCV or future
  timestamps. This checks stored records, not completeness of provider coverage.
- All 14 completed backtests reconcile recorded fills and remaining position value
  to their reported net P&L. Older single-exit reports lacking remainingQuantity
  are supported by the report reader and need no destructive migration.
- All 14 recorded paper fills reconcile cash, fees and position quantities. There
  were no open positions or pending orders at audit time.

No strategy, report, fill or candle was deleted or rewritten. Old dates in a
historical report are expected; they are not evidence of corrupt data.

## Current monitoring configuration

The intraday session selects 10 stocks, none in the current published list. It
therefore cannot create new buy signals for that selection. Its Settings action
can select current qualified stocks. Swing and long-term sessions each retain
11 eligible stocks from their original selections.

The long-term session is pinned to revision 2, while the strategy library is at
revision 10. This preserves the rules under which a session started. Close any
positions, stop that session and start the updated strategy to deliberately adopt
the newer rules. The UI now flags the mismatch directly in Monitoring.

## Verification and limits

Production build and lint passed. Automated checks cover builder editing and
save conflicts, risk settings, AI proposal parsing, stock scopes, stale backtest
handoffs, partial-target paper fills, P&L grouping, chart cutoffs, marker selection,
and responsive chart/report layouts. Database integration tests use isolated test
databases. Real saved records were audited without submitting orders.

Provider gaps and insufficient listing history can still limit a test; missing
bars are not fabricated. Current-universe historical tests retain their selection
bias warning. Chart history may include later provider corrections. Passing these
checks is not a guarantee of profitable trades or of every live-market condition.
