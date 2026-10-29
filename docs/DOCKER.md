# CineBook with Docker on Windows

Docker builds the React production files and serves them through Express. The application listens on port **3000 inside the container** and is available at **http://localhost:3080** by default. Compose calls the application service **`app`** and tags its image **`cinebook:local`**.

This phase runs CineBook locally. It does not configure cloud hosting or monitoring.

## What the container includes

- A multi-stage Node.js 24 build using Debian images, with a slim production runtime.
- Linux dependencies installed with `npm ci` inside Docker, including the native `better-sqlite3` module. Windows `node_modules` is excluded from the build context.
- Built React assets served by Express alongside the API. The production container does not start Vite.
- A non-root `node` user, read-only application filesystem, writable `/tmp`, dropped Linux capabilities, and `no-new-privileges`.
- A healthcheck that requests CineBook's exact healthy HTTP response and verifies SQLite connectivity. It uses Node, so curl is not required.
- SQLite stored at `/app/data/cinebook.sqlite` in the `cinebook-data` named volume. The volume also holds SQLite's WAL and shared-memory files.
- A 15-second graceful shutdown period and automatic restart unless deliberately stopped.

The final image excludes development dependencies, local databases, `.env` files, and build/test artifacts. The host's `data` folder is separate from the Docker volume.

## Build and start

Start Docker Desktop and select **Linux containers**. Run the following in Windows PowerShell from the project folder:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
docker version
docker compose version
docker info --format '{{.OSType}}'
```

Docker must report both Client and Server information. The last command must print `linux`. A local Node.js installation is not needed to build or start the container.

```powershell
# Optional: select a different free host port. The default is 3080.
$env:APP_PORT = '3080'

docker compose config --quiet
docker compose build app
docker compose up --detach --wait --wait-timeout 90 app
docker compose ps app
```

`config --quiet` succeeds without output. The build installs dependencies, builds React, and exports `cinebook:local`. Startup waits for the healthcheck; `ps` should show `app` as **Up (healthy)** and publish `127.0.0.1:3080->3000/tcp`. The first build downloads base images and may take several minutes.

If upgrading the older Compose service named `cinebook`, use this startup command once to remove its obsolete container:

```powershell
docker compose up --detach --remove-orphans --wait --wait-timeout 90 app
```

Run it from the same project folder with the same Compose project name to keep the existing `cinebook-data` volume. Changing the project name selects a different volume.

Open **http://localhost:3080** in your browser. If you selected another `APP_PORT`, use that port instead. Existing services on ports 3000 and 3001 can remain running.

To build the image directly without Compose, the equivalent image-build command is:

```powershell
docker build --tag cinebook:local .
```

Use Compose for startup so the volume, healthcheck, and runtime settings are applied together.

## Configuration

| Setting | Value | Purpose |
| --- | --- | --- |
| `APP_PORT` | `3080` by default | Host port; Compose binds it to `127.0.0.1` for local access. |
| `PORT` | `3000` inside the container | Express serves both the website and API. |
| `NODE_ENV` | `production` | Enables production behavior and built frontend serving. |
| `DB_PATH` | `/app/data/cinebook.sqlite` | Keeps SQLite in the persistent named volume. |
| `TZ` | `Asia/Kolkata` | Uses the cinema's local time for showtimes. |

Compose fixes the container's environment explicitly; it does not import the host `.env` file with `env_file`. Compose can read `APP_PORT` from your shell or root `.env` for port interpolation. An existing development `PORT=3001` does not change the container or its published port. No API keys or deployment credentials are required.

## Check application access and health

Read the actual published port so these checks also honor a custom `APP_PORT` from `.env`:

```powershell
$publishedAddress = docker compose port app 3000
$appPort = ($publishedAddress -split ':')[-1]
$baseUrl = "http://localhost:$appPort"

Invoke-RestMethod "$baseUrl/api/health"
$catalog = Invoke-RestMethod "$baseUrl/api/movies"
$catalog.movies.Count
docker compose exec -T app node server/healthcheck.js
$LASTEXITCODE
```

The health request should show `status: ok` and `database: connected`. The movie count should be `10`. The in-container healthcheck prints `CineBook HTTP and SQLite are healthy` and completes with exit code `0`. Open `$baseUrl` in the browser and confirm that the films, posters, showtimes, seat selection, and booking confirmation work.

To see the named volume attached to the application:

```powershell
$containerId = docker compose ps --quiet app
docker inspect $containerId --format '{{range .Mounts}}{{println .Type .Name .Destination}}{{end}}'
```

Expect a `volume` entry ending in `cinebook-data` mounted at `/app/data`. Docker normally prefixes its name with the Compose project name.

## Inspect logs

```powershell
docker compose logs --tail 100 app
docker compose logs --follow app
```

The logs should show `CineBook is running at http://localhost:3000`. The volume-inspection command above identifies the persistent `/app/data` mount. **Ctrl+C stops following the logs; the detached application continues running.** If startup fails, run the first command to inspect the error, then check Docker Desktop and whether your chosen host port is available.

