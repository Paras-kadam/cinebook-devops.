# CineBook

Existing React/Vite/Tailwind + Express movie-booking application with ten original posters, movie search/filter, showtimes, seat selection, transactional booking, confirmation and private reference lookup. The original UI is preserved; no new website has been created. These are college demo tickets with no real payments.

**Hosting budget: US$0. Public deployment: pending free account setup, private Turso connection and live verification. No public URL is verified yet.**

The prepared hosting setup is **Render Free Docker + Turso Free managed SQLite/libSQL**. Render supplies HTTPS; Turso retains bookings when Render restarts/redeploys/sleeps. Free Render sleeps after 15 idle minutes and may take about a minute to wake. Open it before class. Free usage quotas apply; no paid disk, paid database, or overages are enabled. See the [beginner deployment guide](docs/DEPLOYMENT.md).

## Local Docker and monitoring

Start Docker Desktop in Linux-container mode, then PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
# Preserve an existing .env and its private Grafana credentials.
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
notepad .env
```

Set your own `GF_SECURITY_ADMIN_USER` and strong `GF_SECURITY_ADMIN_PASSWORD` privately. The working host ports avoid unrelated projects on 3000/3001/9090:

```powershell
$env:APP_PORT = '3080'
$env:PROMETHEUS_PORT = '9092'
$env:GRAFANA_PORT = '3002'
docker compose config --quiet
docker compose build app
docker compose up --detach --wait --wait-timeout 180
docker compose ps
Invoke-RestMethod 'http://localhost:3080/api/health'
```

Open CineBook **http://localhost:3080**, Prometheus **http://localhost:9092**, Grafana **http://localhost:3002**. Grafana provisions **CineBook Overview** and its real Prometheus data source automatically. Existing Grafana volumes retain their original credentials. All ports bind to localhost. These URLs are local demonstration evidence, not shareable public hosting.

Compose always uses app port **3000 inside Docker**. `APP_PORT` selects only the Windows host port; Prometheus addresses `app:3000`. Render uses **PORT=10000** and binds **0.0.0.0**. The browser uses relative `/api` calls on the same domain.

```powershell
docker compose logs --tail 100 app prometheus grafana
docker compose restart app
docker compose down
```

Ordinary `down` retains named volumes. **Never use `down -v`, `--volumes`, volume prune, or reset/delete the database when retaining bookings.** Keep the original Compose project name and `cinebook-data` volume key. The existing local records were backed up and checked unchanged.

## Development and verification

Use Node **24**, matching `.nvmrc`, CI and Docker. This checkout has a bundled runtime; the machine's default Node 22 does not match the project:

```powershell
$env:Path = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path + ';' + $env:Path
npm.cmd ci
npm.cmd run dev
```

Vite uses **http://localhost:5173** and proxies the API to configurable `PORT` (default 3001). If occupied, set `$env:PORT='3101'` before starting dev.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
docker build --tag cinebook:local .
npm.cmd run test:docker
node scripts/test-cloud.mjs
node scripts/test-turso-network.mjs
$env:SMOKE_BASE_URL = 'http://localhost:3080'
npm.cmd run test:smoke
```

The suite covers the original SQLite API, validation, competing reservations, rollback, persistence, security, metrics, and the async Turso client path. libSQL fixtures use a real local database engine, and a separate official libSQL server container verifies the HTTP protocol, rollback, sixty-seat writes and restarts; a parent test process removes generated fixtures after native Windows workers close their handles. Browser tests use a fresh private test database and Edge on Windows or Chromium in CI. Docker tests create their own random projects/volumes and remove only those generated test resources. `test-cloud.mjs` tests the disk-backed SQLite guardrail, not an actual free Turso/Render deployment. Local and live verification are recorded separately in [VERIFICATION.md](docs/VERIFICATION.md).

## Free cloud database setup

Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md) to create a free Turso **libSQL** database and free Render Docker service. The ignored `.env.production.local` has blank database fields and a private generated metrics token. Privately enter `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then:

```powershell
node --env-file=.env.production.local scripts/check-turso.mjs
```

This checks/initializes the remote database without logging credentials. Normal cloud mode accepts encrypted remote URLs only and refuses missing database tokens. Local Compose continues using its existing SQLite named volume. Cloud SQLite file mode still requires a real mounted disk, so accidental ephemeral storage remains blocked. Turso's committed remote database is the selected $0 persistence strategy.

The shared schema is created non-destructively; seed inserts ignore existing rows. Local SQLite uses WAL, full synchronization and an immediate transaction. Turso uses a remote write transaction and commits before confirming a ticket. Both enforce `UNIQUE(showtime_id, seat)` and server-calculated prices; failed reservations roll back all seats.

## Security and CI/CD

Booking references contain 192 random bits and grant access to their private ticket. No booking-list endpoint exists. JSON validation/body limits, API limits, security/privacy headers, safe route logs and same-origin access protect the demo. Cloud metrics require a bearer token; Grafana stays local. `.env*`, database files and private artifacts are excluded from Git, image context and CI uploads. Never put server secrets in `VITE_*` variables.

[GitHub Actions](.github/workflows/ci.yml) installs locked dependencies, runs tests and the production build, tests the browser, builds Docker and verifies isolated container persistence. CI verifies code; Render's GitHub integration performs CD. `render.yaml` uses `autoDeployTrigger: checksPass` so automatic main deployments require successful checks. The first deployment should use a verified main commit. No deployment credentials are committed.

| Endpoint | Purpose |
| --- | --- |
| `/api/health` | Application and active database connectivity |
| `/api/movies`, `/api/movies/:id` | Catalogue and details |
| `/api/showtimes`, `/api/movies/:id/showtimes` | Sessions/date/movie filters |
| `/api/showtimes/:id/seats` | Seat availability and pricing |
| `POST /api/bookings` | Validate and commit a reservation |
| `/api/bookings/:reference` | Private ticket lookup |
| `/metrics` | Real Prometheus instrumentation; authenticated in cloud |

See [deployment steps](docs/DEPLOYMENT.md), [Docker details](docs/DOCKER.md), [monitoring](docs/MONITORING.md), [college report](docs/DEVOPS_REPORT.md), and [current verification](docs/VERIFICATION.md).
