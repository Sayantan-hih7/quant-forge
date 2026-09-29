# Shared live stock prices

Qualification, stock charts, Signal Runner and Paper Trading now use one feed owner. This does not change monthly qualification membership, strategy rules, historical candle downloads or broker order permissions.

## Subscription routing

- Active paper holdings and pending/confirmation orders have first priority, followed by monitored strategy stocks and optional saved extra stocks.
- Open charts then visible list rows request the remaining capacity. A stock shown in several places is subscribed once per exchange/security ID.
- Automatic mode: up to the effective Motilal limit, capped at 200; overflow or unmapped Motilal stocks go to Dhan when its saved connection is valid.
- Total capacity is 5,000 unique instruments, leaving room for all Motilal stocks to move to Dhan during failover. Dhan subscription/unsubscription messages contain at most 100 instruments.
- A lower positive Motilal account limit is respected. The SDK's verified zero-as-default behavior remains 200. Missing/error limit responses never activate a connection.
- Motilal failure switches its stocks to Dhan. An already healthy Dhan socket is retained. To avoid repeated disruption, automatic mode retains Dhan fallback for that worker/day. Strict single-provider modes retry their selected provider with backoff. A Dhan failure does not stop working Motilal subscriptions.
- Provider preferences are workspace-wide. Missing credentials/mappings/capacity remain visible; unavailable prices are never invented.

## Price and execution integrity

Each provider connection has a unique session. Ticks are accepted only for its assigned instruments, with valid timestamps, positive prices and nondecreasing trade times. Old socket callbacks are invalidated when stopped. Membership changes use incremental subscription messages, without reconnecting existing positions.

The worker publishes rich stock quotes and minute previews via Redis Pub/Sub; API SSE connections only relay them. The worker builds execution candles and durable tick events only for enabled execution demand. A chart cannot enable execution, and an explicit execution pause still blocks paper fills while research views stream.

Execution requires a current provider session, the current saved execution request, and a trade timestamp within 15 seconds. Research UI shows feed connection separately from last-trade time. A quiet stock can be connected while displaying “Last received.” Dhan REST snapshots supply missing OHLC/previous-close details and fallback prices; they never replace a recent stream's price/session/time or cumulative volume. Historical candles still use Dhan.

## API demand leases

Each API instance renews its combined visible/chart demand every five seconds in `quantforge:research:demand`. Leases expire after 25 seconds; compare-and-delete cleanup cannot erase a concurrent renewal. View closure publishes reduced demand immediately, which the worker reconciles within two seconds. A browser opens SSE independently of REST snapshots, including when Dhan REST fails.

## Validation

Focused backend tests cover routing, deduplication, overflow, lower limits, independent retry, failover, stale-session rejection, snapshot enrichment, live candle gaps, Dhan token rotation and incremental subscriptions. Mongo integration tests cover automatic paper subscription ownership, priority and demand above 200. An isolated Redis/Mongo worker restart test covers durable restoration and immediate execution pause. Browser tests cover stock charts, live labels, failed snapshots and provider-session changes.

Provider documentation: [Dhan live market feed](https://dhanhq.co/docs/v2/live-market-feed/) and [Motilal Node SDK](https://github.com/motradingapi/NodeJSSDK). The shared subscription capacity does not change the separate per-strategy/backtest workload limits.
