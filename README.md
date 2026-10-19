# Canam STUDYABROAD CRM

## Run locally

```bash
npm install
cd server && npm install && cd ..
cp .env.local.example .env.local
npm run dev
```

API (separate terminal):

```bash
cd server
npm start
```

---

## Deploy (GitHub Actions)

Pushes to `main` deploy production. The frontend is built on GitHub (do **not** run `npm run build` on the server — it runs out of memory). The server then pulls code, installs API deps, updates `dist/`, and restarts PM2.

### Normal deploy

```bash
git checkout main
git pull origin main
git add .
git commit -m "Your message"
git push origin main
```

Watch the run: GitHub → **Actions** → **Deploy production**.

To deploy without a new commit: **Actions** → **Deploy production** → **Run workflow**.

If the GitHub build fails, the live site is not changed.

### First-time PM2 (server, once)

```bash
cd /var/www/canam-co-in-new
sudo pm2 start server/index.js --name new-crm-api
sudo pm2 serve dist 3001 --spa --name new-crm-web
sudo pm2 save
```

### Check / restart on the server

```bash
cd /var/www/canam-co-in-new
git pull origin main
sudo pm2 list
sudo pm2 restart new-crm-api new-crm-web
sudo pm2 logs new-crm-api --lines 80
sudo pm2 logs new-crm-web --lines 80
```

Do not start a second copy of `new-crm-api` or `new-crm-web` if they are already online.

Local project run:
step1:
/home/itpc6/Public/Rakesh-crm/Rakesh git code/latest code-sep8/canam-co-in-new
npm install
cd server && npm install && cd ..
cp .env.local.example .env.local

step2:
server/.env 
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=phpadmin
DB_NAME=db_nod_crm
PORT=5002

step3:
docker run -d \
  --name rakesh-crm \
  --restart unless-stopped \
  --user 999:65534 \
  -e MYSQL_ROOT_PASSWORD='YOUR_DB_PASSWORD' \
  -e MYSQL_DATABASE=db_nod_crm \
  -e MYSQL_USER=phpadmin \
  -e MYSQL_PASSWORD='YOUR_DB_PASSWORD' \
  -p 3307:3306 \
  -v /home/itpc6/Public/Rakesh-crm/db-data:/var/lib/mysql \
  mysql:8.0 \
  mysqld --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

step4:
docker start rakesh-crm

step5:
cd server
npm run start-full

step6:
npm run dev


http://localhost:3001/
