# Strategy rule health review

Open **Algo Strategies → Trading rules → Review rules** while editing an existing draft, or use **Review & save**. Once the required fields are valid, a debounced review runs after edits. Both manual rules and applied AI suggestions use the same checks.

The review distinguishes:

- **Conflicts:** every alternative on a buy/sell side is provably impossible, such as daily RSI > 70 AND daily RSI < 30. These cannot be saved, including through a direct API request.
- **Warnings:** an impossible optional group, potentially overlapping buy/sell thresholds, a crossover candle shorter than the check cadence, a condition that accepts every available value, or a percentage target too small for configured costs. These require a decision from the trader and remain saveable.
- **Simplifications:** duplicate conditions or redundant numeric/indicator comparisons in the same group. AND keeps the stricter threshold; OR keeps the broader threshold. Preview shows the entire group before/after. Apply changes the local draft, followed by an explicit save. Undo is offered only until subsequent edits or saving.

The configured-plan section explains position limits, combined planned stop risk, exits and intraday square-off. It is not a profitability score.

## Execution and limits

`POST /api/strategies/review` is read-only. It does not call Gemini, download stock data, start monitoring or create orders. Requests have bounded group/condition counts. Alternative paths are limited to 256; buy/sell path comparisons are limited to 1,024. The response explains when a complete interaction check was not possible.

The analyzer keeps different periods, timeframes and candle offsets separate. It recognizes canonical EMA/SMA aliases and current-candle crossover implications. Historical crossover windows are not treated as current trend states. It only proves numeric interval conflicts; complex patterns, relationships between different indicators, and future returns still require backtesting. Missing market data is handled by the existing data/execution checks, not inferred here.

Only proven conflicts block a save. A review transport failure is explicitly shown as unavailable. Existing field validation and the backend conflict check remain in force. Responses and fixes are tied to the current draft; stale responses are ignored and stale previews cannot be applied. Saved definitions and running sessions are not modified by reviewing or applying a draft suggestion.

## Verification

Regression coverage includes AND/OR alternatives, strict/inclusive bounds, exclusions, periods/timeframes/offsets, aliases/reversed comparisons, event semantics, bounded expansion, non-mutating simplifications, and backend rejection without changing a stored revision. Browser coverage exercises preview/apply/undo/save/reload, subsequent edits, failed review recovery, mobile layout and existing strategy/risk/AI flows.

A read-only check on 29 September 2026 found no issues under the supported checks in the three currently saved strategies (revisions 2, 3 and 10). No strategy or trading history was rewritten or removed.
