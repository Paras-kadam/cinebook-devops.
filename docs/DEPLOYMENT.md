# Deploy the existing CineBook application

## Hosting decision and budget

The recommended setup is **Render: Docker web service, Starter compute, one 1 GB persistent disk, one instance**. Current advertised base cost is $7 compute + $0.25 disk = **US$7.25/month**, excluding taxes, bandwidth/build extras, and currency conversion. Confirm the actual amount on Render's checkout screen before approving. Use the no-cost individual workspace tier if appropriate; paid compute is billed separately from workspace membership.

Render manages HTTPS and gives the service an `onrender.com` URL. No purchased domain is required. Paid compute avoids the Free service's idle spin-down; Starter has 512 MB RAM and limited CPU, appropriate for a small college demo but not a guarantee under heavy load. The disk is attached at runtime, so database initialization happens on server startup. It is unavailable during Docker build and pre-deploy commands. A disk permits only one instance and causes a brief interruption during deployments. Keep backups and avoid scheduling deploys during the demonstration.

Free Render web services sleep after 15 idle minutes, may take about a minute to wake, cannot attach a disk, and lose local SQLite changes on restart/redeploy/sleep. Free Render Postgres expires after 30 days and requires application changes, so it does not solve durable hosting with minimum complexity. A zero-budget plan would require selecting a durable external database and migrating SQLite code; do not substitute temporary storage.

A Docker-compatible VPS, such as a DigitalOcean Droplet, can keep SQLite in a persistent host volume. It also needs Linux updates, SSH/firewall configuration, backups, and a reverse proxy such as Caddy for HTTPS/domain setup. It is a reasonable alternative for someone managing servers, but Render is simpler for this project. Do not purchase either option without owner approval.

