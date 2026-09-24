# Motilal Oswal broadcast SDK (vendored)

`MOFSLOPENAPI_V3.1.cjs` is Motilal Oswal's own, unmodified, officially-published Node.js OpenAPI SDK, sourced from `https://github.com/motradingapi/NodeJSSDK` (file `MOFSLOPENAPI_V3.1.js`, renamed to `.cjs` here only so Node's ESM loader in this `"type": "module"` package treats it as CommonJS — no other change).

It is vendored (not installed from npm) because MO does not publish it to npm. Only its broadcast/WebSocket surface (`Broadcast_connect`, `Register`, `UnRegister`, `IndexRegister`, `IndexUnregister`, `onBroadcast`, `GetMaxBroadcastLimit`, `BroadcastLogout`, `setAccessToken`, `setClientID`) is used by `backend/src/services/market-data/motilal-tick-source.ts` — see `MARKET_DATA_PHASE_10_HANDOFF.md` for why. The SDK's REST-wrapping methods (login, orders, holdings, etc.) are intentionally not used; `backend/src/providers/motilal-oswal.ts` remains the sole REST client.

The file is minified/obfuscated by its publisher; do not attempt to hand-edit it. If MO publishes a new version, replace this file wholesale and re-verify against `README.txt`.
