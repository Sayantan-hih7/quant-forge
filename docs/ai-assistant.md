# Gemini rule assistant

Monthly Rules and Algo Strategies call the same authenticated, read-only assistant module in `backend/src/modules/ai`. The manual editors remain available. AI drafting is independent of a Dhan connection and imported stock data; actually scanning and backtesting still require their market-data inputs.

Configure these in private `backend/.env` and restart the API:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

The model can be changed to another Gemini text model available to your Google project that supports structured JSON output. The integration uses the official [generateContent REST endpoint](https://ai.google.dev/api/generate-content) with `x-goog-api-key`, and [structured JSON output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Google AI Studio authorization keys beginning with `AQ.` work with this header; no browser-side key or OAuth conversion is needed. The backend sends requests with Axios interceptors. No key is sent to Vite, browser storage, prompts or client responses. Raw Axios errors, provider request configurations and conversations are not logged.

Endpoints:

- `GET /api/ai/status`: configuration presence, provider and model only. Presence does not claim the key is valid or that quota is available.
- `POST /api/ai/proposals`: `scope` (`monthly` or `strategy`), `prompt`, recent `messages` and optional `currentDraft`. Returns explanatory text, assumptions and either a validated proposal or `null` for a clarification.

The server supplies the model with only fields editable in the relevant builder and supported by the calculation engine. Monthly proposals contain one AND/OR condition list; the server assigns monthly timeframes and categories. Trading proposals contain an entry, exit and risk configuration; the server assigns BUY/SELL sides and tactical tiers. Fields, operator compatibility, units, categorical choices, horizon, risk bounds and crossover timeframes are checked with Zod and application validation, then both rules are validated by the Python engine. Unsupported values cannot be applied. Supported fields do not imply market data has been collected.

The provider schema is compiled separately from the validation schema. Nested array, string and numeric bounds in the original Zod-generated grammar caused Gemini to reject the request with `400 INVALID_ARGUMENT`. `gemini-schema.ts` moves these bounds into field descriptions and uses a nullable type union for optional proposals. Required properties, types, enums and strict object shapes remain in the provider schema. The original Zod validators still enforce every bound before a suggestion can reach the builder. A provider request-format failure has its own error code rather than being reported as a bad key.

AI responses are untrusted proposals. Validation may request one correction from Gemini. No assistant request can save a rule, start a scan, publish stocks, change a strategy, start a session or execute an order. There are no model tools. Apply to builder updates only the local draft. Existing Save rule / Save and run / Save strategy controls remain separate.

The frontend sends at most the last ten messages and the current proposal (or manual draft) on follow-up. Unknown request properties are rejected; only editable draft properties are forwarded. The prompt is limited to 1,200 characters, history to twelve bounded messages server-side, and draft context to 32 KB. Redis limits the local workspace to ten assistant requests per minute. Provider requests time out after 60 seconds; there are no automatic quota retries. Closing the assistant or selecting Stop generating cancels the browser request and aborts a pending provider request. Late responses cannot replace the draft.

Credential, quota, unavailable-model, timeout, incomplete-output and invalid-proposal failures are shown without simulated fallback. Failed, cancelled or clarification-only follow-ups retain the previous valid suggestion and manual draft; subsequent refinements can still use that suggestion. Closing the strategy drawer cancels immediately, including during its closing animation. Existing preview AI conversations are discarded during the chat-store migration, while their manual drafts are preserved.

Backend tests cover proposal bounds, unit/frame compatibility, monthly-only output, paired trading rules, request limits, secret redaction and the correction limit. Browser tests cover draft-only apply, follow-up context, errors, cancellation, manual saves and responsive layouts using controlled API fixtures. A real provider smoke test is separate from those fixtures.

On 24 September 2026, the configured key was verified against Google's models endpoint and a minimal generation request. Both real monthly-rule and paired buy/sell proposal requests then completed successfully with `gemini-3.5-flash-lite`. Key values are deliberately absent from documentation and test fixtures.

## Scenario-based strategy and risk assistance

Open **Algo Strategies → Risk → Explain my risk plan** for risk-only assistance,
or use the existing **AI assistant** for the complete buy/sell strategy. The manual
builder remains editable after applying. Risk-only suggestions cannot contain
name, buy or sell fields; the server also enforces the existing holding horizon.
Risk help works before the user has completed the buy/sell conditions.

Strategy requests first run a separate intent/clarification stage. It can explain
existing settings, identify unsupported requirements, ask up to three relevant
questions, or authorize generation when the requested decisions are clear.
Question cards allow a suggested answer or custom text. Answers and the questions
they address are sent together in bounded conversation history. Examples must
distinguish illustrative prices from actual limits, explicitly resolve partial
allocations, and specify the trigger and distance for delayed trailing. Current
values answer unrelated settings; they are not permission to guess new exits.

The generation stage then returns a schema-validated proposal. Optional risk
controls are explicit nullable fields in the provider schema and normalized to
the execution schema. Required partial-exit/breakeven/trailing features are checked
against the confirmed intent so a prose claim cannot hide an omitted setting.
Generation gets one correction attempt with the rejected response and validation
error. Provider failures never fall back to a mock plan. Strategy requests can
make up to three provider calls (clarification, generation, correction); each has
a 60-second timeout, with a 205-second browser deadline and cancellation throughout.
Monthly requests retain their existing generation flow.

The risk preview uses deterministic descriptions and the same calculator as the
manual editor. It shows proposed changes, previous settings, and user-supplied
example prices. Example values remain separate from saved order settings. Applying
updates only the draft, returning to Risk for a risk-only request. Save, backtest
and paper monitoring remain separate actions.

Questions and unsupported requests preserve the previous suggestion for reference
but disable Apply until resolved. A manual edit made after a suggestion also blocks
applying that old suggestion; a new request uses the current draft. Provider errors
retain the previous complete suggestion. No assistant path writes a strategy or
creates an order/session automatically.

An explanation-only reply preserves the readiness of the last suggestion. It does
not make unanswered questions disappear or mark an incomplete request as ready.

The shared catalogue in `packages/rule-catalog/fields.json` describes measurements,
periods, offsets and allowed timeframes for both builders and the Python engine.
`dailyTurnover` uses actual turnover for a completed exchange session;
`avgDailyTurnover` uses an N-session average; legacy `turnover` retains its
completed-month average. These must not be substituted silently. RSI defaults
to 14 but supports a configurable period; a trading RSI range is represented by
two AND-connected comparisons. Generic EMA/SMA, rolling highs/lows, candle-body
measurements and true 52-week extrema are supported. See the
[data capability audit](rule-data-coverage.md) for input sources and remaining gaps.

Nullable provider enums include `null` in both their type and allowed values.
If a generated draft still fails after its correction attempt, the response names
the failed controls (for example, stop percentage or buy order type), keeps the
draft unchanged and does not echo raw model output or arbitrary invalid values.
The from-scratch browser regression covers the momentum example, turnover
clarification, all seven buy conditions, the paired sell condition, partial exits,
stop adjustment, draft-only apply and separate explicit save using synthetic data.
