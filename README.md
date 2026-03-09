# ElNadjah Dashboard

Full-stack dashboard for Google Form responses stored in Google Sheets.

## Tech Stack
- Frontend: React (Vite) + Tailwind CSS + Recharts
- Backend: Node.js + Express
- Auth: Google Sheets API (service account)

## Setup

### 1) Google Sheets Service Account
1. Create a service account in Google Cloud.
2. Enable Google Sheets API for the project.
3. Share your Google Sheet with the service account email.
4. Copy the service account email + private key into backend `.env`.

### 2) Backend
1. Go to [backend](backend) and install dependencies:
   - npm install
2. Create `.env` from [.env.example](backend/.env.example).
3. Start the server:
   - npm run dev

### 3) Frontend
1. Go to [frontend](frontend) and install dependencies:
   - npm install
2. Create `.env` from [frontend/.env.example](frontend/.env.example) if using a custom API URL.
3. Start the app:
   - npm run dev

## API
- POST `/api/auth/login`
- GET `/api/auth/me`
- POST `/api/auth/logout`
- GET `/api/leads`
- GET `/api/stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&counselor=Name`

## Login
- Default admin user: `admin@elnadjah.com`
- Default password: `Admin@123456`
- Change `ADMIN_EMAIL` and `ADMIN_PASSWORD` in backend environment variables for production.

## Deployment

### Backend
- Deploy to Render, Railway, or any Node.js host.
- Set environment variables from [backend/.env.example](backend/.env.example).
- Required auth variables for VPS:
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `AUTH_TOKEN_TTL_HOURS`
  - `CORS_ORIGIN` (set to your frontend domain)

### Frontend
- Deploy to Vercel or Netlify.
- Set `VITE_API_URL` to the backend URL (e.g. https://your-backend.com).

## VPS Quick Deploy
1. Backend
   - `cd backend`
   - `npm ci`
   - set `.env` values including Google + auth variables
   - `npm start` (or run with PM2/systemd)
2. Frontend
   - `cd frontend`
   - set `.env` with `VITE_API_URL=https://your-backend-domain`
   - `npm ci`
   - `npm run build`
   - serve `frontend/dist` with Nginx or any static file server

## Sync Local .env To VPS
If you want to keep secrets local and not commit them, use:

`powershell`
`./scripts/sync_env_and_restart_vps.ps1 -Host <VPS_IP> -User <SSH_USER> -AppPath </absolute/path/to/analyzer> -Pm2AppName <pm2_backend_app_name>`

This script uploads `backend/.env` to VPS, pulls latest `main`, installs backend deps, and restarts PM2.

## Notes
- Date filters are inclusive.
- The dashboard calculates last 30 days vs previous 30 days to show percentage change.
