# CineBook monitoring on Windows

**Current CineBook ports on this machine:** app **3080**, Prometheus **9092**, Grafana **3002**, all on localhost. Set the overrides in the final section before using the default-port examples below; unrelated projects occupy 3000/3001/9090.

The local production stack contains three Compose services. Express serves the built React website, Prometheus scrapes real application metrics, and Grafana displays them using a provisioned data source and dashboard. The public Render service is a separate deployment; see the production monitoring section below.

| Service | Browser address | Internal address used by services |
| --- | --- | --- |
| `app` | <http://localhost:3000> | `app:3000` |
| `prometheus` | <http://localhost:9090> | `prometheus:9090` |
| `grafana` | <http://localhost:3001> | `grafana:3000` |

All published ports bind to `127.0.0.1`. Prometheus uses job **`cinebook`** and target **`app:3000/metrics`**. Grafana's provisioned Prometheus data source has UID **`cinebook-prometheus`**, and its **CineBook Overview** dashboard has UID **`cinebook-overview`**. No manual dashboard import is required.

## Start the stack

Start Docker Desktop in **Linux containers** mode. Open Windows PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
docker version
docker compose version
docker info --format '{{.OSType}}'
```

Expect Docker Client and Server information and `linux` from the last command. Docker builds the application with Node.js 24; a host Node installation is only needed for the optional npm verification commands.

Set the requested ports explicitly so an older `.env` with `APP_PORT=3080` cannot change them. Prompt for your private Grafana credentials rather than putting a password in shell history:

```powershell
$env:APP_PORT = '3000'
$env:PROMETHEUS_PORT = '9090'
$env:GRAFANA_PORT = '3001'
$credential = Get-Credential -UserName 'cinebook-admin' -Message 'Choose private Grafana administrator credentials'
$env:GF_SECURITY_ADMIN_USER = $credential.UserName
$env:GF_SECURITY_ADMIN_PASSWORD = $credential.GetNetworkCredential().Password

docker compose config --quiet
docker compose build app
docker compose up --detach --wait --wait-timeout 180
docker compose ps
```

Enter your own password in the credential dialog. Nothing in this repository supplies a default password. Alternatively, copy `.env.example` to the Git-ignored `.env` and fill in its two `GF_SECURITY_ADMIN_*` entries privately. Do not commit `.env` or share unredacted container inspection output. `docker compose config --quiet` validates configuration without printing resolved credentials.

Expect `app`, `prometheus`, and `grafana` to become **healthy**, with host ports **3000**, **9090**, and **3001** respectively. The first run downloads Prometheus and Grafana images and can take several minutes. Keep the same PowerShell window for later Compose and npm commands so the environment variables remain available. A new window needs the credentials set again, or a private `.env`.

Before using these ports, stop a development CineBook server on port 3001 with Ctrl+C in the terminal that started it. If another project owns 3000 or 9090, identify that service before stopping it; see troubleshooting below.

## Verify HTTP and metrics

```powershell
Invoke-RestMethod 'http://localhost:3000/api/health'
docker compose exec -T app node server/healthcheck.js
$metrics = (Invoke-WebRequest 'http://localhost:3000/metrics' -UseBasicParsing).Content
$metrics -split "`n" | Select-String '^cinebook_|^process_|^nodejs_'
```

The health response must contain `status: ok` and `database: connected`. The in-container command should print `CineBook HTTP and SQLite are healthy` and exit successfully. `/metrics` returns Prometheus text from `prom-client`, including real request counts, latency histogram buckets, confirmed bookings, and process/Node.js statistics.

| Metric | Meaning |
| --- | --- |
| `cinebook_http_requests_total` | Completed application HTTP requests, labeled by method, safe route template, and status. |
| `cinebook_http_request_duration_seconds` | Request-duration histogram; its `_bucket`, `_sum`, and `_count` series support latency and throughput queries. |
| `cinebook_bookings` | Confirmed reservations stored in SQLite, collected from the database; survives application restarts. Counts reservations, not individual seats. |
| `cinebook_bookings_confirmed_total` | Successful booking confirmations since the current app process started. A rejected duplicate does not increment it. |
| `process_*` and `nodejs_*` | Real process CPU, resident memory, uptime, heap, event loop, and other supported runtime measurements. |

Prometheus scrapes and Docker health probes are included in HTTP request/latency metrics. Filter route labels `/metrics` and `/api/health` when measuring customer traffic; the total request count also includes operational probes. Route labels use templates rather than customer details or booking references. Process counters reset when the app restarts; use Prometheus `rate`/`increase` for trends. The SQLite booking gauge retains the total across restarts.

## Verify the Prometheus target

Open **http://localhost:9090/targets**. Under job **cinebook**, expect endpoint **http://app:3000/metrics**, state **UP**, and a recent successful scrape with no error. `app` is a Docker network name; it is not a Windows browser hostname. This target configuration follows [Prometheus's scrape and target-health model](https://prometheus.io/docs/prometheus/latest/getting_started/).

PowerShell can check the same live target:

```powershell
$targets = Invoke-RestMethod 'http://localhost:9090/api/v1/targets'
$targets.data.activeTargets |
    Where-Object { $_.labels.job -eq 'cinebook' } |
    Select-Object health, scrapeUrl, lastScrape, lastError
