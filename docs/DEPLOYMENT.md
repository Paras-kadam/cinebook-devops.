# CineBook public hosting — strict US$0 budget

The owner selected **US$0 hosting**. Use **Render Free (Docker web service) + Turso Free (remote managed SQLite/libSQL)**. Do not create a paid Render service or disk, enable overages, upgrade either provider, or add paid monitoring. `render.yaml` now declares `plan: free` and contains no disk or paid database.

The public website is **not deployed or verified yet**. No actual public URL has been issued. Account setup and private Turso credentials must be completed before deployment. Previous paid-disk preparation is not the selected solution.

## What is free and what changes

Render runs the existing Docker image and supplies a public HTTPS `onrender.com` address. Turso stores committed bookings outside Render's temporary filesystem. The backend now supports asynchronous Turso queries/transactions; the existing local SQLite database, Docker volume, UI, posters, and monitoring remain intact. No Postgres migration or website rebuild is involved. Local and cloud databases are separate unless an explicit import is performed.

Current Turso Free allowances are 5 GB storage, 500 million rows read/month, and 10 million rows written/month, with no credit card required. Queries can be blocked at quota limits; monitor usage and stay on Free with overages disabled. This is a small college demonstration, not unlimited or guaranteed always-on hosting. Turso acknowledges commits after durable storage; local Render file loss does not erase those remote commits.

Render Free sleeps after 15 idle minutes and may take about a minute to wake. Open the website before class and wait for health to pass. Its 750 monthly service hours, bandwidth and build quotas also apply; exhausted allowances can suspend service/builds. Without a payment method, Render documents suspension instead of billing for extra use. Keep the service and workspace on free offerings; do not opt into charges. Free Render Postgres expires after 30 days and is not used.

