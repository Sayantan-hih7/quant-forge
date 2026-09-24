# DigitalOcean App Platform preparation

The Dockerfiles are prepared; no cloud deployment has been performed. Build both from the repository root:

```sh
docker build -f backend/Dockerfile -t quantforge-backend .
docker build -f engine/Dockerfile -t quantforge-engine .
```

| Component | Image / command | Network |
| --- | --- | --- |
| API | Backend image; `node dist/server.js` | Port 4100; `/health` |
| Import/qualification/backtest worker | Backend image; `node dist/worker.js` | No public ingress |
| Motilal feed worker | Backend image; `node dist/feed.js` | Outbound broker WebSocket; one replica |
| Paper worker | Backend image; `node dist/paper.js` | No public ingress; one replica |
| Python engine | Engine image; default command | Internal port 8100; no public ingress |
| React frontend | From repository root: `npm ci && npm run build:frontend`; publish `frontend/dist` | SPA fallback to `index.html` |

Use external persistent MongoDB with replica-set transactions and Redis with persistence/no-eviction. Local Compose is a development database setup, not a production database deployment. App Platform local filesystems are ephemeral.

Both npm apps use the root workspace lockfile. The backend Docker build installs only its workspace plus build tools from that lockfile. Keep the build context at the repository root. The root `npm start`/`npm run dev` commands are local launchers; deploy the separate API, worker and engine commands above.

API, job worker, feed and paper worker share the MongoDB/Redis connections. Only the feed worker needs Motilal credentials. API and import worker need Dhan configuration and the shared encryption key. Set `ENGINE_URL` to the internal engine URL and share `ENGINE_TOKEN` only with its callers. Set `HOST=0.0.0.0`, `NODE_ENV=production` and the actual `FRONTEND_ORIGIN`. Store secrets in encrypted component environment variables; never build them into Vite assets.

Before public deployment, implement production workspace authentication and same-origin `/api` routing. The current browser session bootstrap deliberately accepts only a local loopback origin and is disabled in production; a secret bearer token supports private service calls, not a public browser login. Configure Dhan’s callback for the deployed `/connections/dhan/callback` URL. Verify broker outbound-IP and device-header requirements on the deployed host, along with broadcast entitlement, reconnect behavior, exchange holidays and source coverage. Do not copy local hardware identifiers as cloud hardware metadata.

References: [internal routing](https://docs.digitalocean.com/products/app-platform/how-to/manage-internal-routing/), [environment variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/), [workers](https://docs.digitalocean.com/products/app-platform/how-to/manage-workers/), [persistent storage](https://docs.digitalocean.com/products/app-platform/how-to/store-data/).
