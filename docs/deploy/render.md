# Deploy Concord on Render with persistent storage

The repository's [`render.yaml`](../../render.yaml) is deliberately a **free preview** blueprint. It deploys the Docker image and checks `GET /api/health`, but has **no disk**. It does not set `CONCORD_EPHEMERAL`, so the dashboard does not warn that data is erased; set `CONCORD_EPHEMERAL=1` if you want that notice. Treat the preview's accounts, uploaded registers, sign-offs and session state as disposable: a restart or redeploy erases its local SQLite data.

Use a **paid instance with a persistent disk** for a long-running deployment.

## Create or upgrade a persistent service

1. In Render, choose a paid web-service instance type that supports persistent disks. The build/runtime remains **Docker**, using this repository's `Dockerfile`.
2. Attach **one persistent disk at `/data`** before entering real data. The Dockerfile uses `CONCORD_DATA_DIR=/data`; the API stores `control.db` and workspace files at `/data/orgs/`. Make sure the runtime can write there.
3. Make sure `CONCORD_EPHEMERAL` is unset (or `0`): if it is set, the UI warns that data is ephemeral despite the persistent disk.
4. Keep `CONCORD_TRUST_PROXY=1` because Render supplies one reverse-proxy hop for rate-limit IP attribution. Set `CONCORD_SIGNUP=code` if you do not want open sign-up. Configure optional OAuth client id/secret only in Render's secret environment settings, not committed YAML.
5. Render supplies `RENDER_EXTERNAL_URL`; `services/api/src/config.ts` uses it when `CONCORD_PUBLIC_URL` is unset. Set `CONCORD_PUBLIC_URL` explicitly if you use a custom HTTPS domain; Google OAuth's authorized redirect URI must be `<public-url>/api/auth/google/callback`.
6. Leave the health check at **`/api/health`**. Verify that it returns `{"ok":true}`, that sign-in survives a service restart, and that a watched asset continues indexing.

If managing the service via a Render blueprint, update **your deployment's copy** of `render.yaml` to a paid `plan` and a persistent disk mounted at `/data`. The repository's shipped free blueprint is for demos: changing only `plan: free` to paid without adding a disk does **not** make databases durable.

## Moving data from the free preview

**Do not restart, deploy, or change instance type expecting Render to migrate the old container filesystem to the new disk.** A free preview may have already lost data on idle spin-down.

- If you can still access the old instance's filesystem, first make a **verified off-host backup** of the complete data directory using Concord's [backup procedure](../upgrading.md). SQLite runs in WAL mode, so prefer the application's `pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord backup` procedure to a live `cp` of database files. Transfer the backup somewhere you control **before** modifying the service.
- If you do **not** have shell access or an off-host backup, you cannot assume the old databases are recoverable. An audit CSV download is not a complete restore of account/session/workspace state. You may need to recreate the workspace and re-import the original source register, journal and instruction CSVs. Historic sign-offs might be unrecoverable.
- Provision the paid service and disk, restore the backup into its new data directory while the app is **stopped**, and start a **single** instance. Validate workspace membership, uploaded files, and sign-off state before decommissioning the old service. See [upgrading and rollback](../upgrading.md) for checks.

## Why only one instance?

Concord runs an in-process Stellar indexer and uses local SQLite files. A Render disk belongs to one running instance; scaling to multiple independent services can split account state and duplicate indexing. Maintain **one always-on worker/web process** with one mounted disk, and take off-host backups before major changes.

## Presenting from the free plan

The project's hosted demo is <https://stellar-co-star-stellar-co-star-stellar-co-star-concord-bobz.onrender.com> (health check:
<https://stellar-co-star-stellar-co-star-stellar-co-star-concord-bobz.onrender.com/api/health>). The steps below use it; replace the address with
your own service if you run another.

The free preview forgets everything whenever it restarts or sleeps, so for a demo, plan on
rebuilding it rather than trusting it. None of this makes data durable; it makes the demo cheap to
bring back.

1. **Keep it awake.** A free service sleeps after about 15 minutes without traffic and takes up to
   a minute to wake. Point a free uptime pinger (cron-job.org, UptimeRobot) at
   `https://stellar-co-star-stellar-co-star-stellar-co-star-concord-bobz.onrender.com/api/health` every 5 to 10 minutes from the day before.
   The pinger only keeps the service awake; it does nothing about a restart.
2. **Rebuild before you present.** From your own machine, after `pnpm demo:testnet` has written
   `data/demo/`, run
   `pnpm demo:load --url https://stellar-co-star-stellar-co-star-stellar-co-star-concord-bobz.onrender.com --password '<choose one>'`
   ([what it does](../demo-testnet.md#rebuild-the-whole-workspace-in-one-step)). It is safe to run
   again. Do it about ten minutes before you start, so a cold start and the first indexing pass
   are behind you.
3. **Check what the audience will see.** Sign in, open the asset, and confirm the Reconciliation
   tab lists the planted breaks, the Controls tab shows the uninstructed clawback and the stale
   freeze, and the dividend and split are on the Actions tab. The dashboard does not warn that data
   is erased on restart (that notice is off), so say it out loud if it matters to the audience.
4. **Have the fallback ready.** If the service restarts mid-demo, run the same `demo:load` line
   again and sign back in. Running Concord on your laptop (`pnpm start`, then `demo:load --url
   http://127.0.0.1:4400`) gives the identical workspace without depending on Render at all.
5. **Afterwards**, a paid instance with a disk (above) is what keeps real data.

## Sources in this repository

- `render.yaml`: free-preview plan, health check and proxy flag (`CONCORD_EPHEMERAL` is left off)
- `Dockerfile`: production image and default `/data` storage
- `services/api/src/config.ts`: `RENDER_EXTERNAL_URL` fallback, public URL, data directory, proxy and ephemeral settings
- `docs/upgrading.md`: consistent backups, restore and rollback