```

Expect `health` to be `up`, `scrapeUrl` to be `http://app:3000/metrics`, and `lastError` to be empty. Target **UP** confirms a successful metrics scrape. Check `/api/health` separately for application/database health.

In Prometheus's query page, enter these queries one at a time:

```promql
up{job="cinebook"}
sum(cinebook_http_requests_total{job="cinebook"})
cinebook_bookings{job="cinebook"}
sum(rate(cinebook_http_requests_total{job="cinebook"}[5m]))
histogram_quantile(0.95, sum by (le) (rate(cinebook_http_request_duration_seconds_bucket{job="cinebook"}[5m])))
process_resident_memory_bytes{job="cinebook"}
```

`up` should be **1**. A rate or latency query needs at least two scrapes of the same series. Allow a few scrape intervals after startup and produce traffic before expecting a line; an idle request rate of zero is valid.

## Verify Grafana and changes from website use

1. Open **http://localhost:3001** and sign in with the credentials you supplied. Grafana stores its login state in its persistent volume; the initialization environment applies when its database is first created.
2. Open **Dashboards**, then **CineBook Overview**, or go directly to **http://localhost:3001/d/cinebook-overview**. The supplied dashboard is provisioned automatically. Its panels query the provisioned Prometheus data source at `http://prometheus:9090` inside Docker.
3. Select a recent time range such as **Last 15 minutes** and enable the dashboard refresh interval. Wait for several scrapes. Availability should show the target as up; memory/process panels should have real values. The dashboard also shows request totals/rates, booking totals/confirmations, latency, and HTTP failures.
4. In another tab, open **http://localhost:3000**. Browse films, open a future showtime, and load its seat map. Refresh Grafana after the next scrapes. Request totals must rise. You can also create explicit API traffic with the command below.
5. Record the dashboard's confirmed booking total. Book available seats in the website using demo details. Save the reference, then wait for the next scrapes and refresh Grafana. `cinebook_bookings` must increase by **one reservation**, even for a two-seat booking. The current-process confirmation counter must also rise by one.
6. Revisit the showtime: the seats must remain unavailable. A duplicate-seat POST must return **409** and leave booking counts unchanged; the automated check below covers this without requiring a hand-written request.

```powershell
1..12 | ForEach-Object {
    Invoke-RestMethod 'http://localhost:3000/api/movies' | Out-Null
}
```

