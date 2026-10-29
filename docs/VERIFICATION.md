# Current verification - 29 October 2026

**Selected hosting: Render Free Docker + Turso Free libSQL, strict US$0. Public deployment has not occurred.** No public URL or real Render restart has been verified. The actual Turso credential check still reports empty URL/token fields in the private file; account connection remains unfinished. Local libSQL network tests are separate from a connection to the user's Turso cloud database.

| Verification | Result and evidence |
| --- | --- |
| API/startup/metrics/security and real libSQL engine suite | **82 passed**, Node 24.22.0; `.artifacts/vitest-results.json` |
| Vite production build | Passed; built JS/CSS and ten original posters |
| Browser suite, booking and mobile layouts | **12 passed** in Edge; `.artifacts/browser-results.json`; viewports 320px through desktop |
| Final multi-stage Docker build | Passed; `.artifacts/free-deployment-docker-build.log` |
| Isolated Docker booking/durability checks | **11 passed**; `.artifacts/docker-test-results.json`; restart, replacement and down/up retain bookings |
| Isolated disk-backed cloud guardrail checks | **7 passed**; `.artifacts/cloud-test-results.json`; port 10000, mounted-disk/auth enforcement, non-root server, persistence and consistent backup. This is a fallback guard test, not the selected free remote database architecture. |
| Actual libSQL HTTP network integration | **6 passed**; `.artifacts/turso-network-results.json`; official server container, production frontend/posters, authenticated metrics, commit/rollback, maximum sixty-seat booking, app recreation and database-container restart |
| Prometheus/Grafana real-data checks | **10 passed** during initial setup; `.artifacts/monitoring-test-results.json`; target UP, twelve provisioned panels, actual traffic/bookings and Grafana queries |
| Updated local stack smoke and read-only monitoring | Passed after app replacement; `.artifacts/free-monitoring-readonly-results.json`; app/database health, ten posters, target UP, real Grafana query and exactly two retained bookings |
| Scoped source secret scan and whitespace | No common GitHub/AWS/private-key/JWT patterns found in staged-source candidates; `git diff --check` passed. This is a scoped pattern scan. |
| Render YAML settings | One Docker web service, `plan: free`, no disk/database resources, `/api/health`, `DATABASE_PROVIDER=turso`, private unsynced credentials and `checksPass` gate |
| Credential handling | `.env.production.local` ignored by Git and excluded from image/CI uploads; masked Windows setup helper saves directly to that existing private file |
| Remote GitHub Actions | Earlier Linux CI passed for `3ded06a`; the latest free architecture requires its own successful Linux run. See [PR #1 Checks](https://github.com/Paras-kadam/cinebook-devops./pull/1/checks) for the exact latest commit. |
| Real Turso cloud connection | Pending private URL/token being saved and a successful `scripts/check-turso.mjs` result |
| Public HTTPS, live browser, and actual Render restart persistence | Pending free service creation, actual assigned URL and two-stage live verification |

The eleven added libSQL tests cover the real client/database engine, server pricing, duplicate seats, rollback, sixty-seat writes, competing requests, reopening, preserved prices/IDs, validation, metrics and encrypted configuration. The network test additionally exercises the actual HTTP protocol; it previously exposed generic constraint codes, now correctly mapped to HTTP 409. Remote seat writes are batched, and the confirmation snapshot is captured before commit so no extra database read can hide the committed reference.

The original Compose project retains `cinebook-devops_cinebook-data`, `cinebook-devops_prometheus-data`, and `cinebook-devops_grafana-data`. A consistent pre-startup backup was created at `/app/data/backups/cinebook-1793205736119-a875f5072ccd.sqlite`, containing one original booking. A comparison found the original booking and seat rows unchanged. Initial monitoring verification intentionally added one demo reservation, bringing the local total to two. No original records or volumes were deleted.

The local stack uses CineBook **http://localhost:3080**, Prometheus **http://localhost:9092**, and Grafana **http://localhost:3002**, all on loopback. Other projects using 3000/3001/9090 remain intact. These are local evidence URLs, not public hosting addresses. Local and Turso databases are separate; existing local tickets are not silently copied or overwritten.

Detailed reports, traces, SQLite backups and private booking evidence remain under ignored `.artifacts/`. Current local screenshots are `.artifacts/current-local-*.png`. CI artifact uploads exclude database/environment files and private booking evidence. No paid cloud resource has been created.

One final local Docker run timed out in the Docker CLI during container replacement. Its failure report is retained privately as `.artifacts/free-docker-timeout-results.json`; a clean subsequent run passed all eleven checks, followed by all seven cloud guardrail checks.
