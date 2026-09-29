# DigitalOcean App Platform: paper-only deployment

No cloud resources have been created. The local MongoDB URI and data remain unchanged. Wait for the deployment MongoDB URI before migrating data. `.do/app.example.yaml` is a preparation template, deliberately without database resources or credentials.

## Components

| Component | Container / command | Network |
| --- | --- | --- |
| React + API | `backend/Dockerfile`; `node dist/server.js` | Public port 4100; `/health` |
| Data/qualification/backtest worker | Same image; `node dist/worker.js` | Background worker |
| Live feed worker | Same image; `node dist/feed.js` | Outbound broker WebSocket; one replica |
| Paper worker | Same image; `node dist/paper.js` | Background worker; one replica |
| Python engine | `engine/Dockerfile` | Internal port 8100; no public ingress |

Build both Dockerfiles from the repository root. The backend image builds React and serves its assets and SPA routes from `FRONTEND_DIST`; `/api` stays on the same origin. Root `npm start` / `npm run dev` are local launchers, not production commands. Keep components running continuously; do not enable scale-to-zero.

```sh
docker build -f backend/Dockerfile -t quantforge-backend .
docker build -f engine/Dockerfile -t quantforge-engine .
```

## Owner sign-in

Run `npm run configure:owner` in an interactive terminal. It asks for an email and hidden password twice, then saves only a salted scrypt hash in ignored `backend/.env`. Configuring this also enables real sign-in locally; leave the variables empty to retain development-only loopback access.

Copy `OWNER_EMAIL` and `OWNER_PASSWORD_HASH` to encrypted deployment runtime settings. Never put passwords, workspace tokens or broker secrets in Vite variables. Hosted sessions use Secure, HttpOnly, SameSite cookies, server-side expiry, CSRF checks, logout revocation and a shared sign-in rate limit. Changing the owner password hash invalidates old sessions. No client/admin roles are required for this private workspace.

Production startup fails without owner credentials, HTTPS origin and required server keys. Local session bootstrapping is disabled in production. `WORKSPACE_TOKEN` is for trusted service/CLI requests, not browser login.

## Runtime settings

All Node components need `MONGODB_URI`, `REDIS_URL`, `ENGINE_URL`, `ENGINE_TOKEN`, `WORKSPACE_TOKEN`, `SECRET_ENCRYPTION_KEY`, `NODE_ENV=production`. The web component also needs `OWNER_EMAIL`, `OWNER_PASSWORD_HASH`, `FRONTEND_ORIGIN=https://your-app-address`. The container sets `HOST=0.0.0.0`, `PORT=4100`, `FRONTEND_DIST=/app/frontend/dist`.

Set the same `ENGINE_TOKEN` on Python and its callers. Use `http://engine:8100` when the component is named `engine`; only `web` receives public ingress. Broker configuration:

- API: Dhan client/app settings for connection management and renewal; Gemini key if using AI. Also set the Motilal credentials listed below on the API when enabling Motilal, because connection validation checks their presence before saving subscriptions.
- Data worker and paper worker: `DHAN_CLIENT_ID`, plus shared encrypted connection records.
- Feed worker: `DHAN_CLIENT_ID` for fallback; `MO_CLIENT_CODE`, `MO_PASSWORD`, `MO_2FA`, `MO_API_KEY`, `MO_API_SECRET_KEY` for Motilal. TOTP is optional; a manual OTP challenge still needs user input. Use actual cloud-host device metadata, not copied local hardware identifiers.

Register Dhan's hosted `/connections/dhan/callback` URL if using consent login. Automatic renewal requires an eligible saved Dhan Web token before expiry. An expired token needs a fresh login. API startup checks due renewals; live streams reconnect when the saved token changes.

## Persistent data: deferred until the URI is supplied

Use persistent MongoDB with replica-set transactions and persistent Redis with a no-eviction policy. App Platform container disks are temporary; do not keep the only database inside an application container.

When migrating later, back up and copy the database, preserve **SECRET_ENCRYPTION_KEY** so saved credentials remain readable, then change the URI on every component together. Stop local paper/feed workers before enabling hosted ones. Do not run local and hosted copies against shared MongoDB but different Redis coordination databases.

## Feed and candle lifecycle

- Connections & Data offers Automatic (Motilal then Dhan fallback), Motilal only, or Dhan only. Motilal's reported broadcast limit is respected, never overridden.
- Subscriptions persist in MongoDB and reconnect during regular trading-day feed hours, 09:00-16:00 IST. Disconnect persistently disables reconnect. Failures retry with increasing delay up to five minutes. Each reconnect creates a new quote session, preventing old ticks from filling orders.
- Feed/paper components use single-owner leases. Replacement workers wait for the previous worker during rollout. Keep one replica each.
- Only monitored/held stocks get Dhan historical warm-up and completed-bar refresh. Intraday refresh is approximately once a minute, subject to scope and provider limits. Daily refresh retries after close. Downloads do not block paper fills. The full stock universe is never downloaded every minute.
- Daily signals can be calculated after hours without live quotes. Paper orders wait for subsequent fresh ticks. Daily signals expire 30 minutes into the next regular session; confirmation mode still needs approval. Missing/stale data is retried. Completed per-stock evaluations persist across restarts.
- Regular cash sessions use 09:15-15:30 IST. Included 2026 holidays follow [NSE circular CMTR71775](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf). Add extra closures via `MARKET_HOLIDAYS` (comma-separated ISO dates). For a new year, load its complete holiday list and add the year to `MARKET_CALENDAR_YEARS`. Unknown years stop paper execution. Special sessions are excluded. Review calendar amendments before deployment.

## Preflight

Use **Connections & Data > Check readiness**, or `npm run check:deployment` while the API runs. For hosted checks set `CHECK_APP_URL` and use that deployment's server-side `WORKSPACE_TOKEN` locally. This is read-only; it does not start sessions, import data or submit orders. Local checks correctly flag hosted login/HTTPS as pending configuration.

Check subscriptions cover monitored and held stocks, Dhan renewal is enabled, all workers and the engine are reachable, and required history is loaded. Begin with confirmation mode. During the first supervised market session verify fresh ticks, a completed-candle signal, a confirmed paper fill, and an exit. Automated fixtures are not proof of live broker connectivity.

References: [internal routing](https://docs.digitalocean.com/products/app-platform/how-to/manage-internal-routing/), [app spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/), [workers](https://docs.digitalocean.com/products/app-platform/how-to/manage-workers/), [storage](https://docs.digitalocean.com/products/app-platform/details/limits/), [Dhan feed](https://dhanhq.co/docs/v2/live-market-feed/).
