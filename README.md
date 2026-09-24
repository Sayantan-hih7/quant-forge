# QuantForge

A local cash-equity research and paper-trading workspace: React/TypeScript, Ant Design, RHF + Zod, Zustand and Recharts; Express/TypeScript native ESM, Mongoose/MongoDB, Axios interceptors, Redis/BullMQ; a separate Python calculation engine. No broker order endpoint is implemented.

## Local startup

Use Node 24, Python 3.13 and Docker Desktop. From the repository root, install once:

```sh
npm ci
npm run setup
```

For everyday use, open Docker Desktop and run just:

```sh
npm run dev
```

On this Windows workstation you can also **double-click `start.cmd`**. It uses the portable Node runtime when available and installs JavaScript dependencies if absent. Both entry points use the same launcher.

The launcher starts MongoDB/Redis if needed, waits for the Python engine and API, then starts the data, market-feed and paper workers plus Vite. Logs are labelled by service. It checks for occupied app ports and stops its child processes if a service fails. **Ctrl+C stops the app; the database containers and their data stay intact.** Use `npm run infra:down` to stop the containers without deleting their volumes. Frontend, API and engine reload on edits. Workers stay running during edits so long imports are not interrupted; restart the launcher after changing worker code. Interrupted BullMQ jobs are recovered through its stalled-job handling on restart.

`npm run setup` creates private `backend/.env` only when absent and installs the Python environment. Existing credentials are preserved. Startup also performs this setup if needed. Fill broker credentials locally; never put secrets in Vite variables. MongoDB uses **27019**, Redis **6381** and a replica set for ledger/publication transactions. The root `package-lock.json` manages both npm workspaces: do not install separately in each folder.

| Root command | Purpose |
| --- | --- |
| `npm run dev` / `npm start` | Complete local app |
| `npm run dev:frontend` | Frontend only |
| `npm run dev:backend` | API only |
| `npm run dev:engine` | Python engine only |
| `npm run dev:worker` / `dev:feed` / `dev:paper` | Individual backend workers |
| `npm run build` | Build frontend and backend |
| `npm run lint` | Lint both apps and type-check launch scripts |
| `npm test` | Backend, Python and startup tests |
| `npm run test:ui -- <file.spec.ts>` | Frontend browser tests |
| `npm run infra:up` / `infra:down` | Start or stop local databases |

Individual service commands require their dependencies to be running. Run `npm run setup` before using them on a fresh checkout. `npm start` is a **local development launcher**; deployed components use their separate production commands below.

Open `http://localhost:5173`. The API is on 4100 and the internal engine on 8100. The default route opens the restored Dashboard. The full sidebar stays available from every local workspace page without admin/client onboarding. **Market Data → Indices** retains the NSE/BSE overview, category tabs, global suggestions, Recharts and details, backed by official exchange snapshots and daily closing reports. It works independently of broker login. **System → Connections & Data** contains connection setup and stock-universe update status. Dashboard metrics and account screens remain labelled design previews; planned modules keep their navigation links.

## Workflow

1. **Connections & Data**: the data worker automatically refreshes the NSE/BSE cash-equity instrument master on the 1st of every month at 02:00 Asia/Kolkata. New listings are upserted into the universe; missing listings become inactive and historical records are retained. The page shows the next update, last success and new-company/listing counts. Motilal mappings, index memberships, pledge reports and completed-month delivery still have separate import controls. Connect Dhan with a current Data API token or the consent flow, then download history and company metrics. Register `/connections/dhan/callback` as the OAuth redirect.
2. **Qualification**: edit the single monthly rule, save, queue data preparation and a real scan, review results and publish. The worker caches missing supported company metrics and daily history before evaluation, skipping further downloads only for definitively rejected stocks. Progress separates cache checks, company data, price history and evaluation. Coverage checks both indicator operands and enough completed monthly observations; missing reports stay unavailable. The optional Gemini assistant updates only the draft until you save. Only manually added stocks can be removed. Snapshots are retained for historical evaluation.
3. **Algo strategies**: retain the manual buy/sell builder and risk controls. Both sides save together. The optional Gemini assistant supports free-form requests and follow-up changes to both sides and risk settings. AI proposals require validation, review and explicit apply/save. Set `GEMINI_API_KEY` in private `backend/.env`; see [AI assistant setup](docs/ai-assistant.md). The Backtests tab uses stored candles, not generated prices.
4. **Signal Runner**: create a paper session from a saved strategy and choose automatic orders or confirmation. Entries scan the current published monthly list; held stocks retain sell checks after leaving that list. A session pins its original rule/risk configuration.
5. **Paper Trading**: inspect positions, confirm/cancel pending orders or manually buy/sell. Orders need subsequent fresh Motilal ticks and enforce cash, quantity, stops and position limits. Manual intervention pauses automatic entries; protective exits remain active.

