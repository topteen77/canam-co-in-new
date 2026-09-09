# GitHub Actions deploy test (production)

`npm run build` on the EC2 is **killed (out of memory)**. GitHub Actions therefore:

1. Runs `npm run build` on GitHub
2. Copies `dist/` to the server
3. `git pull` + `sudo npm ci` in `server/` only
4. `sudo pm2 restart new-crm-api` and `sudo pm2 restart new-crm-web`

If the GitHub build fails, nothing on the server changes. If unpack fails, the previous `dist/` is put back.

SSH user: **`dev`**. Passwordless: `sudo -n npm` and `sudo -n pm2`.
