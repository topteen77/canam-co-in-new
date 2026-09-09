# Production deploy

Frontend PM2: **`new-crm-web`** on port **3001** (`/var/www/canam-co-in-new`)  
Backend PM2: **`new-crm-api`** on port **5002** (`/var/www/canam-co-in-new/server`)

Both processes run as **root**. Always use `sudo pm2` (`sudo pm2 list`, `sudo pm2 restart`, `sudo pm2 logs`).

Pushes to `main` (and **Actions → Deploy production → Run workflow**) build the frontend on GitHub, copy `dist/` to the server, then restart both PM2 apps.

Vite is **not** built on the VPS (it previously ran out of memory). GitHub Actions builds `dist/`.

---

## One-time server setup

SSH in as `dev`, then from the project directory:

```bash
cd /var/www/canam-co-in-new
git pull origin main
bash scripts/bootstrap-github-deploy.sh
```

That script:

1. Adds the GitHub Actions SSH public key to `~/.ssh/authorized_keys`
2. Allows passwordless `sudo pm2` (root’s process list)
3. Checks `sudo pm2 list`

If you cannot pull yet, add the key by hand:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMIuqyc6rAhWKIuYLWyfYMfqZ27I5XHzYbcossxd8oH8 github-actions-deploy-canam-co-in-new' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Then allow passwordless `sudo pm2`:

```bash
echo 'dev ALL=(root) NOPASSWD: /usr/bin/pm2, /usr/local/bin/pm2' | sudo tee /etc/sudoers.d/canam-github-deploy
sudo chmod 440 /etc/sudoers.d/canam-github-deploy
sudo visudo -cf /etc/sudoers.d/canam-github-deploy
sudo -n pm2 list
```

Keep the existing root PM2 apps. Do **not** start a second copy under the `dev` user.

---

## GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `DEPLOY_HOST` | server public IP or hostname |
| `DEPLOY_USER` | `dev` |
| `DEPLOY_SSH_KEY` | private key for the public key above |
| `DEPLOY_PORT` | `22` |
| `PROD_DEPLOY_PATH` | `/var/www/canam-co-in-new` |
| `VITE_API_URL` | optional; defaults in code to `https://canam.co.in/api` |

Environment **production** is used by the workflow.

---

## How a deploy works

SSH user is **`dev`** (keys in `/home/dev/.ssh`). GitHub secrets: `DEPLOY_USER=dev`, `DEPLOY_SSH_KEY` matching that account.

1. Push to `main` (or run the workflow manually).
2. GitHub installs deps and runs `npm run build`. **If this fails, deploy does not run — the live site stays as-is.**
3. `dist.tar.gz` is copied to `/tmp/canam-co-in-new/` on the server (not into the live directory).
4. SSH as `dev` runs `scripts/remote-deploy.sh`, which:
   - validates the new archive in a staging folder (live `dist/` is not deleted first)
   - `git fetch` + `git reset --hard origin/main`
   - `npm ci` in the app and in `server/`
   - only then swaps `dist/` and `sudo pm2 restart new-crm-api` / `new-crm-web`
   - checks HTTP on ports 3001 and 5002
   - on any of those failures: restores the previous commit + previous `dist/` and restarts PM2

`.env` on the server is not in git and is left untouched.

### Manual deploy on the server (after a local/CI `dist` upload)

```bash
cd /var/www/canam-co-in-new
DIST_TARBALL=/tmp/canam-co-in-new/dist.tar.gz ./scripts/remote-deploy.sh
sudo pm2 list
```

---

## PM2 cheat sheet (root)

```bash
sudo pm2 list
sudo pm2 restart new-crm-api new-crm-web
sudo pm2 logs new-crm-api --lines 80
sudo pm2 logs new-crm-web --lines 80
sudo pm2 save
```

To (re)create the apps from the repo config:

```bash
cd /var/www/canam-co-in-new
sudo pm2 start ecosystem.config.cjs
sudo pm2 save
```

Only do that if `new-crm-api` / `new-crm-web` are missing. Do not start duplicates.
