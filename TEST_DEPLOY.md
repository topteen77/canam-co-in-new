# GitHub Actions deploy test (production)

This file is a pipeline smoke test. If you can open it on the server after a `main` push, GitHub Actions reached EC2 as user **`dev`**.

**Checked:** 2026-09-09 — main site login works (Leads Dashboard).

## How production stays up if a build fails

1. GitHub runs `npm ci` + `npm run build` **before** any SSH to the server.
2. If that build fails, the **deploy job is skipped**. The live site is not touched.
3. On the server (`/home/dev/.ssh` keys, SSH user `dev`):
   - New `dist/` is unpacked to a staging folder and checked for `index.html`.
   - Invalid archive → **exit, live `dist/` unchanged, PM2 not restarted**.
   - `npm ci` / PM2 / port check failure → **git + `dist/` rolled back**, previous PM2 processes brought back.

Live apps: `new-crm-web` (port 3001) and `new-crm-api` (port 5002) under `/var/www/canam-co-in-new`.

See `DEPLOY.md` for secrets (`DEPLOY_USER=dev`) and one-time server setup.