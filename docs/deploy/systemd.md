# Deploying on a VPS with systemd

Concord is a single Node.js process that serves both the HTTP API and the compiled web dashboard while running the background Stellar RPC indexer against local SQLite databases ([`services/api/src/main.ts`](../../services/api/src/main.ts)). On a Linux VPS (Debian, Ubuntu, Rocky, or Fedora), you can run it directly under `systemd` without Docker.

---

## 1. Install Node 24 and Enable `pnpm`

Concord requires **Node 24+** (`node:sqlite` is built into the runtime) and **pnpm 10.22** as pinned in [`package.json`](../../package.json#L6-L10).

Install Node 24 from your distribution or the NodeSource repository, then enable Corepack so it activates the pinned `pnpm@10.22.0` binary:

```sh
node --version          # must be v24.x.x or newer
sudo corepack enable
pnpm --version          # 10.22.0
```

---

## 2. Create a Dedicated User and Directories

Run Concord under an unprivileged system user with its own application and data directories:

```sh
sudo useradd --system --home-dir /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord --create-home --shell /usr/sbin/nologin stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo mkdir -p /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord/data /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo chown -R stellar-co-star-stellar-co-star-stellar-co-star-concord:stellar-co-star-stellar-co-star-stellar-co-star-concord /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo chown root:stellar-co-star-stellar-co-star-stellar-co-star-concord /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo chmod 0750 /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord
```

- `/opt/stellar-co-star-stellar-co-star-stellar-co-star-concord`: holds the git checkout and built output (`packages/core/dist`, `services/api/dist`, `apps/web/dist`).
- `/var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord/data`: holds `control.db` and per-workspace databases under `orgs/<orgId>.db` (`CONCORD_DATA_DIR`, configured in [`services/api/src/config.ts`](../../services/api/src/config.ts#L165)).
- `/etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env`: holds environment variables and secrets, readable only by `root` and `stellar-co-star-stellar-co-star-stellar-co-star-concord`.

---

## 3. Clone and Build

Clone the repository into `/opt/stellar-co-star-stellar-co-star-stellar-co-star-concord`, install dependencies with the frozen lockfile, and build all workspace packages:

```sh
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord git clone https://github.com/stellar-co-star/stellar-co-star-stellar-co-star-stellar-co-star-concord.git /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord
cd /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord pnpm install --frozen-lockfile
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord pnpm build
```

`pnpm build` compiles `@stellar-co-star-stellar-co-star-stellar-co-star-concord/core`, `@stellar-co-star-stellar-co-star-stellar-co-star-concord/api` (`services/api/dist/main.js`), and the static dashboard bundle (`apps/web/dist`).

---

## 4. Configure `/etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env`

Create `/etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env` based on [`.env.example`](../../.env.example) and [`services/api/src/config.ts`](../../services/api/src/config.ts):

```ini
NODE_ENV=production
CONCORD_HOST=127.0.0.1
CONCORD_PORT=4400
CONCORD_DATA_DIR=/var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord/data
CONCORD_PUBLIC_URL=https://stellar-co-star-stellar-co-star-stellar-co-star-concord.example.com
CONCORD_TRUST_PROXY=1
CONCORD_SIGNUP=code

# Optional: dedicated Stellar Mainnet RPC provider
# CONCORD_MAINNET_RPC_URLS=https://your-rpc-provider.example.com

# Optional: Google OAuth (both must be set together if used)
# CONCORD_GOOGLE_CLIENT_ID=...
# CONCORD_GOOGLE_CLIENT_SECRET=...
```

Lock down permissions on the environment file:

```sh
sudo chown root:stellar-co-star-stellar-co-star-stellar-co-star-concord /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env
sudo chmod 0640 /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env
```

Keeping `CONCORD_HOST=127.0.0.1` binds the HTTP server to the loopback interface so only a local TLS reverse proxy (such as Caddy or Nginx) can reach port `4400`. Set `CONCORD_TRUST_PROXY=1` when one local reverse proxy forwards `X-Forwarded-For` (`services/api/src/config.ts#L171`, `services/api/src/auth-api.ts#L27`).

---

## 5. Create the `systemd` Unit File

Write `/etc/systemd/system/stellar-co-star-stellar-co-star-stellar-co-star-concord.service`:

```ini
[Unit]
Description=Concord Stellar Securities Reconciliation Service
Documentation=https://github.com/stellar-co-star/stellar-co-star-stellar-co-star-stellar-co-star-concord
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=stellar-co-star-stellar-co-star-stellar-co-star-concord
Group=stellar-co-star-stellar-co-star-stellar-co-star-concord
WorkingDirectory=/opt/stellar-co-star-stellar-co-star-stellar-co-star-concord
EnvironmentFile=/etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env
ExecStart=/usr/bin/node /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord/services/api/dist/main.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=15

# Hardening: only /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord is writable
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now stellar-co-star-stellar-co-star-stellar-co-star-concord.service
```

Verify the server is listening and `control.db` initialized cleanly (`services/api/src/api.ts#L81-L84`):

```sh
curl -fsS http://127.0.0.1:4400/api/health
# {"ok":true}
```

---

## 6. Inspecting Logs with `journalctl`

Concord writes startup information, indexer progress (`sync <orgId>/<assetId>: +N events`), errors, and graceful shutdown messages (`SIGTERM: shutting down` in [`services/api/src/main.ts`](../../services/api/src/main.ts#L125-L161)) to standard output and standard error, which `systemd` captures in the journal:

```sh
# Follow live logs
sudo journalctl -u stellar-co-star-stellar-co-star-stellar-co-star-concord.service -f

# Show logs since the last boot or within the last hour
sudo journalctl -u stellar-co-star-stellar-co-star-stellar-co-star-concord.service -b
sudo journalctl -u stellar-co-star-stellar-co-star-stellar-co-star-concord.service --since "1 hour ago"

# Filter for errors or warnings
sudo journalctl -u stellar-co-star-stellar-co-star-stellar-co-star-concord.service -p err..warning
```

---

## 7. Running Operator CLI Commands

The `pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord` CLI ([`services/api/src/cli.ts`](../../services/api/src/cli.ts)) reads the same `CONCORD_DATA_DIR` and uses SQLite WAL mode with a 5-second `busy_timeout` (`services/api/src/db.ts#L20`), so it is safe to run while `stellar-co-star-stellar-co-star-stellar-co-star-concord.service` is active. Always run CLI commands as the `stellar-co-star-stellar-co-star-stellar-co-star-concord` user with the same environment file:

```sh
cd /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord sh -c 'set -a; . /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env; set +a; pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord signup-code --note "onboarding"'
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord sh -c 'set -a; . /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env; set +a; pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord orgs'
```

See [`docs/operator-guide.md`](../operator-guide.md) and [`docs/cli.md`](../cli.md) for all operator and workspace commands.

---

## 8. Backing Up and Updating

### Taking a Consistent Backup

Because `control.db` and `orgs/*.db` run in WAL mode (`services/api/src/db.ts#L20`), do not copy raw `.db` files with `cp` while the service is running. Use `pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord backup`, which invokes SQLite's online backup API across `control.db` and every workspace database (`services/api/src/cli.ts#L132-L138`):

```sh
cd /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord sh -c 'set -a; . /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env; set +a; pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord backup /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord/backups/$(date -u +%Y%m%dT%H%M%SZ)'
```

### Updating Concord

Migrations in [`services/api/src/schema.ts`](../../services/api/src/schema.ts) are forward-only (`docs/upgrading.md`). Always take a backup before pulling a new version:

```sh
cd /opt/stellar-co-star-stellar-co-star-stellar-co-star-concord

# 1. Back up the databases while the old version runs
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord sh -c 'set -a; . /etc/stellar-co-star-stellar-co-star-stellar-co-star-concord/stellar-co-star-stellar-co-star-stellar-co-star-concord.env; set +a; pnpm stellar-co-star-stellar-co-star-stellar-co-star-concord backup /var/lib/stellar-co-star-stellar-co-star-stellar-co-star-concord/backups/pre-upgrade'

# 2. Fetch and build the new version
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord git fetch origin main
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord git checkout main
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord git pull --ff-only origin main
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord pnpm install --frozen-lockfile
sudo -u stellar-co-star-stellar-co-star-stellar-co-star-concord pnpm build

# 3. Restart the service (migrations run automatically on startup)
sudo systemctl restart stellar-co-star-stellar-co-star-stellar-co-star-concord.service

# 4. Verify health and logs
curl -fsS http://127.0.0.1:4400/api/health
sudo journalctl -u stellar-co-star-stellar-co-star-stellar-co-star-concord.service -n 50 --no-pager
```

If an upgrade needs to be rolled back, follow the backup-restore steps in [`docs/upgrading.md`](../upgrading.md#rolling-back).
