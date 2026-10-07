# QuantForge AI assistant

The shared workspace chat, Monthly Rules and Algo Strategies use the same authenticated assistant module in `backend/src/modules/ai`. The manual editors remain available. AI drafting is independent of a Dhan connection and imported stock data; actually scanning and backtesting still require their market-data inputs.

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

Open **Algo Strategies ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Risk ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Explain my risk plan** for risk-only assistance,
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

## Provider-independent assistant

`AI_PROVIDER` accepts `gemini` (default), `openai`, or `anthropic`.
`AI_MODEL` selects the model. When Gemini is selected and AI_MODEL is blank,
GEMINI_MODEL remains the fallback. Other providers require an explicit model ID
available to your account and their own OPENAI_API_KEY or ANTHROPIC_API_KEY.
Change backend/.env and restart the API and news worker. No frontend key or code
change is required. There is no automatic cross-provider fallback or forwarding.

All consumers use providers/provider.ts. The adapters return untrusted JSON;
existing rule, risk, capability and engine validation remain authoritative.
OpenAI uses the Responses API with JSON mode and store:false. Claude uses the
Messages API with a schema instruction. Gemini retains its existing schema-aware
request. A syntactically valid response is never sufficient to apply rules.
Incomplete, refused and malformed responses are rejected. Errors are sanitized;
provider request objects, prompts and credentials are never logged by adapters.

References: https://developers.openai.com/api/docs/guides/structured-outputs
and https://platform.claude.com/docs/en/api/messages/create .

The AI assistant page is the single workspace conversation for both monthly
qualification and trading strategies. It loads saved rules before editing, asks
clarifying questions, and returns validated proposals plus a deterministic rule
health review. Users inspect proposed rules alongside the saved revision and
confirm Save these rules without leaving the assistant. Strategy edits also show
a field/condition change list. Conflicting drafts cannot be saved. Saves use the
existing strategy and qualification services, including expected-revision checks,
strategy history and one-strategy-per-holding-period enforcement.

After saving monthly rules the assistant can start the qualification scan, show
its progress, open the existing detailed results, cancel a running scan, and
publish a completed list after explicit confirmation. Missing inputs/history
require the same acknowledgement as the original qualification flow. Scan starts
include the reviewed revision; a changed monthly rule cannot silently be scanned.
Saving alone never scans, publishes or starts trading. Backtests and paper sessions
still use their existing screens. Chat generation cannot perform mutations itself.

The old My preferences textarea and its saved browser notes have been removed.
Context comes from conversation and saved rules; there is no silent learning.
Conversations are in memory during navigation and can be cleared. Stop cancels
generation but retains the conversation; saved conversations can be reopened after page reload.
Credentials are not sent. Requested agent checks can send bounded paper-session, feed-status and report evidence to the configured AI provider.

Provider contract tests use mocked HTTP. GPT/Claude live credentials and model
access must be tested when selecting that provider; fixture success is not a
claim about live model accuracy. Shared chat currently adds a routing call before
strategy clarification/generation. Token accounting and task-specific model routing
remain future work.

The assistant has a dedicated `/assistant` page, available from the sidebar and the top bar. Suggested tasks populate the composer without sending automatically. Enter sends a message; Shift + Enter adds a line. The chat and current draft stay in memory when switching workspace pages; reloading clears the active panel; saved conversations remain in history.

## Guided chat, attachments and voice

The main assistant supports up to three essential clarification questions per batch. Tabs preserve selected or custom answers. Recommendations include reasons; only explicitly skippable questions can use the **Use recommended defaults** action. This action preserves existing answers. **Proceed** requires all questions to be answered. Recommended values are editable paper-testing starting points, not profit forecasts or permission to execute trades.