## Verified data and current limits

- Public source imports are working for instruments, selected NSE/BSE index memberships, monthly delivery/turnover and NSE pledge. BSE pledge's current endpoint is unreliable and is reported as unavailable, without substituting invented values.
- Dhan's current company-information API can supply valuation, profitability, balance-sheet and ownership snapshots. These cannot be treated as historical point-in-time facts before collection. Revenue/profit growth, news and pattern fields without verified adapters are rejected.
- Motilal credential verification and access-token generation succeeded on this workstation. The retail broadcast-limit response returned `0` / `NO RECORDS FOUND`; this is separate from the resolved invalid-password error. No live tick/fill is claimed verified yet.
- Dhan history requires an active daily token; the subscription alone is insufficient. Dhan Web Access Tokens can renew automatically 30 minutes before expiry while the backend is running. OAuth/redirect tokens are not eligible; an expired token requires a fresh connection. See [automatic renewal setup](docs/dhan-auto-renewal.md). No synthetic prices are substituted if authentication or coverage is missing.
- Backtests support up to 100 qualified stocks and one year per request, bounded to 150,000 loaded candles per calculation. Select a smaller stock scope for large intraday histories. Historical mode uses recorded monthly snapshots; current-list mode explicitly acknowledges selection bias. Fees/slippage are estimates; corporate-action adjustment, exchange-calendar coverage and partial-history completeness need further market-data validation.
- The **stock-master refresh** has a persistent BullMQ cron schedule, five retries with exponential backoff, and startup catch-up for a missed current cycle. A successful manual master refresh also satisfies that cycle. MongoDB, Redis and the data worker must run; no background task executes while this workstation is off. Incomplete provider snapshots and reused instrument IDs with changed company identity are rejected for review. Publication is transactional. See [monthly universe operations](docs/monthly-universe.md).
- **Qualification scans and publication remain user-triggered**. Refreshing the stock master does not qualify stocks. Starting a monthly scan now prepares missing supported company inputs and price history automatically, with persistent caches and provider cooldowns. Automatic login after a token has expired and production authentication are not yet enabled. AI drafting requires a valid Gemini key and available quota; failures never fall back to simulated responses. A stream gap discards affected minute candles. Intraday filling uses regular weekday session hours and fresh ticks; special sessions need an exchange calendar.
- There is no real-money execution, margin, short selling, futures/options or client tenancy in this phase.

## Source layout

```text
quant-forge/
├── frontend/          # React source, public assets, Vite config and browser tests
├── backend/           # Express API, workers, models and backend tests
├── engine/            # Python calculations and engine tests
├── scripts/           # TypeScript setup/start/test orchestration
├── docs/
├── compose.yaml       # Persistent local MongoDB and Redis
├── package.json       # Root commands and npm workspaces
├── package-lock.json  # Shared dependency lock
└── start.cmd          # Windows launcher
```

`backend/src/modules/<feature>/{models,validations,services,controllers,routes}` owns each feature; small routing adapters may delegate directly to services. Shared configuration, Axios, Redis, database and error handling live outside feature modules. All Node application source is `.ts` with `import/export`; NodeNext compiles to native ESM `.js` under `type: module`. The third-party Motilal SDK is the isolated `.cjs` compatibility exception. `engine/quantforge` contains Python indicators, qualification, causal replay and backtests.

`frontend/src/components/forms` provides reusable RHF/AntD controls. Feature code remains under `frontend/src/modules`; backend state uses Axios and Zustand. Light, dark and system modes remain available. Frontend output is `frontend/dist`; backend output is `backend/dist`.

## Verification

```sh
npm run build
npm run lint
npm test
```

Set `RUN_DB_TESTS=1` before the backend tests to exercise publication and ledger transactions in isolated `quantforge_test_<uuid>` databases. These tests clean up only their own database. Browser smoke checks cover the real core routes and strategy save/reload. Older preview-only Playwright cases are not a certification of the backend flow.

See [backend architecture](docs/backend-architecture.md) and [DigitalOcean preparation](docs/deployment.md). Dockerfiles are supplied; no cloud deployment has been performed.
- Qualified-stock details: last prices and daily movement stream from Dhan into the list and stock drawer. The drawer includes TradingView Lightweight Charts, dated company facts and the original qualification context. See [stock prices and charts](docs/stock-details.md).
- Indices: all 114 curated NSE/BSE indices returned real prices in the local coverage check (93 intraday snapshots, 21 daily closes). Coverage is reported dynamically, not guaranteed permanently. With auto-update enabled, public website data is checked every 15 seconds, separately from the paper execution feed. Source dates, missing metrics and cached values are explicit. See [index sources](docs/index-data.md).
