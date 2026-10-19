# CineBook

A cinema booking demo for a college DevOps project. Browse ten original films, filter by genre and language, sort by title or sample rating, choose a showtime and seats, confirm a reservation, and retrieve or print the ticket using its booking reference. Each film has distinct local poster artwork, a synopsis, price, and upcoming shows. This demo does not process payments or issue real cinema tickets. Ratings are clearly labeled demo/sample data.

## Movie-loading fix

The original Vite proxy sent `/api` requests to port 3000, which was occupied by Grafana. Its `/api/health` returned `database: "ok"` and a Grafana version, while `/api/movies` returned HTTP 401. React therefore received another application's response and showed the intermission error and a zero count. The existing SQLite database opened successfully; it was not the cause.

CineBook now defaults to API port 3001. The API and Vite proxy read the same root `.env` configuration. Before serving the development UI, Vite waits for CineBook's exact healthy response instead of accepting a health endpoint from another service. API outages show a clear retry state; loading uses poster skeletons. No frontend mock catalogue or fake booking response is used.

## Run locally

Use Node.js 24 and npm. The `.nvmrc` and `package.json` declare the supported Node version.

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite serves the React app and proxies `/api` and `/metrics` to Express on port 3001. `npm run dev` starts both services. Stop both servers with Ctrl+C. Stop an existing run before starting another on the same ports.

To serve the production build from one process:

```sh
npm run build
npm start
```

Open <http://localhost:3001>. Check <http://localhost:3001/api/health> for database connectivity.

If Node.js 24 is not on your Windows PATH, this workspace also includes a local runtime. In PowerShell, activate it for the current session before running npm commands:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
$runtimeDir = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path
$env:Path = $runtimeDir + ';' + $env:Path
npm.cmd run dev
```

The `.tools` directory is ignored by Git; a fresh checkout needs its own Node.js 24 installation.

## Configuration and data

The defaults work without an `.env` file. Copy `.env.example` to `.env` to customize them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express API and production website port; Vite proxy follows it. |
| `APP_PORT` | `3080` | Windows host port for Docker Compose; container Express stays on 3000. |
| `VITE_PORT` | `5173` | Development website port. |
| `DB_PATH` | `data/cinebook.sqlite` | Persistent SQLite database, relative to the project root. |

The proxy automatically follows `PORT`; no source edit is needed when changing it. Use a free API port and keep Grafana on its existing port 3000. If an older `.env` specifies `PORT=3000`, change it to `PORT=3001` before restarting. Movies and the next seven days of showtimes are seeded automatically. SQLite stores bookings and enforces unique reservations per seat and showtime. Keep the `data` directory between restarts to retain reservations. Existing six-film databases gain the four new films without deleting prior bookings or duplicating seeds.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

The backend tests cover validation, pricing, competing reservations, transaction rollback, persistence, seed upgrades, metrics, and production asset serving. Startup regression tests reject the Grafana health response and cover concurrent service readiness. The browser tests cover the full multi-seat booking flow, ticket lookup, navigation, all ten posters, filtering/sorting, skeletons, artwork fallback, API recovery, and layouts from 320px to 1440px.

Verified in this workspace: `npm test` passed 58 tests (54 API + 4 startup), `npm run build` succeeded, and the full `npm run test:e2e` suite passed all 12 browser tests. A real `npm run dev` launch on temporary ports also verified the configurable proxy and rendered all ten films. The Docker build, production smoke checks, metrics, non-root runtime, duplicate-seat rejection, and booking retrieval after container replacement passed. Temporary verification processes and volumes were removed; existing local application data was retained. GitHub Actions has not been run remotely.

Browser tests use installed Microsoft Edge on Windows and Playwright Chromium on Linux/macOS. On Linux/macOS, install the browser first with `npx playwright install --with-deps chromium`. Build first; Playwright launches and stops its own production server on port 3100 with a separate `data/browser-test.sqlite` database. Test reports and screenshots are written to `.artifacts`; failure traces are written to `test-results`.

With a production server running, `npm run test:smoke` checks database connectivity, built JS/CSS, all ten posters, showtimes, seats, and metrics without creating bookings. Set `SMOKE_BASE_URL` to check a specific URL, or use `APP_PORT` for Docker and `PORT` for the local Node server (fallback 3001).

## Run with Docker

Start Docker Desktop in Linux container mode. The production Compose service is named **app**. From Windows PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
$env:APP_PORT = '3080'
docker compose config --quiet
docker compose build app
docker compose up --detach --wait --wait-timeout 90 app
docker compose ps app
Invoke-RestMethod 'http://localhost:3080/api/health'
docker compose logs --tail 100 app
```

