# CineBook

An existing college movie-booking application built with React, Vite, Tailwind CSS, Express, and SQLite. The original design and ten local movie posters are preserved. Visitors can search/filter films, select showtimes and seats, confirm bookings, print demo tickets, and retrieve tickets using private booking references. This is a college demonstration; it processes no payments and issues no real cinema tickets.

**Public deployment status: not deployed or verified yet. No public website URL has been issued.** The prepared Render service requires owner approval for paid compute/storage and a connected Render account. A localhost address is local verification only.

Recommended hosting is one Render Docker web service with a 1 GB persistent disk, approximately **US$7.25/month before tax and usage extras**, based on [Render pricing](https://render.com/pricing), checked 28 October 2026. Render's Free service cannot retain this application's SQLite bookings safely. A database migration is unnecessary for the recommended option. See the [beginner deployment guide](docs/DEPLOYMENT.md) before creating resources.

## Start locally with Docker

Open Docker Desktop and wait for the Linux engine. In PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
# Create .env only if you do not already have one; preserve existing credentials.
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
notepad .env
```

Privately fill in `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD`. Choose a strong unique password. Set these host ports in the same terminal; they avoid other projects currently using 3000, 3001, and 9090:

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

Open CineBook at **http://localhost:3080**, Prometheus at **http://localhost:9092**, and Grafana at **http://localhost:3002**. Prometheus and Grafana are local only. Grafana provisions **CineBook Overview** automatically. Use the credentials from your private `.env`; existing Grafana volumes keep their original login credentials.

Express always listens on port **3000 inside Compose**, while `APP_PORT` controls the Windows host port. Render uses `PORT=10000` and binds on `0.0.0.0`. Prometheus addresses `app:3000`, independent of the Windows port.

```powershell
docker compose logs --tail 100 app prometheus grafana
docker compose restart app
docker compose down
```

Ordinary `down` retains named volumes. **Never use `down -v`, `--volumes`, volume prune, or reset/delete the database when retaining bookings.** Keep the original Compose project name and the `cinebook-data` volume key.

## Development and verification

Use Node.js **24**, matching `.nvmrc`, CI, and Docker. The machine's default Node 22 does not match this project's declared runtime. This checkout has a bundled runtime:

```powershell
$env:Path = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path + ';' + $env:Path
node --version
npm.cmd ci
npm.cmd run dev
```

Vite opens at **http://localhost:5173** and proxies `/api` to the configurable backend `PORT` (default 3001). If 3001 is occupied, set `$env:PORT='3101'` before `npm.cmd run dev`. Production builds use same-origin relative `/api` requests, with no localhost API URL embedded in the browser bundle.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:docker
$env:SMOKE_BASE_URL = 'http://localhost:3080'
npm.cmd run test:smoke
```

Browser tests use installed Edge on Windows; CI installs Chromium. Each run uses a fresh ignored browser test database. API tests use memory or generated temporary fixtures. Docker tests use a random isolated Compose project and remove only volumes they create during that test. Monitoring verification creates one deliberate demo booking; see [monitoring instructions](docs/MONITORING.md).

## Persistence and privacy

SQLite resides at `/app/data/cinebook.sqlite` in the named Docker volume or the Render disk mounted at `/app/data`. Schema initialization uses `CREATE TABLE IF NOT EXISTS`; catalogue/showtime seeding uses `INSERT OR IGNORE`, retaining existing rows and reservations. No destructive migration is required. WAL, full synchronization, an immediate transaction, and the unique `(showtime_id, seat)` constraint prevent partial/double bookings. Prices are calculated by the server.

Cloud startup checks both the database path and the actual mounted filesystem. It refuses ephemeral cloud storage. The same persistent disk can serve one instance; redeployments briefly interrupt service. Take consistent online backups with `node server/backup.js` in the Render Shell, or `docker compose exec -T app node server/backup.js` locally. Download backups privately off the service; copies on the same disk are not protection against disk/service deletion.

A random 192-bit booking reference grants access to its ticket. Treat it like a private link; no public booking-list endpoint exists. API responses are not cached. Request limits, JSON size limits, safe log fields, security headers, and same-origin API access protect the public demo. Production `/metrics` requires a secret bearer token. `.env`, databases, test artifacts, and local credentials are excluded from Git and Docker build context.

## CI and deployment

[GitHub Actions](.github/workflows/ci.yml) runs locked dependency installation, 71 current API/startup/security tests, the Vite build, browser tests, a production Docker build, and container/SQLite persistence tests on main, supported feature/fix branches, and pull requests. It uploads verification artifacts on failure/success.

CI verifies code. CD changes the hosted service. [render.yaml](render.yaml) uses `autoDeployTrigger: checksPass`; after connection, Render deploys main only when its GitHub checks pass. Its GitHub integration handles authentication without putting deploy-hook tokens in source. For the first deployment, confirm main's CI result before creating the service. Future manual deployment buttons can bypass automatic CI gating; deploy only the verified commit.

| API | Purpose |
| --- | --- |
| `GET /api/health` | HTTP and SQLite health |
| `GET /api/movies`, `/api/movies/:id` | Catalogue and movie details |
| `GET /api/showtimes` | Sessions, optionally filtered by `movieId` and `date` |
| `GET /api/movies/:id/showtimes` | Seven upcoming dates and sessions |
| `GET /api/showtimes/:id/seats` | Availability and server pricing |
| `POST /api/bookings` | Validated transactional reservation |
| `GET /api/bookings/:reference` | Private reference-based ticket retrieval |
| `GET /metrics` | Real Prometheus instrumentation; bearer-protected in cloud |

Read [deployment steps](docs/DEPLOYMENT.md), [Docker details](docs/DOCKER.md), [local and cloud monitoring](docs/MONITORING.md), and the [college report and verification record](docs/DEVOPS_REPORT.md).
