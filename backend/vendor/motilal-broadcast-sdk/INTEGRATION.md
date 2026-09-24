# Local integration notes

The supplied Motilal 3.1 SDK is an isolated CommonJS dependency; first-party application code is TypeScript ESM. Only authentication and market-data methods are exposed by the child-process adapter.

`backend/scripts/harden-vendor.ts` applies two local changes: disable the SDK's file logger, and enable certificate validation on its WebSocket clients. Console output is separately suppressed by the child adapter. Re-audit and reapply these changes when upgrading the SDK. Never print request headers or tokens while diagnosing the connection.

The adapter explicitly requests and installs an access token after verified login. The SDK broadcast-limit method returns `undefined`, so the adapter observes its existing Axios instance's unwrapped response. Retail accounts use an empty client-code parameter. Positive broker-reported limits are installed through the SDK setter; a zero/missing limit blocks subscriptions with a descriptive status.