Attach up to two PNG/JPEG/WebP screenshots or TXT/Markdown/CSV notes, with a combined 2 MB limit (20,000 characters per text file). Files remain attached to follow-up requests until removed or a new conversation begins. Attachments stay in browser memory, not an application upload store, and are sent to the configured AI provider. Reloading clears temporary attachments; saved text history remains available. PDF, spreadsheet and audio-file uploads are not supported. Provider adapters use native image input for Gemini, OpenAI Responses and Anthropic Messages; the selected model must support vision. Uploaded content is untrusted context, never verified market data.

The microphone uses browser speech recognition where available (typically Chrome/Edge), using the browser language without a separate language selector. It requires microphone permission and the browser's speech service. Speech appears in the composer; the user stops dictation, reviews the transcript and explicitly sends it. Recognition stops when leaving the assistant. Unsupported browsers and denied permissions show an explanation rather than claiming to record. This is voice-to-text input, not a live voice conversation or an audio upload service.

Saving still reviews the exact validated proposal and expected revision. Failed refinement requests disable saving an older suggestion until refreshed. No provider-generated text can start trading or silently overwrite a strategy. Existing cooldown, daily loss, entry-count and price-deviation limits are included in AI editing context. Conversation context is not model training or permanent learning.

The paperclip opens an Add context menu for chart screenshots, strategy notes/CSV, or pasted ideas/code. Pasted code is attached as bounded text for explanation and supported-rule discussion; it is never executed and this does not provide a Pine Script runtime.

Pasting more than 1,000 characters (or exceeding the remaining composer capacity) automatically creates a removable pasted-text.txt attachment, with a character count and text preview. Existing composer text stays intact. The two-file and 20,000-character limits still apply; a blocked paste is retained in the paste dialog for editing rather than truncated. Nothing is sent automatically.


## Read-only workspace agent

The chat can select validated `backtests`, `paper`, `qualification`, and `connections` tools. A provider-independent loop executes the approved local read operation, supplies its result to the model, and allows a dependent read (for example, latest reports then one report). Limits: three follow-up rounds, four unique tool calls, a four-minute overall deadline, and bounded data snapshots. Unknown commands/arguments are rejected. Repeated calls are deduplicated; failures produce a redacted unavailable result. Browser cancellation prevents subsequent checks and generation. Existing queries may finish, but no tool writes application state.

Mongo projections explicitly exclude credentials and large report curves. Backtests expose report revision, metrics and quality, with at most ten sample trade rows for a selected report. Paper data is explicitly a sample of recent sessions, orders and rule observations; it must not be presented as lifetime portfolio totals. Connection checks read saved Dhan metadata, feed freshness and cached clock status without reconnecting or refreshing credentials. No provider login, orders, scan, session start or arbitrary code execution is exposed through the model's tool schema.

Answers retain a collapsed timestamped ?App records checked? section and explicit source-screen links. This is in-conversation evidence, not a durable audit log or permanent agent memory. Draft generation continues through the existing validation/review/save flow. External MCP servers and an MCP endpoint are not enabled. The local typed tool registry can be reused behind a separately authenticated MCP adapter later; no external credentials or new cloud service is required for this release.

