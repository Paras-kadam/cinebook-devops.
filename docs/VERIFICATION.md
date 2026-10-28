# Current verification — 28 October 2026

Public deployment has not occurred. No public URL, Render storage durability, or live HTTPS browser result has been verified. Render-style local tests validate configuration but are not a live Render deployment.

| Verification | Result and evidence |
| --- | --- |
| Baseline API/startup/metrics suite | 63 passed, 1 failed due to a legal blank metrics line |
| Final API/startup/metrics/security suite | **71 passed**, Node 24.22.0, `.artifacts/vitest-results.json` |
| Vite production build | Passed; built JS/CSS and ten posters served by Express |
| Browser suite, booking and mobile layouts | **12 passed** in Edge, `.artifacts/browser-results.json`; viewports 320px through desktop |
| Final multi-stage Docker build | Passed, `.artifacts/deployment-docker-build.log` |
| Isolated Docker booking/durability checks | **11 passed**, `.artifacts/docker-test-results.json`; restart, replacement and down/up retain bookings |
| Isolated Render-style container checks | **7 passed**, `.artifacts/cloud-test-results.json`; port 10000, disk/auth enforcement, non-root server, persistence and consistent backup |
| Prometheus/Grafana real-data checks | **10 passed**, `.artifacts/monitoring-test-results.json`; target UP, twelve provisioned panels, actual traffic and bookings, Grafana queries |
| Render YAML syntax/settings | Parsed; persistent disk, healthcheck and checksPass gate present |
| Secret checks | No common GitHub/AWS token or private-key patterns found in tracked source or three existing commits; `.env` and databases are ignored. This is a scoped pattern scan. |
| Git whitespace | `git diff --check` passed |
| Remote GitHub Actions | See the deployment pull request's Checks tab; remote execution is distinct from all local results above |
| Public HTTPS, live browser and actual Render restart persistence | Pending owner account connection, recurring-cost approval, deployment and live verification |

The original Compose project uses existing `cinebook-devops_cinebook-data`, `prometheus-data`, and `grafana-data` volumes. A consistent pre-startup SQLite backup of the existing database was created at `/app/data/backups/cinebook-1793205736119-a875f5072ccd.sqlite` (one original booking). Monitoring verification deliberately added one demo reservation. No original records or volumes were deleted.

The stack is running only on loopback: CineBook **http://localhost:3080**, Prometheus **http://localhost:9092**, Grafana **http://localhost:3002**. Other projects occupying 3000/3001/9090 remain running. These are local evidence URLs, not publicly shareable URLs.

Keep detailed reports, SQLite backups, traces and private booking evidence under ignored `.artifacts/`. Source backups of edited files are under `.artifacts/deployment-before-*`. Do not publish those private artifacts.
