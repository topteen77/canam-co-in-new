# Production deploy

Frontend PM2: **`new-crm-web`** on port **3001** (`/var/www/canam-co-in-new`)  
Backend PM2: **`new-crm-api`** on port **5002** (`/var/www/canam-co-in-new/server`)

Both processes run as **root**. Always use `sudo pm2` (`sudo pm2 list`, `sudo pm2 restart`, `sudo pm2 logs`).

Pushes to `main` SSH in as **`dev`** and run the same commands you use by hand:

```bash
cd /var/www/canam-co-in-new/
sudo npm run build
sudo pm2 start server/index.js --name new-crm-api   # or restart if it already exists
sudo pm2 serve dist 3001 --spa --name new-crm-web   # or restart if it already exists
```

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
echo 'dev ALL=(root) NOPASSWD: /usr/bin/pm2, /usr/local/bin/pm2, /usr/bin/npm, /usr/local/bin/npm, /usr/bin/npx, /usr/local/bin/npx, /usr/bin/node, /usr/local/bin/node, /usr/bin/git' | sudo tee /etc/sudoers.d/canam-github-deploy
sudo chmod 440 /etc/sudoers.d/canam-github-deploy
sudo visudo -cf /etc/sudoers.d/canam-github-deploy
sudo -n pm2 list
```

Keep the existing root PM2 apps. Do **not** start a second copy under the `dev` user.

If GitHub Actions reports `detected dubious ownership` or `sudo: a password is required` for git, run this once as `dev`:

```bash
sudo git config --system --add safe.directory /var/www/canam-co-in-new
sudo chown -R dev:dev /var/www/canam-co-in-new
```

`.env` stays in that directory; PM2 can still run as root and read the files.

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
2. SSH as `dev` into `/var/www/canam-co-in-new`.
3. Copy live `dist/` aside (so a failed build can be undone).
4. `git fetch` + `git reset --hard origin/main`.
5. `sudo npm ci` in the app and `server/`.
6. `sudo npm run build`. **If this fails, previous `dist/` is restored and PM2 is not restarted.**
7. `sudo pm2 restart new-crm-api` or `sudo pm2 start server/index.js --name new-crm-api`.
8. `sudo pm2 restart new-crm-web` or `sudo pm2 serve dist 3001 --spa --name new-crm-web`.
9. Check HTTP on port 3001.

`.env` on the server is not in git and is left untouched.

### Manual deploy on the server

```bash
cd /var/www/canam-co-in-new
./scripts/remote-deploy.sh
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

To (re)create the apps if they are missing:

```bash
cd /var/www/canam-co-in-new
sudo pm2 start server/index.js --name new-crm-api
sudo pm2 serve dist 3001 --spa --name new-crm-web
sudo pm2 save
```

Do not start duplicates.
