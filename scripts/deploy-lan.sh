#!/usr/bin/env bash
# Runs on a dedicated LAN GitHub Actions runner (not on the aaPanel server).
set -Eeuo pipefail
umask 077

die() { printf 'DEPLOY ERROR: %s\n' "$*" >&2; exit 1; }

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_SSH_PORT:?DEPLOY_SSH_PORT is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${DEPLOY_SSH_KEY_FILE:?DEPLOY_SSH_KEY_FILE is required}"
: "${DEPLOY_SSH_KNOWN_HOSTS:?DEPLOY_SSH_KNOWN_HOSTS is required}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
DEPLOY_NODE_BIN_DIR="${DEPLOY_NODE_BIN_DIR:-}"

[[ "$DEPLOY_SHA" =~ ^[a-fA-F0-9]{40}$ ]] || die "DEPLOY_SHA must be a full Git commit SHA"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "DEPLOY_HOST must be a LAN IP address or DNS hostname"
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "DEPLOY_USER must be a Linux account name"
[[ "$DEPLOY_SSH_PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$DEPLOY_SSH_PORT >= 1 && 10#$DEPLOY_SSH_PORT <= 65535 )) || die "Invalid DEPLOY_SSH_PORT"
[[ "$DEPLOY_ROOT" =~ ^/[a-zA-Z0-9._/-]+$ && "$DEPLOY_ROOT" != "/" && "$DEPLOY_ROOT" != *".."* && "$DEPLOY_ROOT" != *"//"* ]] || die "Invalid DEPLOY_ROOT"
[[ -z "$DEPLOY_NODE_BIN_DIR" || ( "$DEPLOY_NODE_BIN_DIR" =~ ^/[a-zA-Z0-9._/-]+$ && "$DEPLOY_NODE_BIN_DIR" != *".."* && "$DEPLOY_NODE_BIN_DIR" != *"//"* ) ]] || die "Invalid DEPLOY_NODE_BIN_DIR"
[[ "$DEPLOY_HEALTH_URL" =~ ^http://127[.]0[.]0[.]1:[0-9]{1,5}/api/health$ ]] || die "DEPLOY_HEALTH_URL must target the server loopback /api/health"
[[ -r "$DEPLOY_SSH_KEY_FILE" ]] || die "SSH private key file is unreadable on the LAN runner"
[[ -r "$DEPLOY_SSH_KNOWN_HOSTS" ]] || die "Pinned SSH known_hosts file is missing on the LAN runner"
[[ -z "$(find "$DEPLOY_SSH_KEY_FILE" -maxdepth 0 -perm /077 -print)" ]] || die "SSH private key must not be accessible by group or others"

for tool in git ssh tar; do command -v "$tool" >/dev/null || die "Missing LAN runner prerequisite: $tool"; done
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] || die "Checked-out commit does not match the CI-verified commit"

# If main advanced while CI ran, skip the stale result (a newer successful CI will deploy).
current_main="$(git ls-remote --exit-code origin refs/heads/main | awk '{print $1}')"
if [[ "$current_main" != "$DEPLOY_SHA" ]]; then
  printf 'Skipping obsolete deployment: verified=%s current-main=%s\n' "$DEPLOY_SHA" "$current_main"
  exit 0
fi

run_id="${GITHUB_RUN_ID:-manual}"
attempt="${GITHUB_RUN_ATTEMPT:-1}"
[[ "$run_id" =~ ^(manual|[0-9]+)$ && "$attempt" =~ ^[0-9]+$ ]] || die "Invalid GitHub run identifier"
release_id="${DEPLOY_SHA:0:12}-$run_id-$attempt"
target="$DEPLOY_USER@$DEPLOY_HOST"

ssh_opts=(
  -i "$DEPLOY_SSH_KEY_FILE"
  -p "$DEPLOY_SSH_PORT"
  -o BatchMode=yes
  -o PasswordAuthentication=no
  -o IdentitiesOnly=yes
  -o ForwardAgent=no
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS"
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)

printf 'Preparing release %s on %s (server path %s)\n' "$release_id" "$DEPLOY_HOST" "$DEPLOY_ROOT"
ssh "${ssh_opts[@]}" "$target" "bash -s -- '$DEPLOY_ROOT' '$release_id'" <<'REMOTE_SETUP'
set -Eeuo pipefail
umask 077
root="$1"; release_id="$2"
[[ -d "$root" && -d "$root/releases" && -d "$root/shared/data" && -d "$root/shared/backups" ]] || {
  echo "Missing managed release directories; complete the initial LAN deployment setup first" >&2
  exit 1
}
[[ -f "$root/shared/.env" ]] || { echo "Missing server-side shared/.env" >&2; exit 1; }
[[ ! -e "$root/.git" && ! -f "$root/package.json" ]] || {
  echo "Refusing to overwrite an existing flat aaPanel/PM2 installation; migrate it manually first" >&2
  exit 1
}
[[ ! -e "$root/releases/$release_id" ]] || { echo "Release ID already exists" >&2; exit 1; }
mkdir -m 700 -- "$root/releases/$release_id"
REMOTE_SETUP

printf 'Transferring exact CI-verified source (no GitHub access required from the server)\n'
git archive --format=tar "$DEPLOY_SHA" |
  ssh "${ssh_opts[@]}" "$target" "tar -xf - -C '$DEPLOY_ROOT/releases/$release_id'"

printf 'Building, switching and health-checking the release through SSH\n'
ssh "${ssh_opts[@]}" "$target" \
  "bash -s -- '$DEPLOY_ROOT' '$release_id' '$DEPLOY_SHA' '$DEPLOY_HEALTH_URL' '$DEPLOY_NODE_BIN_DIR'" \
  < scripts/deploy-release-remote.sh

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### Relaydesk LAN deployment"
    echo "Release: $release_id"
    echo "Commit: $DEPLOY_SHA"
    echo "Status: deployed and health checked"
  } >> "$GITHUB_STEP_SUMMARY"
fi
printf 'Deployment healthy: %s\n' "$release_id"
