# GitHub Actions deploy test (production)

Manual commands that already work on the server (user **`dev`**, `/home/dev/.ssh`):

```bash
cd /var/www/canam-co-in-new/
sudo npm run build
sudo pm2 start server/index.js --name new-crm-api
sudo pm2 serve dist 3001 --spa --name new-crm-web
```

GitHub Actions now runs that same flow over SSH after `git pull` + `npm ci`.

**Fail-safe:** live `dist/` is copied aside first. If `npm run build` fails, that copy is put back and PM2 is **not** restarted, so the current site stays up.

**Checked:** 2026-09-09 — main site login works (Leads Dashboard).