Design references: [Gemini custom tool flow](https://ai.google.dev/gemini-api/docs/tools) and [MCP tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/). The current implementation uses structured JSON decisions through the existing provider adapter, not provider-specific native function calling. Server validation and the read-only allowlist enforce the boundary rather than relying on model instructions or tool annotations alone.


## Inline backtest and paper workflow

Chat can prepare a qualification scan, saved-strategy backtest, or paper setup from a completed report. Preparing controls does not execute a scan, backtest or session. The model cannot supply arbitrary API operations. The server resolves strategy metadata and checks report quality and revision before preparing paper controls.

Backtest controls show completed dates, NSE/BSE scope, current versus historical qualified lists, and editable stock selection (up to 200). Current-list research requires an explicit selection-bias acknowledgement. Manual additions are included; the ready-data policy checks history before replay. Run backtest uses the standard domain API with expected strategy revision and a stable request UUID. Repeating the same request resumes its report; reusing the UUID with different settings is rejected. Progress and report metrics appear in chat, and Ask AI to explain reads the actual report. Full reports remain accessible on the backtest page.

A complete report with no blocking data issues offers signals-only, confirmation, or automatic paper execution. Signals-only is the default. Start paper monitoring explicitly creates a simulated session through the existing paper API; strategy revision, report membership, current qualification, and existing active sessions are checked again. It does not replace an active session. A lost response can be checked on Paper Trading; the domain guard prevents a duplicate active session. No live broker execution is exposed or implemented.

Workflow panels remain in conversation while follow-up questions are asked. Starting a new conversation or reloading clears the panel but does not cancel a queued test or stop a paper session. Those records remain in Backtests/Paper Trading. External MCP access, durable chat memory, and arbitrary code execution remain outside this release.

Strategy-improvement follow-ups include the active workflow target as context. Edit/draft routes take precedence over incidental workflow output. Explicit improvement corrections cannot reopen a backtest form; unresolved targets ask a strategy choice. Drafts and clarification clear the old controls, and workflow metadata uses the actual saved revision rather than retaining an unrelated new draft. Changes still require review and save.


## Conversation history

The Chat history button opens a right-side drawer, keeping the conversation area clear. Selecting a saved chat closes the drawer. Text messages, structured questions, evidence summaries, the selected rule revision and draft context auto-save to MongoDB in this workspace. New conversation and switching chats flush pending changes first; failed saves preserve the current chat and show an error. The full transcript remains visible while only recent context is sent to the model. History loads 100 summaries at a time with Load older chats; search filters loaded titles. Conversations can be renamed or deleted. Deletion affects only the chat, never strategies, tests or paper sessions.

Reopening restores messages and clarification questions, but does not restore executable workflow panels or make an old proposal immediately saveable. Continue the conversation to prepare a fresh validated proposal; existing revision checks still reject stale strategy edits. Concurrent edits use revision checks, and identical saves can safely retry after an interrupted response. Attachments, microphone recordings and unsent composer text are not stored. Already-discarded chats from before this feature cannot be recovered.


## Automatic conversation compaction

After a saved conversation exceeds 12 messages, the server summarizes the older messages and retains the latest 10 verbatim for model context. The original transcript is never replaced or deleted. The summary preserves decisions, numerical constraints, corrections and unanswered questions; it is explicitly untrusted context and never permission to act. It is visible in the reply under Earlier context - automatically compacted.

Summaries are cached in MongoDB against a hash of the summarized prefix. Subsequent compaction sends the previous summary plus newly aged messages, avoiding repeated full-history processing. Changed earlier history invalidates the cache. A provider failure stops the request with an actionable message instead of silently discarding older context. Very large unprocessed histories are bounded. Summary generation uses the configured provider adapter, so changing AI providers does not change storage or workflow behavior. This is conversation memory, not model training; summaries can still omit details and users can inspect or correct them.


## Chat storage retention

Workspace chat retention is capped at 100 MiB of BSON document data or 500 conversations. The history drawer displays both measures and a combined usage percentage (whichever limit is closer), with a warning at 90%. This measures conversation documents, not MongoDB physical disk space or AI context capacity. Other application records are excluded.

Saving a conversation uses a transaction and a workspace serialization record. At either cap it removes least-recently-updated conversations, excluding the chat being saved, until both measures are at most 85%. It records cleanup time and removed count for display. Cleanup runs on saves, not merely opening the drawer; no age-based expiry is imposed. Strategies, reports and paper sessions are never part of the deletion query. Conversation compaction is separate: it reduces model context without deleting the transcript.

### Formatted answers and report downloads

Assistant replies support Markdown headings, lists, code and GFM tables. Raw HTML is not executed; remote images are not loaded and links are limited to HTTP(S)/mailto.

Each answer has **Export answer**: Markdown, Print / save PDF (browser print dialog), Excel and CSV. Excel is loaded only when requested. PDF printing includes expanded source tables and supports browser fonts/Unicode. CSV exports one table; use Excel for multiple tables. Source tables also have individual CSV buttons.

Backtest, paper and qualification read tools attach deterministic source tables, retained with saved conversations. Export includes source scope and checked time, strategy revisions where available, missing fields, and data-quality notes. Trade/order samples are explicitly labelled and must not be interpreted as complete ledgers or portfolio totals. Numbers from paper records are converted from paise to INR. Missing values are blank in downloads. Source ISO timestamps retain timezone; Z means UTC.

Where no source table is attached, Excel/CSV can export the Markdown tables with an **AI-written / unverified** scope. Text is stored as text in Excel, and CSV formula-like strings are escaped. Markdown exports the answer text. No export starts a scan, backtest, session or order.

Dependency review: ExcelJS uses uuid in conditional-formatting identifiers; npm flags uuid's optional buffer API. This exporter only writes literal worksheet cells, does not use conditional formatting, does not pass a UUID buffer, and does not import workbooks. Reassess this dependency before adding workbook import or conditional formatting.

### Live dictation waveform

While dictating, the composer shows a blue/teal waveform driven by microphone RMS samples, alongside the live transcript and a Stop button. Stopping keeps the transcript for review; sending remains disabled while dictation is active. The visualizer uses the browser Web Audio analyser and does not record, retain or upload audio. Existing browser speech recognition still provides transcription through its browser speech service.

Visualizer resources (audio context, tracks and animation) are released on stop/unmount/error, including when microphone permission resolves after the user has stopped. Unsupported/denied visualization shows a fallback message instead of simulated activity. Reduced-motion users receive fewer visual updates.

API references: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteTimeDomainData and https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop

Assistant pending states use a compact animated indicator (static for reduced motion). Response requests show elapsed time and a longer-wait hint after 15 seconds, without fabricated progress percentages or tool stages. Attachment reading, saving and lazy-loaded workflow controls use matching indicators. No-speech notices clear after 6 seconds, transient recognition connection errors after 8 seconds; microphone permission errors remain dismissible until addressed.

### Failed strategy drafts

Trading capability validation now reports the buy/sell side, group and condition, field name, supported intervals or comparison units, and a suggested repair. It collects field/parameter constraints across conditions for the correction attempt rather than revealing one defect at a time. A failed correction becomes a saved chat explanation with no actionable draft; old question cards and assumptions are cleared. Provider/network errors also clear obsolete reply controls while preserving conversation and draft context.

Explicit existing-strategy answers bind to the selected saved strategy/revision even when model routing incorrectly proposes a new strategy. Clarification instructions distinguish stock benchmark strength from sector leadership, reject invented standalone benchmark operands, and require a choice before adapting a requested short strategy to long-only trading. No engine timeframe restrictions were relaxed.

Reproduction against the stored sector-breakout conversation generated both a 5m relativeStrength rule (supported: 1d/1w/1mo) and a period on close (unsupported). Source conversation was read only; no saved strategy, backtest or paper session was changed.

### Backtest shortlist reasoning

The inline assistant backtest requests suitability evidence and defaults to matches for the saved strategy's actual holding period (including long-term). It displays selection/exclusion reasons, profile checks, input dates and manual qualification origin. No matches means an empty default selection with an explanation, not arbitrary first-N stocks. Users can explicitly adjust the research scope. Current profile fit is not a buy signal or return forecast. The 200-stock tie-break remains alphabetical and is disclosed. Historical qualification does not apply present-day suitability retrospectively. Backtests still require the period/list review and explicit selection-bias acknowledgement; paper monitoring remains a separate action.

### Resume pending assistant work

Conversation snapshots now include the pending reply, question selections/custom answers/current question tab, unsent text and whether review was open. Reopening restores these controls without submitting answers or saving rules. Strategy and monthly review drafts are parsed again, checked against the saved revision and reviewed through the server before Save is enabled. Changed revisions require an updated draft. Older chats can recover saved questions and a retained draft, but unsaved answer selections that were never stored cannot be reconstructed. Attachments remain temporary; ongoing backtest form edits are not included in this change.