Open <http://localhost:3080>. Express serves the built React app and API from **port 3000 inside the container**; Vite is absent from the runtime image. Host port 3080 avoids the existing Grafana port 3000 and development API port 3001. A healthy startup shows `Up ... (healthy)` and `127.0.0.1:3080->3000/tcp`; the health response contains `status: ok` and `database: connected`. No host Node installation is needed to build or run the Docker app.

Compose publishes only on localhost and stores SQLite in the **cinebook-data** named volume at `/app/data`. It keeps that existing volume key so previous Compose bookings remain available. `APP_PORT` selects the host port, independently of the development `PORT` setting. The container gets explicit production values for `NODE_ENV`, `PORT`, `DB_PATH`, and `TZ`; the host `.env` and `data/` are excluded from the image. The runtime uses the non-root `node` user, a read-only root filesystem, a temporary `/tmp`, and a writable database volume.

```powershell
docker compose exec -T app node server/healthcheck.js
docker compose restart app
docker compose up --detach --wait --wait-timeout 90 app
docker compose down
```

Normal `docker compose down` preserves the named volume and reservations. Do not add `--volumes` when keeping bookings. If upgrading from the earlier service named `cinebook`, use `docker compose up --detach --wait --wait-timeout 90 --remove-orphans app` once to remove its old container while retaining the same named database volume.

