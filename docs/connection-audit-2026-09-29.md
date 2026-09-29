# Connection verification — 29 September 2026

Verified against the local workspace during market hours, approximately 11:52–12:12 IST. These are observed results, not a guarantee of future provider availability.

| Component | Result | Evidence / limitation |
| --- | --- | --- |
| Dhan authentication | Working | Profile request accepted the saved token and matched the configured account. |
| Dhan quotes | Working | RELIANCE quote returned a valid price and provider trade timestamp. |
| Dhan daily history | Working | Six daily candles returned for the requested September date range. |
| Dhan live execution data | Fixed and verified | Direct fresh tick test passed on Node 20 and 24. After the app restart, the shared feed was live with 12 subscriptions. |
| Dhan stock-chart stream | Fixed and verified | A real quote was received through `StockQuoteStream` on Node 20 without a native global WebSocket. |
| Dhan renewal | Scheduled | Automatic renewal is enabled. Next attempt: 30 September, 08:49 IST; token expiry: 09:19 IST. The audit did not rotate an unexpired token. |
| Dhan Data API plan | Active | Profile reported validity through 9 October 2026. |
| Motilal login | Working | Login verification and access-token generation succeeded. |
| Motilal broadcast | Fixed and verified in the running app | Follow-up probes at 12:36–12:38 IST received actual RELIANCE ticks despite a successful `MaxBroadcastLimit: 0`. After correcting the adapter, the app's existing 12 subscriptions reconnected at 12:45 IST and delivered fresh Motilal ticks. SDK 3.1 treats zero as its default of 200 via its setter. The earlier account-access diagnosis was incorrect. |
| NSE snapshots | Working | 45 intraday index snapshots returned; remaining catalogue entries may use daily data or remain unavailable. |
| BSE snapshots | Working | 48 index snapshots returned. These exchange snapshots are polled data, not a broker tick feed. |
| Gemini | Working | Both configured-model access and a minimal structured generation request succeeded. |
| MongoDB / Redis | Working | Database ping, Redis PONG and transactional database readiness passed. |
| Python / data / paper workers | Working | Engine health and all worker heartbeat checks passed. |

## Connection fix

The user's running launcher used Node 20.19.2, where `globalThis.WebSocket` was undefined. Both Dhan streaming clients assumed a native WebSocket existed, causing connection initialization to fail even though REST authentication worked. Both now import the existing backend `ws` package explicitly and use bounded handshake timeouts. No broker order endpoints were added. See the [ws client documentation](https://github.com/websockets/ws#usage-examples) and [Dhan live feed protocol](https://dhanhq.co/docs/v2/live-market-feed/).

The app was restarted after confirming that no scans/backtests were running and no paper positions were open. It resumed with the project's Node 24 runtime. All seven saved sessions retained their mode, active status, selected stocks and strategy revision. Subscription recovery was automatic; no session or order was manually started for this audit.

Hosted owner sign-in and HTTPS origin remain deployment setup items. This audit verifies the local workspace; it does not certify an unconfigured cloud deployment or claim every provider supplies every stock field.

## Motilal follow-up

Comparison with the old TradeIQ project identified that QuantForge stopped before `Broadcast_connect` when the subscription-limit API returned zero. Independent read-only probes received genuine timestamped RELIANCE ticks through both the old connection sequence and QuantForge's login/access-token sequence. No IP whitelist changes were made. This proves streaming worked for this account/network at the time of testing; it does not establish the meaning of every provider error or guarantee future availability.

The adapter now invokes the vendor's limit setter and reads its effective limit, including SDK 3.1's explicit zero-to-200 behaviour. Missing/invalid limit data and rejected authentication still fail; lower positive limits remain enforced. The actual vendored setter is covered by a network-free regression test. Streaming rejection/disconnection messages are handled during the handshake as well as after subscriptions start. Real ticks, not a socket-open event, determine the feed's live state.

At 12:45 IST the running app's existing connection request was reissued without changing its provider preference or stock set. It switched from Dhan fallback to Motilal automatically. Three successive observations showed fresh Motilal quotes, including changing LAURUSLABS and WELCORP prices. All seven saved paper-session configurations were unchanged; orders remained 18 and open positions remained zero. No broker orders were sent. Six focused Motilal tests, the backend production build and targeted lint passed. This verifies the current connection and fresh tick path, not a full-session uptime guarantee.

## Shared feed and overflow verification

At 13:18–13:22 IST, the local app was restarted with the shared stock-feed worker. The seven saved paper-session configurations remained unchanged. Actual SSE observation received 26 Motilal quote updates whose provider session matched the execution quote cache. A temporary read-only demand lease expanded subscriptions to 222: Motilal handled 200 and Dhan handled 22. The stock-view relay delivered genuine Dhan and Motilal ticks, with every sampled session matching the shared cache. Opening/closing consumers can change the research allocation; it never creates a paper session.

After closing the diagnostic views and removing the lease, the worker returned to the original 12 Motilal subscriptions. Orders remained 18 and open positions remained zero. A real browser inspection of KESAR on BSE showed its quote, OHLC, volume, chart/indicators, Motilal connection badge and the original last-trade time, with no browser errors. Its quiet quote correctly remained “Last received” while the feed was connected.

Validation passed: 20 focused backend tests; automatic paper-subscription integration; isolated worker/Redis restart and execution-pause integration; three stock-chart browser tests; backend/frontend production builds and lint. A browser-test fixture was corrected to count active streams under React Strict Mode. The worker restart test was given a 20-second Windows startup allowance after a timeout under concurrent tooling load. Forced-provider failure is covered by transport tests; no live outage or broker order was deliberately triggered. This is a point-in-time connection check, not a full-day uptime or profitability claim.
