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
- POST `/api/notifications/daily-summary/send` (auth required)
- POST `/api/notifications/weekly-summary/send` (auth required)

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
- Scheduler mode (and manual without `date`): previous full Friday-based week (Friday 00:00 to next Friday 00:00, end excluded).
- Manual mode with `date`: Friday-based 7-day window that contains the provided date (Friday 00:00 to next Friday 00:00, end excluded).

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