## Demonstrate booking persistence

1. In the browser, choose a future showtime, select available seats, enter demo customer details, and confirm a booking.
2. Save the booking reference, showtime, and seat numbers from **Booking Successful**.
3. Restart the application and wait for health:

   ```powershell
   docker compose restart app
   docker compose up --detach --wait --wait-timeout 90 app
   docker compose ps app
   ```

4. Enter the saved reference in **My bookings**. The same ticket must return. Reopen the same showtime; the reserved seats must remain unavailable.
5. For an API check, replace the example reference with your saved value:

   ```powershell
   $bookingReference = 'CB-REPLACE-WITH-YOUR-SAVED-REFERENCE'
   Invoke-RestMethod "$baseUrl/api/bookings/$bookingReference" |
       ConvertTo-Json -Depth 6
   ```

6. Remove and recreate the application containers, retaining the volume, then repeat the lookup:

   ```powershell
   docker compose down
   docker compose up --detach --wait --wait-timeout 90 app
   Invoke-RestMethod "$baseUrl/api/bookings/$bookingReference" |
       ConvertTo-Json -Depth 6
   ```

The reference, customer, seats, and total should match the original ticket after both checks. `docker compose down` removes containers and the project network while preserving the named volume. Use it without `--volumes` or `-v` to retain bookings.

## Run automated Docker verification

Build the image first with `docker compose build app`. The optional test runner needs local **Node.js 24** and Docker Desktop; the application container itself does not need a local Node installation.

```powershell
node --version
npm.cmd run test:docker
```

If Node.js 24 is not on PATH and this workspace includes the bundled runtime, activate it for this PowerShell session first:

```powershell
$runtimeDir = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path
$env:Path = $runtimeDir + ';' + $env:Path
node --version
npm.cmd run test:docker
```

The runner uses Node's built-in modules, a unique temporary Compose project, and an automatically selected free port. It verifies:

- Healthy startup, named-volume storage, Node 24, a non-root runtime, and working Linux-native SQLite.
- A production image without Vite, copied `.env` files, or local databases.
- The built React page, JavaScript, CSS, ten movie posters, and API responses.
- A real two-seat booking with the server-calculated total, plus HTTP `409` rejection when the same seats are booked again.
- The same booking and unavailable seats after restart, container replacement, and `down` followed by `up`.

Successful checks print `PASS`, followed by `Docker verification passed`. The runner saves `.artifacts/docker-test-results.json` and cleans up only its own temporary project and volume. Your regular `app` container and its bookings remain separate. A failed run exits with a nonzero status and records the failing check; inspect that result and the printed logs before treating the phase as verified.

Local verification on **19 October 2026** passed: the production Docker image built, the regular application started at **http://localhost:3080**, all **58** API/startup tests passed, and the production smoke check passed against that URL. All **11** isolated Docker checks passed, including duplicate-seat rejection and persistence after restart, replacement, and Compose down/up. The tested Linux image ran Node.js **24.22.0** as UID **1000** with native SQLite **3.53.4**; Vite, copied environment files, and local databases were absent. The [Docker test results](../.artifacts/docker-test-results.json) record the checks and cleanup of the temporary test volume.

For the current free-cloud architecture and latest test totals, use [the verification record](VERIFICATION.md). The dated results above describe the earlier local run. Local Compose still uses its original SQLite volume; the selected Render Free deployment stores bookings in a separate Turso libSQL database.

## Stop and start later

```powershell
docker compose down
```

This shuts down the local application and retains confirmed bookings in the named volume. To resume:

```powershell
docker compose up --detach --wait --wait-timeout 90 app
```

Rebuild after source or dependency changes using `docker compose build app`, then run the startup command again. Compose replaces the application container while keeping the database volume.

## Screenshots for the college report

Capture evidence from an actual local run:

1. The successful `docker compose build app` output and the `cinebook:local` image in Docker Desktop.
2. `docker compose ps app` showing a healthy service and the localhost port mapping.
3. The homepage at `http://localhost:3080`, with the address bar and movie catalogue visible.
4. PowerShell health output, movie count `10`, and the healthcheck's exit code `0`.
5. A confirmed booking showing its reference and selected seats.
6. The same ticket retrieved after restart and container recreation, plus the unavailable seats for that showtime.
7. The named volume mount and normal application startup logs.
8. The automated Docker test summary and `.artifacts/docker-test-results.json`, if you ran that optional check.

The verified Docker homepage captures are available as [desktop](../.artifacts/docker-home.png) and [mobile](../.artifacts/docker-home-mobile.png) screenshots. Terminal and persistence screenshots can be captured with the commands above. Use demo customer details in screenshots.
