#!/usr/bin/env bash
# Server-side deploy after GitHub has uploaded dist.tar.gz.
# Do not run `npm run build` here — Vite is OOM-killed on this VPS.
#
#   DIST_TARBALL=/tmp/canam-co-in-new/dist.tar.gz ./scripts/remote-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CRM_API_NAME="${CRM_API_NAME:-new-crm-api}"
CRM_WEB_NAME="${CRM_WEB_NAME:-new-crm-web}"
TARBALL="${DIST_TARBALL:-/tmp/canam-co-in-new/dist.tar.gz}"
BACKUP="/tmp/canam-dist.prev"
STAGING="/tmp/canam-new-dist"
SUCCESS=0

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

restore_dist() {
  if [[ -d "$BACKUP" ]]; then
    log "Restoring previous dist/ — live site kept"
    rm -rf "$ROOT/dist"
    cp -a "$BACKUP" "$ROOT/dist"
  fi
}
trap 'if [[ "$SUCCESS" != 1 ]]; then restore_dist; fi' EXIT

[[ -f "$TARBALL" ]] || die "missing $TARBALL — upload dist from GitHub Actions first"
[[ -f dist/index.html ]] || die "live dist/index.html missing; refusing to deploy"

rm -rf "$STAGING"
mkdir -p "$STAGING"
tar -xzf "$TARBALL" -C "$STAGING"
if [[ -f "$STAGING/dist/index.html" ]]; then
  NEW_DIST="$STAGING/dist"
elif [[ -f "$STAGING/index.html" ]]; then
  NEW_DIST="$STAGING"
else
  die "index.html not in archive — live site unchanged"
fi

rm -rf "$BACKUP"
cp -a dist "$BACKUP"
log "Live dist backed up"

log "git fetch/reset origin/main"
git -c "safe.directory=*" fetch origin main
git -c "safe.directory=*" checkout main
git -c "safe.directory=*" reset --hard origin/main

log "sudo npm ci (server)"
(cd server && sudo -n /usr/bin/npm ci)

log "Activating new dist/"
rm -rf dist
cp -a "$NEW_DIST" dist
[[ -f dist/index.html ]] || die "dist/index.html missing after swap"

if sudo -n pm2 describe "$CRM_API_NAME" >/dev/null 2>&1; then
  sudo -n pm2 restart "$CRM_API_NAME" --update-env
else
  sudo -n pm2 start server/index.js --name "$CRM_API_NAME"
fi

if sudo -n pm2 describe "$CRM_WEB_NAME" >/dev/null 2>&1; then
  sudo -n pm2 restart "$CRM_WEB_NAME"
else
  sudo -n pm2 serve dist 3001 --spa --name "$CRM_WEB_NAME"
fi
sudo -n pm2 save || true
sudo -n pm2 list

web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3001/ || true)"
log "Frontend :3001 HTTP $web_code"
[[ "$web_code" == "200" || "$web_code" == "304" ]] || die "frontend check failed"

SUCCESS=1
trap - EXIT
rm -rf "$BACKUP" "$STAGING"
log "Deploy complete"