These requests use the real API and appear in metrics. Do not claim that static dashboard panels or a successful login alone prove monitoring data is working. Confirm changing query values and a target marked **UP**. Provisioned files, rather than manual import steps, make the dashboard reproducible; see [Grafana provisioning documentation](https://grafana.com/docs/grafana/latest/administration/provisioning/).

## Automated verification

With the stack running and Grafana credentials set in this PowerShell session, use local **Node.js 24**:

```powershell
node --version
npm.cmd run test:monitoring
```

If this workspace's bundled Node runtime is needed, first run:

```powershell
$runtimeDir = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path
$env:Path = $runtimeDir + ';' + $env:Path
npm.cmd run test:monitoring
```

This checks the running application, Prometheus target/scraped samples, Grafana data source/dashboard, and real Grafana queries. It generates application traffic and creates **one demo confirmed booking**, then verifies a duplicate is rejected without another booking count. It retains that valid demo booking in the running application's database. The report is written to **`.artifacts/monitoring-test-results.json`**. A successful check exits with code `0`; a failed run is not successful monitoring evidence. Use `MONITORING_APP_URL`, `PROMETHEUS_URL`, and `GRAFANA_URL` only when deliberately checking a different stack or temporary test ports.

Run application regression checks separately if dependencies are installed:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:smoke
```

For `test:smoke`, set `$env:SMOKE_BASE_URL = 'http://localhost:3000'` first. It checks the running production website without creating bookings. `npm.cmd run test:docker` remains an isolated application-container test; it does not by itself verify Prometheus or Grafana.

## Logs, persistence, and shutdown

```powershell
docker compose logs --tail 100 app prometheus grafana
docker compose logs --follow prometheus grafana
```

Ctrl+C stops following logs; detached services keep running. SQLite bookings persist in **`cinebook-data`**, Prometheus samples in **`prometheus-data`**, and Grafana's database/login state in **`grafana-data`**. Docker prefixes these names with the Compose project name. Configuration and dashboard files are read-only mounts from `monitoring/`.

```powershell
docker compose down
docker compose up --detach --wait --wait-timeout 180
```

Normal `down` retains all named volumes. Do not add `--volumes` or `-v` when retaining bookings and monitoring history. Prometheus retains the configured recent history rather than keeping samples forever. Keep the same project folder/name to reuse the same volumes. Restart Prometheus after editing its scrape configuration and restart Grafana after changing provisioning files:

```powershell
docker compose restart prometheus grafana
docker compose ps
```

## Troubleshooting

| Symptom | Checks and correction |
| --- | --- |
| `GF_SECURITY_ADMIN_*` is missing | Set both variables with the credential prompt above in the same PowerShell window, or privately fill `.env`. An empty committed example is intentional. |
| A port is already allocated | Identify the owning process/container before stopping anything. Use the commands below. Stop an owned CineBook dev server with Ctrl+C; do not blindly stop or delete another project's containers. |
| CineBook shows a Grafana page or Grafana login fails at 3000 | The stack's CineBook URL is port **3000** and its Grafana URL is **3001**. Check the address bar, `docker compose ps`, and existing listeners. An older Grafana on port 3000 must be dealt with before this mapping can start. |
| Prometheus target is DOWN | Check `docker compose ps`, `docker compose logs --tail 100 app prometheus`, `/api/health`, and target `lastError`. The target must be `app:3000`, not `localhost:3000` from inside Prometheus. |
| Grafana panels show No data | Check target UP, the `cinebook` job label, current time range, and data source UID `cinebook-prometheus`. Generate traffic and allow several scrapes; rates require at least two samples. Look at the direct `cinebook_bookings` and memory queries first. |
| Grafana credentials changed but login still fails | Initial admin environment values do not overwrite an existing Grafana database. Use the existing credentials or Grafana's documented admin password reset flow. Do not delete the volume to fix login if its data must be kept. |
| Dashboard edits disappear | The dashboard is provisioned from JSON. Edit the tracked dashboard file and restart Grafana, rather than relying on browser-only changes. |
| Booking counter fell after restart | The `_total` confirmation counter is per process. The SQLite-backed `cinebook_bookings` gauge is the durable reservation total; use that for persistence checks. |
| Docker commands cannot reach the engine | Start Docker Desktop, wait for Linux engine readiness, and rerun `docker version`. |

Inspect only the requested port owners:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(3000, 3001, 9090) } |
    Select-Object LocalAddress, LocalPort, OwningProcess
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

On this workspace, an earlier check found unrelated `agile-assignment-2-starter` Grafana/Prometheus containers occupying **3000/9090**, plus a CineBook development process on **3001**. Those findings describe the existing machine, not a successful launch of this stack on the requested ports. Identify current ownership again because local state can change. If a service belongs to another project, obtain its owner's agreement before stopping it; keep its volumes intact.

## Screenshot checklist

Capture real output, with passwords/customer details hidden:

1. `docker compose ps` showing all three healthy services and the requested port mappings.
2. CineBook's homepage at **localhost:3000**, then a demo booking confirmation/reference.
3. **localhost:3000/metrics** showing request histogram/counter, booking, and process series.
4. Prometheus **Targets** with job **cinebook**, endpoint **app:3000/metrics**, and **UP**.
5. A Prometheus query returning `up{job="cinebook"} = 1`, plus request and booking values before and after website use.
6. Grafana **CineBook Overview** at **localhost:3001**, with availability, traffic, booking, latency, and process panels populated.
7. The successful `test:monitoring` output and report. Include any failed or untested checks as limitations rather than claiming success.

Screenshots taken on temporary ports prove that particular test stack. They do not prove that the requested **3000/9090/3001** mappings were available; retain the actual address bars and describe the ports accurately.


## Production monitoring and occupied local ports

The production budget is **US$0**: Render Free plus Turso Free. It does **not** include public Prometheus or Grafana servers. Both college-required tools remain operational locally, with actual application/process metrics. A local dashboard is not evidence of production scraping unless the production target is explicitly added.

On this machine unrelated projects occupy 3000, 3001, and 9090. Keep them running. Use `APP_PORT=3080`, `PROMETHEUS_PORT=9092`, and `GRAFANA_PORT=3002` in the same PowerShell session for this CineBook stack. All internal addresses above stay the same. Override the verifier addresses:

```powershell
$env:MONITORING_APP_URL = 'http://localhost:3080'
$env:PROMETHEUS_URL = 'http://localhost:9092'
$env:GRAFANA_URL = 'http://localhost:3002'
```

Load the existing private Grafana credentials into that terminal (or use the credential prompt above), then run `npm.cmd run test:monitoring`. The verifier intentionally creates one demo booking and retains it. Capture actual addresses in screenshots.

Render's `/api/health` is public for health probes. Render's `/metrics` requires `Authorization: Bearer <METRICS_TOKEN>`. Never put the token in a URL, browser code, or a committed Prometheus file. The token must remain server-side; Grafana's administrator interface is never published by the Render app.

For optional production scraping from local Prometheus, add an additional job using `monitoring/prometheus/render.example.yml` as a template. Use your actual Render hostname and put the token alone in a private file under ignored `monitoring/secrets/`. Mount that directory read-only into Prometheus at `/etc/prometheus/secrets` using an ignored local Compose override. Preserve the existing `cinebook` job. Restart Prometheus and verify the new **cinebook-production** target is UP over HTTPS. It collects only while this computer and local Prometheus are running. Query `up{job="cinebook-production"}` and production-tagged request/booking metrics; the supplied dashboard's default `cinebook` job shows local data.

For continuous production monitoring later, use an authenticated private monitoring service or a separately budgeted server. Do not expose local Prometheus, Grafana, or Docker ports to the public internet. Secret bearer metrics are encrypted in transit by Render HTTPS, but access remains sensitive. An unavailable target must show DOWN; do not fill missing monitoring results with fabricated data.
