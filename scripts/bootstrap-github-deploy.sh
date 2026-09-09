#!/usr/bin/env bash
# One-time server setup so GitHub Actions can SSH in and run sudo pm2.
# Run as the deploy user (dev) on the production VPS:
#   bash scripts/bootstrap-github-deploy.sh

set -euo pipefail

DEPLOY_PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMIuqyc6rAhWKIuYLWyfYMfqZ27I5XHzYbcossxd8oH8 github-actions-deploy-canam-co-in-new'
SUDOERS_FILE='/etc/sudoers.d/canam-github-deploy'

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

log "User: $(id -un)  Host: $(hostname)"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

if grep -Fq 'github-actions-deploy-canam-co-in-new' "$HOME/.ssh/authorized_keys"; then
  log "Deploy public key already in ~/.ssh/authorized_keys"
else
  printf '%s\n' "$DEPLOY_PUB" >> "$HOME/.ssh/authorized_keys"
  log "Added GitHub Actions deploy key to ~/.ssh/authorized_keys"
fi

# Passwordless sudo for the same tools used in a manual production deploy:
#   sudo npm run build
#   sudo pm2 start|restart|serve
ALLOW='/usr/bin/pm2, /usr/local/bin/pm2, /usr/bin/npm, /usr/local/bin/npm, /usr/bin/npx, /usr/local/bin/npx, /usr/bin/node, /usr/local/bin/node, /usr/bin/git'
USER_PM2="$(command -v pm2 || true)"
if [[ -n "$USER_PM2" && "$USER_PM2" != '/usr/bin/pm2' && "$USER_PM2" != '/usr/local/bin/pm2' ]]; then
  ALLOW="$ALLOW, $USER_PM2"
fi

SUDOERS_LINE="$(id -un) ALL=(root) NOPASSWD: $ALLOW"

log "Installing sudoers rule for passwordless sudo pm2..."
echo "$SUDOERS_LINE" | sudo tee "$SUDOERS_FILE" >/dev/null
sudo chmod 440 "$SUDOERS_FILE"
sudo visudo -cf "$SUDOERS_FILE" >/dev/null
log "Wrote $SUDOERS_FILE"
log "Rule: $SUDOERS_LINE"

log "Verifying sudo pm2 (no password)..."
if sudo -n pm2 ping >/dev/null 2>&1; then
  sudo -n pm2 list
else
  die "sudo pm2 still needs a password or pm2 is not on sudo PATH. Install globally as root: sudo npm i -g pm2"
fi

log "Bootstrap complete. GitHub Actions can SSH as $(id -un) and run sudo pm2."