After building the image, `npm run test:docker` (Node.js 24) automatically checks the production image, native Linux SQLite, real booking/duplicate-seat behavior, and persistence across restart, replacement, and Compose down/up. It uses a separate random project/port and deletes only its generated test data. See [the Docker deployment guide](docs/DOCKER.md) for exact build, startup, testing, log, shutdown, persistence, and college-report screenshot instructions. This phase adds no monitoring services.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`, `feature/**`, `feat/**`, `fix/**`, and `ci/**`; on pull requests to any branch; and on manual dispatch. For example, pushing `feature/seat-validation` runs CI. Other branch names still receive CI when opened as a pull request. GitHub's [workflow trigger documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore) explains these filters.

One Ubuntu job, **Tests, application build and Docker build**, performs these steps in order:

1. Check out the repository and install Node.js 24 using `.nvmrc`.
2. Run `npm ci` against the committed `package-lock.json`.
3. Run `npm test` for API and startup checks, including duplicate-seat rejection, concurrent reservations, and transaction rollback.
4. Run `npm run build` to produce the application assets.
5. Install the Chromium browser/system dependencies with `npx playwright install --with-deps chromium`.
6. Run `npm run test:e2e`. Focused `.only` tests fail in CI instead of silently skipping other checks.
7. Run `docker build --tag cinebook:ci .` to verify the image builds. This phase does not start a container, push an image, deploy the app, or configure monitoring.
8. Save available reports and screenshots as the **ci-test-results** artifact for seven days, including when an earlier step fails. Cancelled runs skip this upload.

The existing root `test`, `build`, and `test:e2e` scripts run without user input. The `dev`, `dev:server`, `dev:client`, `test:watch`, and `start` scripts intentionally keep running and are not CI checks. `test:smoke` needs a running production server and is not part of this build-only phase. Both `package.json` and `.nvmrc` select Node 24; the lockfile contains the native packages needed on Linux and Windows.

### Verify a green run in GitHub

Keep this project at the repository root, with `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `.nvmrc`, and `Dockerfile` committed. From the project root, the following commands prepare a feature branch and push only the CI changes made in this phase. An `origin` remote must already point to your GitHub repository:

```powershell
git switch -c ci/github-actions
git add .github/workflows/ci.yml playwright.config.js README.md
git commit -m "ci: verify tests, application build and Docker image"
git push -u origin ci/github-actions
```

Open the repository on GitHub, select **Actions → CI**, and open the run matching that commit. A green run must show **Success** for **Tests, application build and Docker build**. Expand the install, API tests, app build, browser tests, and Docker build steps to see their actual logs. A PR from this branch should also show the CI check under its **Checks** tab. These views are described in [GitHub's workflow-run guide](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-workflow-run-history).

On the run summary, download **ci-test-results** to inspect `.artifacts/vitest-results.json`, `.artifacts/browser-results.json`, screenshots, and any failure traces. If a run is red, open the first failed step, fix that failure locally, commit, and push again. A skipped Docker step is not proof of a successful image build. After the workflow reaches `main`, **Actions → CI → Run workflow** can start a manual run.

For the college report, capture the workflow YAML, the green run summary showing the commit/branch, the passing API and browser-test logs, the completed Docker-build step, and the artifact download area. Until a GitHub run actually completes, local passing commands are local evidence only.

### Run the CI checks locally on Windows

Stop a previous development server before reinstalling dependencies in its checkout, then use:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
$runtimeDir = (Resolve-Path '.tools\node-v24.22.0-win-x64').Path
$env:Path = $runtimeDir + ';' + $env:Path
$env:CI = 'true'
$env:TZ = 'Asia/Kolkata'
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
docker build --tag cinebook:ci .
```

Use an installed Node.js 24 if this checkout has no `.tools` runtime. Windows browser checks use installed Microsoft Edge; GitHub's Ubuntu runner installs Chromium. Docker Desktop must be running in Linux container mode for the image-build check. No deployment credentials or application API keys are needed by the workflow.

CI-phase local verification passed on Node.js 24.22.0 with `CI=true`: clean `npm ci`, 58 API/startup tests, the production build, 12 Edge browser tests, and `docker build --tag cinebook:ci .`. Workflow YAML parsing, branch-pattern checks, and `git diff --check` also passed. Dependency installation and npm checks used an isolated fresh source checkout under `.artifacts/ci-verification` so the running application's dependencies were not replaced. Its screenshots/reports are in `.artifacts/ci-verification/.artifacts`; the consolidated result is `.artifacts/ci-verification-results.json`. These ignored local artifacts are not a completed GitHub Actions run.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check database connectivity. |
| GET | `/api/movies` | List films. |
| GET | `/api/movies/:id` | Get film details. |
| GET | `/api/showtimes` | List upcoming sessions; optional `movieId` and `date=YYYY-MM-DD` filters. |
| GET | `/api/movies/:id/showtimes` | List upcoming dates and sessions. |
| GET | `/api/showtimes/:id/seats` | Get seat availability and pricing. |
| POST | `/api/bookings` | Reserve seats and return a ticket. |
| GET | `/api/bookings/:reference` | Retrieve a ticket. |
| GET | `/metrics` | Prometheus text exposition for request counts/duration, uptime, movies, and bookings. |

Booking requests contain `showtimeId`, `seats` (for example `["C4", "C5"]`), `customerName`, and `customerEmail`. The server calculates totals and returns HTTP 409 if a selected seat has already been reserved. A booking reference grants access to that demo ticket, so treat it as private.

The database has `movies`, `showtimes`, `bookings`, and `booked_seats` tables. Foreign keys, WAL mode, an immediate booking transaction, and `UNIQUE(showtime_id, seat)` protect reservations. Movie prices and upcoming sessions are derived from stored showtimes; no destructive schema migration is needed. Metrics use route templates rather than customer data or booking references. Existing Docker and GitHub Actions support is preserved; no monitoring deployment is required for this repair.

## Manual booking check and report screenshots

1. Open <http://localhost:5173> and confirm the Now Showing count is 10 with ten distinct posters.
2. Search for a title; combine genre/language filters and try title/rating sorting. Clear filters afterward.
3. Select **Book Tickets**, choose a date/showtime, and continue to the seat map.
4. Select two available seats, enter a name/email, check the total, and confirm.
5. Save the reference on the **Booking Successful** digital ticket. Use **Print ticket** to open the browser print dialog.
6. Open **My bookings**, enter the reference, and confirm the same ticket returns after reloading.
7. Return to the same showtime and confirm those seats are disabled. Restart the API and look up the reference again to verify persistence.

Capture these for the college report: desktop homepage with ten movies/count, mobile homepage, search/filter/sort results, movie details with dates/showtimes, selected seats with customer details/total, successful digital ticket/reference, My Bookings retrieval, `/api/health` and `/api/movies` responses, `/metrics`, and successful build/test terminal output. Browser screenshots are saved in `.artifacts/home-desktop.png`, `home-mobile.png`, `movie-details.png`, `seat-selection.png`, and `booking-confirmation.png` by the automated checks.

## Project layout

- `client/src`: React UI and responsive styles.
- `client/public`: Local artwork and favicon.
- `server`: Express routes, SQLite schema, and seed data.
- `tests`: API and browser tests.
- `scripts`: Production smoke checks.
- `.github/workflows`: CI validation.
- `client/dist`: Generated production assets, ignored by Git.
- `data`: Local databases, ignored by Git.

Run commands from the project root.

Implementation references: [Docker's Node.js guide](https://docs.docker.com/guides/nodejs/), [Playwright CI](https://playwright.dev/docs/ci), and [GitHub Actions for Node.js](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).