Official references checked 28 October 2026: [pricing](https://render.com/pricing), [disk behavior](https://render.com/docs/disks), [Free limitations](https://render.com/docs/free), [Docker services](https://render.com/docs/docker), [CI-gated deployment](https://render.com/docs/deploys), [VPS pricing](https://www.digitalocean.com/pricing/droplets).

## Before clicking a paid deployment button

1. The source repository is **[Paras-kadam/cinebook-devops.](https://github.com/Paras-kadam/cinebook-devops.)**. The repository name really ends with a period; do not choose another similarly named project.
2. Ensure the prepared changes, including monitoring files and `render.yaml`, are in GitHub. Merge the verified deployment pull request to main, then open **Actions → CI** and confirm the exact main commit is green.
3. Keep existing local databases/volumes. A new Render disk starts with seeded movies and no local bookings. Existing local bookings remain local; they are not silently uploaded or deleted. If you need them on the public site, arrange a consistent backup/import before taking new cloud bookings. Do not overwrite a running SQLite database with a raw file copy.
4. Confirm approval for the displayed recurring cost. Account sign-in and any payment details must be entered by the owner privately, never pasted into chat.

## Easiest method: use the prepared Blueprint

1. Open **https://dashboard.render.com**. Click **Get Started/Sign Up** if needed and sign in with GitHub.
2. Authorize Render to access the existing **cinebook-devops.** repository. Grant access only to the needed repository when GitHub offers that choice.
3. Click **New + → Blueprint**. Select **Paras-kadam/cinebook-devops.**, branch **main**, and the root `render.yaml`. Give the Blueprint a name such as CineBook.
4. Review the proposed **Docker web service**, **Starter** plan, **Singapore** region, and **1 GB disk** at **`/app/data`**. There should be one web service; local Prometheus/Grafana do not become public services.
5. Review the environment table below. The Blueprint generates `METRICS_TOKEN` securely. Do not copy it into source, screenshots, or messages.
6. Review the recurring charges. **Apply Blueprint/Create Resources** starts a paid service. Stop here until the owner approves that charge.
7. After approval, apply the Blueprint. Open the new service and watch **Events/Deploys** and **Logs**. Wait for the deployment to say **Live** and the `/api/health` check to pass.
8. At the top of the service page, copy the actual **https://…onrender.com** address assigned by Render. Open it in a normal browser and a private/incognito window. This is the public website address; `localhost:3080` is not public.
9. Under **Settings → Auto-Deploy**, verify **After CI Checks Pass**, branch **main**, and healthcheck **`/api/health`**. First service creation can deploy immediately, which is why main must already be verified.

## Manual alternative: New → Web Service

Use this only instead of the Blueprint, not in addition to it.

1. Click **New + → Web Service → Git Provider**. Connect GitHub and select **Paras-kadam/cinebook-devops.**. Avoid **Public Git Repository URL** mode: it does not connect repository CI/CD.
2. Name: choose an available CineBook name. Branch: **main**. Region: **Singapore**. Language/Runtime: **Docker**. Root directory: leave blank. Dockerfile: **`./Dockerfile`**. Docker context: **`.`**. Docker command: leave blank so Docker's existing command runs. Do not enter npm build/start commands for the Docker service.
3. Instance type: **Starter**. Instances: **1**.
4. Under **Advanced**, set the environment values below, healthcheck path **`/api/health`**, and auto-deploy **After CI Checks Pass**.
5. Add a **1 GB persistent disk**, mount path **`/app/data`**. Do this before the first app startup. The app refuses to run without the mounted disk.
6. Review the charge and obtain approval. Then click **Create Web Service/Deploy Web Service**. Follow steps 7–9 above to find and verify the assigned URL.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `TZ` | `Asia/Kolkata` |
| `DB_PATH` | `/app/data/cinebook.sqlite` |
| `PERSISTENT_DATA_DIR` | `/app/data` |
| `REQUIRE_PERSISTENT_DISK` | `true` |
| `METRICS_REQUIRE_AUTH` | `true` |
| `METRICS_TOKEN` | Render-generated secret, at least 32 characters |
| `TRUST_PROXY` | `1` for the Render edge proxy; re-evaluate if another proxy is added |
| `REQUEST_LOGGING` | `true` |

For manual creation, generate a token privately in PowerShell and paste its value only into Render's secret environment field:

```powershell
$metricsSecret = -join (1..2 | ForEach-Object { [guid]::NewGuid().ToString('N') })
Set-Clipboard -Value $metricsSecret
```

Clear the clipboard after pasting. Do not configure Grafana admin variables on the public app. Grafana remains local.

## Verify the real service

Replace the placeholder below with the actual URL from Render. Use Node 24.

```powershell
$env:LIVE_BASE_URL = 'PASTE_THE_ACTUAL_HTTPS_ORIGIN_FROM_RENDER'
# Read the private metrics token without placing it in shell history.
$credential = Get-Credential -UserName 'metrics' -Message 'Enter the Render METRICS_TOKEN as the password'
$env:METRICS_TOKEN = $credential.GetNetworkCredential().Password
node scripts/verify-live.mjs
$env:LIVE_BOOKING_TEST = 'true'
node scripts/verify-live.mjs
Remove-Item Env:LIVE_BOOKING_TEST
```

The booking test creates one clearly named demo reservation and checks duplicate-seat rejection. Its private booking evidence stays in ignored `.artifacts/live-booking-private.json`. Do not publish that file. After it passes, in Render use **Manual Deploy → Deploy latest commit** for the verified main commit (or the service restart action). Wait until Live again, then:

```powershell
$env:LIVE_PERSISTENCE_TEST = 'true'
node scripts/verify-live.mjs
Remove-Item Env:LIVE_PERSISTENCE_TEST
Remove-Item Env:METRICS_TOKEN
```

Save the Render event/commit that proves a restart or redeploy occurred between the two tests. The verifier checks that the same ticket survives and its seat still rejects another reservation; it cannot infer from HTTP alone that a service restarted. Results go to `.artifacts/live-verification.json`.

In the browser, verify ten posters, title search and filters, movie details, seven show dates, seat selection, confirmation, My bookings, and a page refresh. Repeat on a phone or 390px device viewport. Confirm the address begins with HTTPS. Anonymous `/metrics` must return 401; `/api/health` must return `{"status":"ok","database":"connected"}`. Run the existing Playwright suite against local production first; live browser verification must still be recorded separately.

## Backups, troubleshooting, and credentials

In the paid service's **Shell**, run `node server/backup.js`. It uses SQLite's online backup API and verifies integrity, including committed WAL data. Download the named private backup using Render's SSH/SCP instructions and store it off the service. Limit retained on-disk backups so the 1 GB disk does not fill. Do not use filesystem snapshots as a substitute for a consistent database backup, or copy only a live database's main file while ignoring its WAL.

If startup reports **disk not mounted**, check the disk mount and `DB_PATH`; do not disable the guard. If it reports **SQLITE_CANTOPEN/permission denied**, inspect disk ownership from Render Shell and arrange writable access for Docker's non-root `node` user. Do not run the public application as root to mask the problem. A failed `/api/health` means the deployment is not ready. Brief redeploy downtime is expected with this disk architecture.

The local `.env` and local monitoring credential files are ignored and excluded from Docker. Current tracked files do not contain the actual Grafana credentials. If a password/token was ever shared in screenshots, logs, Git history, or chat, rotate it at the provider first; deleting a file alone does not revoke it. Change an existing Grafana password in its authenticated profile/admin flow; initialization environment values do not reset an existing Grafana volume. Rotate `METRICS_TOKEN` in Render and update private Prometheus credentials. Revoke exposed GitHub tokens in GitHub settings. Keep booking references out of public logs and screenshots.
