# ElNadjah Backend

## Setup
1. Install dependencies:
   - npm install
2. Create a `.env` file from `.env.example` (use column index overrides if your headers differ).
3. Configure auth variables:
   - `ADMIN_EMAIL=admin@elnadjah.com`
   - `ADMIN_PASSWORD=Admin@123456`
   - `CORS_ORIGIN=http://localhost:5173`
3. Run the server:
   - npm run dev

## API
- GET `/api/health`
- POST `/api/auth/login`
- GET `/api/auth/me`
- POST `/api/auth/logout`
- GET `/api/leads`
- GET `/api/stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&counselor=Name`