Official references checked 28-29 October 2026: [Render Free](https://render.com/docs/free), [Turso Free pricing](https://turso.tech/pricing?frequency=monthly), [durable commits](https://docs.turso.tech/cloud/durability), [Turso usage limits](https://docs.turso.tech/help/usage-and-billing), [Render HTTPS services](https://render.com/docs/web-services).

## 1. Create the free accounts and database

1. Open **https://turso.tech** and choose **Start for free/Sign up**. Sign in with GitHub and choose **Free**.
2. In the Turso dashboard, choose **Create Database**, name it **cinebook**, select the **libSQL** engine, and choose a nearby region offered on Free. Use Singapore if available, matching the prepared Render region. This app uses `@libsql/client`; Turso's newer engine uses a different SDK. If engine controls differ, stop and describe the available labels without sharing secrets. The official CLI equivalent is `turso db create cinebook` (omit `--tursodb`), as explained in [Turso's quickstart](https://docs.turso.tech/quickstart). Do not delete an existing database to change engines.
3. Open that database's **Connect** controls. Copy its database URL, usually starting with `libsql://`. Generate a **read/write database authentication token** for this database. Keep both in the private configuration file described below; never put the token in chat, GitHub, browser JavaScript, URLs, or screenshots.
4. Open **https://dashboard.render.com**, sign in with GitHub, and authorize access to **Paras-kadam/cinebook-devops.**. The repository name really ends with a period. Select a free workspace offering and do not create a paid disk/service.

Dashboard labels can change. The required values are the database's connection URL and read/write database token; an account API token is a different credential. If the controls differ, describe the button labels without sharing the token.

## 2. Enter credentials privately and test the database

The existing repository contains a Git-ignored **`.env.production.local`** with a generated private metrics token and blank Turso fields. It is excluded from Git, Docker context and CI artifact uploads. Preserve your existing `.env`; it contains local monitoring credentials.

```powershell
Set-Location -LiteralPath 'C:\Users\Paras Kadam\Desktop\cinebook-devops'
notepad .env.production.local
```

Privately paste the database URL after `TURSO_DATABASE_URL=` and the token after `TURSO_AUTH_TOKEN=`. Save and close. On Windows, an easier alternative is the local setup dialog:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\configure-turso.ps1
```

Paste only the URL and full token into the two fields, then click **Save private settings**. The token field is masked, and the helper updates only those two variables in the existing ignored file. Report only its success/error message, never the token. Keep `DATABASE_PROVIDER=turso`. Do not share this file. `docs/production-env.example` is a blank, safe template for other checkouts.

With Node.js 24:

```powershell
$env:Path = (Resolve-Path -LiteralPath '.tools\node-v24.22.0-win-x64').Path + ';' + $env:Path
node --env-file=.env.production.local scripts/check-turso.mjs
```

This creates missing tables/seed rows without deleting existing data, then prints health and aggregate counts only. It never prints credentials. A successful result includes `status: ok`, `provider: turso`, and `movies: 10`. If it fails, check the private fields and token permissions; do not deploy with empty credentials or switch to a local ephemeral database.

## 3. Publish the verified source on main

1. Open **[deployment pull request #1](https://github.com/Paras-kadam/cinebook-devops./pull/1)**. Use its latest commit, which includes free Turso support.
2. Wait for **Checks** to be green. If still a draft, click **Ready for review**. Then choose **Merge pull request → Confirm merge**. Do not bypass failed checks.
3. Open **Actions → CI** and wait for the exact main commit to pass. The first Render deployment should use that verified commit.

## 4. Create the FREE Docker service on Render

Choose one method, not both. The Blueprint is easiest after the free version of `render.yaml` is on main.

**Blueprint:** click **New + → Blueprint**, select **Paras-kadam/cinebook-devops.**, branch **main**, and root **render.yaml**. Review the proposed service: **Docker, Free, Singapore, no disk, no paid database**. Enter the private Turso URL/token when prompted. The Blueprint generates a metrics token; privately copy the actual Render value into local `.env.production.local` before authenticated live verification. Click **Apply Blueprint/Create Resources** only if the summary has no paid resources.

**Manual service:** click **New + → Web Service → Git Provider**, connect GitHub, and select **Paras-kadam/cinebook-devops.**. Set branch **main**, runtime/language **Docker**, region **Singapore**, instance type **Free**, root directory blank, Dockerfile **./Dockerfile**, Docker context **.**, and Docker command blank. Set **Health Check Path** to **/api/health**. Add the variables below. **Do not add a persistent disk**. Click **Create/Deploy Web Service** after confirming Free.

| Render variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `TZ` | `Asia/Kolkata` |
| `DATABASE_PROVIDER` | `turso` |
| `TURSO_DATABASE_URL` | Private database URL from Turso |
| `TURSO_AUTH_TOKEN` | Private read/write database token |
| `METRICS_REQUIRE_AUTH` | `true` |
| `METRICS_TOKEN` | Generated secret; at least 32 characters |
| `TRUST_PROXY` | `1` for Render's edge; local test file uses `0` |
| `REQUEST_LOGGING` | `true` |

For manual service creation, use the metrics token already generated in `.env.production.local`. For Blueprint creation, use the actual generated Render metrics value in your local private file. Never prefix these secrets with `VITE_`; Vite-prefixed values can enter the browser bundle.

Under **Settings → Auto-Deploy**, select **After CI Checks Pass** and branch **main**. Render's GitHub integration is the deployment identity; no deploy-hook token is committed. The first service creation can deploy immediately, which is why main must already be green.

## 5. Find the real HTTPS URL

Open the new service's **Events/Deploys** and **Logs**. Wait for **Live** and a passing `/api/health`. Copy the actual HTTPS address at the top of the service page. Do not invent it from the service name. Open it in an incognito window; wait through a cold start if needed. This is the shareable address; localhost is local only.

Save the actual origin after `LIVE_BASE_URL=` in `.env.production.local`. The public URL is safe to share in chat so it can be tested; the database and metrics tokens remain private.

## 6. Test real bookings and restart persistence

Warm the service in a browser first, then run:

```powershell
node --env-file=.env.production.local scripts/verify-live.mjs
$env:LIVE_BOOKING_TEST = 'true'
node --env-file=.env.production.local scripts/verify-live.mjs
Remove-Item Env:LIVE_BOOKING_TEST
```

The second command creates one demo reservation, verifies duplicate rejection, and saves private evidence to ignored `.artifacts/live-booking-private.json`. In Render, redeploy the same verified commit using **Manual Deploy → Deploy latest commit**, or the service restart action. Wait until Live, then:

```powershell
$env:LIVE_PERSISTENCE_TEST = 'true'
node --env-file=.env.production.local scripts/verify-live.mjs
Remove-Item Env:LIVE_PERSISTENCE_TEST
```

Confirm Render's event log proves a restart/redeploy occurred between checks. The same private ticket and locked seat must remain in Turso. The verifier does not infer a restart from HTTP alone. Test posters, search/filter, details, seat selection, confirmation, reference lookup/refresh and phone layouts in the actual HTTPS browser too. Anonymous `/metrics` must return 401; authenticated metrics and `/api/health` must work. Free cold starts may require warming and retrying a timed-out smoke check; a failed check is not a passed deployment.

## Backups, local data, and monitoring

Existing local bookings remain in the original Docker SQLite volume and its private pre-startup backup. A new Turso database does not automatically contain local tickets. Do not overwrite/import existing records without an explicit backup/import procedure.

Use Turso's supported export/backup tools from your authenticated account and retain private copies outside the service. Free point-in-time recovery has a limited window; do not rely solely on it. The existing `server/backup.js` backs up local SQLite, not the remote Turso database. Credentials can be rotated in Turso's database token controls and Render Environment. Revoke an exposed token before replacing it; deleting a leaked file alone does not revoke it.

Prometheus and Grafana remain on local Docker at the chosen loopback ports. There is no extra hosted monitoring charge. Optional local-to-production scraping uses HTTPS and a bearer token, as described in [MONITORING.md](MONITORING.md). It collects only while this computer runs. Hosted continuous monitoring would need a separately approved budget and is not enabled.
