# ElNadjah Backend

## Setup
1. Install dependencies:
   - npm install
2. Create a `.env` file from `.env.example` (use column index overrides if your headers differ).
3. Configure auth variables:
   - `ADMIN_EMAIL=admin@elnadjah.com`
   - `ADMIN_PASSWORD=Admin@123456`
   - `CORS_ORIGIN=http://localhost:5173,https://analytics.elnadjah.com`
3. Run the server:
   - npm run dev

## Deployment Notes
- Frontend and backend must agree on the API base URL.
- If frontend uses a different domain than backend, set `VITE_API_URL` in frontend build and include the frontend domain in backend `CORS_ORIGIN`.
- If frontend and backend are served behind one domain with reverse proxy, keep `VITE_API_URL` empty and route `/api` to backend.

## API
- GET `/api/health`
- POST `/api/auth/login`
- GET `/api/auth/me`
- POST `/api/auth/logout`
- GET `/api/leads`
- GET `/api/stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&counselor=Name`
- POST `/api/notifications/daily-summary/send` (auth required)
- POST `/api/notifications/weekly-summary/send` (auth required)
- POST `/api/notifications/agent-alerts/send` (auth required)
- POST `/api/notifications/weekly-manager-pack/send` (auth required)

## Daily Email Summary
You can send a daily summary email at 09:00 for the previous calendar day window (00:00 to 00:00 in your timezone).

Included metrics:
- Total leads
- Assigned leads + assigned ratio
- Not contacted leads
- Interested leads + interested ratio
- Destination totals with contacted ratio for each destination
- Top agents by assigned leads

1. Configure SMTP and recipients in `.env`:
   - `DAILY_SUMMARY_RECIPIENTS`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
2. Enable scheduler:
   - `DAILY_SUMMARY_ENABLED=true`
   - `DAILY_SUMMARY_CRON=0 9 * * *` (default 09:00)
   - `DAILY_SUMMARY_TIMEZONE=UTC`
3. Restart backend.

Manual test:
- Send a POST request to `/api/notifications/daily-summary/send` with your auth token.
- Optional custom window start date (YYYY-MM-DD): `POST /api/notifications/daily-summary/send` with body `{ "date": "2026-02-13" }`.

## Weekly Email Summary
You can send a weekly performance summary every Friday at 21:00 (9 PM) in your timezone.

Default weekly window:
- Algeria week mode: Saturday 00:00 to next Saturday 00:00 (Friday is the last day).
- Manual mode with `date`: Algeria-week 7-day window containing the provided date.

1. Configure weekly recipients and timezone in `.env`:
   - `WEEKLY_SUMMARY_RECIPIENTS` (falls back to `DAILY_SUMMARY_RECIPIENTS` if not set)
   - `WEEKLY_SUMMARY_TIMEZONE` (falls back to `DAILY_SUMMARY_TIMEZONE`)
2. Enable weekly scheduler:
   - `WEEKLY_SUMMARY_ENABLED=true`
   - `WEEKLY_SUMMARY_CRON=0 21 * * 5` (Friday 21:00)
3. Restart backend.

Manual weekly test:
- Send a POST request to `/api/notifications/weekly-summary/send` with your auth token.
- Optional reference date (YYYY-MM-DD): `POST /api/notifications/weekly-summary/send` with body `{ "date": "2026-03-08" }`.

## Weekly Manager Pack and Red Alerts
For manager operations, you can automate three outputs:
1. Weekly summary email to manager/founders (team + destinations).
2. Weekly per-agent performance emails to manager + each agent.
3. Red alert emails when an agent breaks activity rules:
    - Inactive for 2 full days in a row.
    - Inactive for 3+ days within the Algeria week (must work at least 4 days).
    - Contacted less than 50 leads in the week.
    - Interested rate below 10% in the week.

Required env settings:
- `AGENT_EMAIL_MAP=name:email,name2:email2`
- `WEEKLY_AGENT_MANAGER_RECIPIENTS`
- `AGENT_ALERT_MANAGER_RECIPIENTS`
- `AGENT_ALERT_FOUNDERS_RECIPIENTS`
- Optional scheduler flags:
   - `AGENT_ALERTS_ENABLED=true`
   - `AGENT_ALERTS_CRON=0 10 * * *`
   - `AGENT_ALERTS_TIMEZONE=Africa/Algiers`

Manual tests:
- `POST /api/notifications/agent-alerts/send`
- `POST /api/notifications/weekly-manager-pack/send`
