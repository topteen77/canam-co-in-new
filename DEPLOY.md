# Deployment

## Prerequisites
- Node.js 18+
- MySQL database
- (Optional) Firebase project for auth

## Steps

### 1. Backend (API server)
```
cd server
cp env.example .env
# Edit .env with your DB URL, JWT secret, Firebase credentials, etc.
npm install
npm run start
# Or: node index-simple.js (default port 3001)
```

### 2. Frontend (build and serve)
```
npm install
npm run build
# Serves from dist/ — use any static host (nginx, Firebase Hosting, etc.)
# Or run: npx serve dist -p 3000
```

### 3. Production
- Point your reverse proxy (nginx/apache) to:
  - API: http://localhost:3001 (or your server port)
  - Static: dist/ folder
- Set `VITE_API_URL` in .env before building (e.g. `VITE_API_URL=https://api.yoursite.com/api`) so the frontend calls your live API.
