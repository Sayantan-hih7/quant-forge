# Local integration notes

The supplied Motilal 3.1 SDK is an isolated CommonJS dependency; first-party application code is TypeScript ESM. Only authentication and market-data methods are exposed by the child-process adapter.

`backend/scripts/harden-vendor.ts` applies two local changes: disable the SDK's file logger, and enable certificate validation on its WebSocket clients. Console output is separately suppressed by the child adapter. Re-audit and reapply these changes when upgrading the SDK. Never print request headers or tokens while diagnosing the connection.

The adapter explicitly requests and installs an access token after verified login. The SDK broadcast-limit method returns `undefined`, so the adapter observes its existing Axios instance's unwrapped response. Retail accounts use an empty client-code parameter.

Every successful, explicit numeric limit is passed to `setMaxBroadcastLimit`, then the adapter reads the SDK's effective `m_intBroadcastLimit` and enforces it before subscribing. SDK 3.1 maps zero to its default of 200; zero is not evidence that streaming is forbidden. Missing, malformed and failed limit responses remain errors and never activate that default. A positive account limit is respected. The workspace independently caps subscriptions at 200. The feed is only marked live after receiving fresh, timestamped quotes; opening a socket alone is insufficient.

Verified 2026-09-29 during market hours: the same account returned a successful `MaxBroadcastLimit: 0` response while delivering real RELIANCE ticks. The old project also received ticks using its connection sequence. The earlier interpretation of zero as blocked account access was incorrect. No IP whitelist change was needed for these tests. A regression test exercises the actual vendored setter without network requests.
