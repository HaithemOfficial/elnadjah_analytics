# ElNadjah Frontend

## Setup
1. Install dependencies:
   - npm install
2. Run the app:
   - npm run dev

The app now requires authentication and will show a login portal before loading dashboard data.

## Environment
- `VITE_API_URL` is optional.
- Local development: leave it empty and use Vite proxy (`/api` -> `http://localhost:4000`), or set it explicitly.
- Production: set it to your public backend URL (for example `https://api.analytics.elnadjah.com`) or leave it empty when your host proxies `/api` to backend.
- Do not set `VITE_API_URL` to `localhost` for production builds.

Default development login (configured in backend env):
- Email: `admin@elnadjah.com`
- Password: `Admin@123456`
