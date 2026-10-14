#!/usr/bin/env bash
# Receives a checked-out release from the trusted LAN runner over SSH.
# Never run this script as root or directly from untrusted branches.
set -Eeuo pipefail
umask 077

die() { printf 'REMOTE DEPLOY ERROR: %s\n' "$*" >&2; exit 1; }

root="${1:?deployment root required}"
release_id="${2:?release ID required}"
commit_sha="${3:?commit SHA required}"
health_url="${4:?loopback health URL required}"
node_bin_dir="${5:-}"

[[ "$root" =~ ^/[a-zA-Z0-9._/-]+$ && "$root" != *".."* && "$root" != *"//"* ]] || die "Invalid deployment root"
[[ "$release_id" =~ ^[0-9a-fA-F]{12}-(manual|[0-9]+)-[0-9]+$ ]] || die "Invalid release ID"
[[ "$commit_sha" =~ ^[a-fA-F0-9]{40}$ ]] || die "Invalid commit SHA"
[[ "$health_url" =~ ^http://127[.]0[.]0[.]1:[0-9]{1,5}/api/health$ ]] || die "Health check must use loopback"
[[ -z "$node_bin_dir" || "$node_bin_dir" =~ ^/[a-zA-Z0-9._/-]+$ ]] || die "Invalid runtime bin directory"
if [[ -n "$node_bin_dir" ]]; then export PATH="$node_bin_dir:$PATH"; fi

for tool in node npm pm2 curl flock; do command -v "$tool" >/dev/null || die "Missing server prerequisite: $tool"; done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == "24" ]] || die "Node.js 24 is required"

release="$root/releases/$release_id"
[[ -d "$release" && -f "$release/package.json" && -f "$release/ecosystem.config.cjs" ]] || die "Uploaded release is incomplete"
[[ -f "$root/shared/.env" ]] || die "Missing server-side shared/.env"
[[ -d "$root/shared/data" && -d "$root/shared/backups" ]] || die "Missing shared data and backup directories"
[[ ! -f "$root/package.json" && ! -d "$root/.git" ]] || die "Refusing to replace existing flat installation"

exec 9>"$root/.deploy.lock"
flock -w 30 9 || die "Another server deployment is in progress"

previous=""
if [[ -L "$root/current" ]]; then
  previous="$(readlink -f "$root/current")"
  [[ "$previous" == "$root/releases/"* && -f "$previous/ecosystem.config.cjs" ]] || die "current symlink points outside managed releases"
elif [[ -e "$root/current" ]]; then
  die "current exists but is not a symlink"
fi

# Detect a conflicting, externally managed PM2 application rather than creating a duplicate.
pm2_process_at() {
  local expected="$1"
  pm2 jlist | node -e '
    const fs = require("node:fs");
    let data = "";
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(data);
        const app = apps.find(item => item.name === "relaydesk");
        const cwd = app?.pm2_env?.pm_cwd;
        if (!app || app.pm2_env.status !== "online" || !cwd ||
            fs.realpathSync(cwd) !== fs.realpathSync(process.argv[1])) process.exitCode = 1;
      } catch { process.exitCode = 1; }
    });
  ' "$expected"
}

if pm2 describe relaydesk >/dev/null 2>&1; then
  [[ -n "$previous" ]] || die "Existing relaydesk PM2 process is not managed by this release layout"
  pm2_process_at "$previous" || die "Existing relaydesk PM2 process does not belong to the current release"
fi

for name in .env data backups; do
  [[ ! -e "$release/$name" && ! -L "$release/$name" ]] || die "Release unexpectedly contains $name"
done
ln -s "$root/shared/.env" "$release/.env"
ln -s "$root/shared/data" "$release/data"
ln -s "$root/shared/backups" "$release/backups"
printf '%s\n' "$commit_sha" > "$release/.deploy-commit"

cd "$release"

# Take a SQLite online backup before the new release might apply migrations.
# DATABASE_PATH remains server-side and is never uploaded to GitHub.
node --env-file=.env --input-type=module - "$root/shared/backups/predeploy-$release_id.sqlite" <<'BACKUP_NODE'
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
const source = resolve(process.env.DATABASE_PATH || './data/relaydesk.sqlite');
const destination = process.argv[2];
if (existsSync(source)) {
  const db = new DatabaseSync(source);
  try { await backup(db, destination); } finally { db.close(); }
  chmodSync(destination, 0o600);
  console.log('SQLite online backup created before deployment');
} else {
  console.log('No existing SQLite database; first installation');
}
BACKUP_NODE

printf 'Installing locked dependencies and building release %s\n' "$release_id"
npm ci --no-audit --no-fund
npm run test:vps
NEXT_TELEMETRY_DISABLED=1 npm run build

activated=0
rollback_on_error() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo "Deployment failed (exit $status)." >&2
    if (( activated == 1 )); then
      echo "Restoring the previous application release; database migrations are NOT reversed." >&2
      if [[ -n "$previous" ]]; then
        local rollback_link="$root/.current.rollback.$$"
        ln -s "$previous" "$rollback_link"
        mv -Tf -- "$rollback_link" "$root/current"
        pm2 startOrRestart "$root/current/ecosystem.config.cjs" --update-env || echo "Manual PM2 recovery may be needed" >&2
      else
        pm2 delete relaydesk >/dev/null 2>&1 || true
        [[ -L "$root/current" ]] && rm -f -- "$root/current"
      fi
      pm2 save || echo "PM2 save failed after rollback" >&2
    fi
  fi
  exit "$status"
}
trap rollback_on_error EXIT

# The symlink change is atomic on a single Linux filesystem. PM2 uses one
# fork-mode process; expect a brief restart, not zero downtime.
next_link="$root/.current.next.$$"
ln -s "releases/$release_id" "$next_link"
mv -Tf -- "$next_link" "$root/current"
activated=1
pm2 startOrRestart "$root/current/ecosystem.config.cjs" --update-env

healthy=0
for attempt in $(seq 1 20); do
  body="$(curl --noproxy '*' -fsS --max-time 4 "$health_url" 2>/dev/null || true)"
  if pm2_process_at "$release" && [[ -n "$body" ]] &&
    node -e 'try { if (JSON.parse(process.argv[1]).status !== "ok") process.exit(1); } catch { process.exit(1); }' "$body"; then
    healthy=1
    break
  fi
  sleep 3
done
(( healthy == 1 )) || die "New PM2 release did not pass process and SQLite health checks"
pm2 save
printf '%s\n' "$commit_sha" > "$root/shared/last-deployed-sha"
printf 'Healthy release %s activated; previous releases remain available for recovery\n' "$release_id"
