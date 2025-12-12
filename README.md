# Efficio Backend

Express + MongoDB API for the Efficio suite (tasks, groups, activities, notifications, time-tracker, SSE events).

## Prerequisites
- Node.js (LTS recommended)
- MongoDB connection string

## Setup
```bash
cd efficio-backend
npm install
```

## Environment Variables
Create `.env` in `efficio-backend/`:
```
PORT=4000
MONGO_URI=mongodb+srv://kc007:K%40rtik72088@efficio-cluster.vn9k8ns.mongodb.net/efficio?appName=efficio-cluster
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://efficio-api
AUTH0_API_IDENTIFIER=https://efficio-api
FRONTEND_URL=https://go-efficio.netlify.app,http://localhost:3000
```
- `MONGO_URI` must include credentials and database name.
- `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`/`AUTH0_API_IDENTIFIER` must match your Auth0 API setup.
- `FRONTEND_URL` may be comma-separated for local + deployed origins.

## Scripts
- `npm run dev` – start with nodemon
- `npm start` – start in production mode

## Auth
- JWT validation via Auth0 using `express-jwt` and `jwks-rsa`.
- Middleware chain: `debugAuth` (dev logging), `checkJwt`, `attachUser`, exported as `authenticate`.

## Services & Jobs
- SSE endpoints under `/api/events` using in-memory client registry (development scale only).
- Daily summary cron at 23:59 via `node-cron` (time-tracker summaries).

## Key Routes (under `/api`)
- `/tasks`, `/groups`, `/activities`, `/notifications`, `/users`
- `/events/stream` (SSE), `/events/debug/*` (dev-only)
- `/time/*` (time-tracker controllers)

## Notes
- Frontends target this API at `API_BASE_URL` (defaults to `http://localhost:4000/api`).
- Configure CORS via `FRONTEND_URL` to allow deployed/local hosts.

## AI Tooling Disclosure
Portions of this backend were authored/refined with AI assistance (GitHub Copilot / GPT-5.1-Codex-Max Preview). All changes are reviewed by the team.# Efficio Backend

Express.js backend for the Efficio productivity platform.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `MONGO_URI` - MongoDB Atlas connection string
- `PORT` - Server port (defaults to 4000)
- `FRONTEND_URL` - Comma-separated list of allowed frontend URLs for CORS
- `AUTH0_DOMAIN` - (Optional) Auth0 domain if using Auth0
- `AUTH0_AUDIENCE` - (Optional) Auth0 audience if using Auth0

## Local Development

```bash
npm install
npm run dev  # Starts with nodemon for auto-reload
```

## Deployment to Render

1. **Push your code to GitHub** (if not already done)

2. **Create a new Web Service on Render:**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `efficio-backend` directory

3. **Configure the service:**
   - **Name:** efficio-backend
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or paid for always-on)

4. **Set Environment Variables in Render Dashboard:**
   - Go to your service → Environment tab
   - Add the following variables:
     - `MONGO_URI` - Your MongoDB Atlas connection string (from your local .env)
     - `FRONTEND_URL` - Your Netlify frontend URL (e.g., `https://your-app.netlify.app`)
     - `NODE_ENV` - Set to `production`
     - `PORT` - Render sets this automatically, but you can set to 4000

5. **Deploy:**
   - Click "Create Web Service"
   - Render will build and deploy your backend
   - Your backend URL will be something like: `https://efficio-backend.onrender.com`

6. **Update Frontend:**
   - In Netlify, go to Site settings → Environment variables
   - Add `API_BASE_URL` with your Render backend URL (e.g., `https://efficio-backend.onrender.com/api`)
   - Redeploy your frontend

## Notes

- Free tier on Render sleeps after 15 minutes of inactivity
- First request after sleep may take ~30 seconds (wake-up time)
- For always-on uptime, consider Render's paid plan ($7/month)

