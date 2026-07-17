# Local Development

This repo is the development clone. It must stay separate from the live Docker checkout and live data.

## Safety Rules

- Do not use the production checkout at `/docker/docker-compose/apps/chorequest/ChoreQuest` from this workspace.
- Do not use production configuration under `/docker/docker-compose/apps/chorequest` or the root project at `/docker/docker-compose/docker-compose.yaml` from this workspace.
- Do not read from or depend on the production mount mapped to `/app/data` in the ChoreQuest container.
- Keep local SQLite data in this repo's ignored `./data/` directory.
- Do not put real production secrets in `.env`, docs, commits, shell history, or test fixtures.
- Treat port `8122` as production. Local backend development should use port `8123`.

## Ports

| Service | Local dev | Production |
| --- | --- | --- |
| Backend FastAPI | `http://localhost:8123` | `http://localhost:8122` |
| Frontend Vite | `http://localhost:5173` | Served by Docker/FastAPI on `8122` |
| Vite proxy target | `CHOREQUEST_BACKEND_URL` or `http://localhost:8123` | Not used by production static assets |

## Environment

Copy the safe example file and edit only local values:

```powershell
Copy-Item .env.example .env
```

Important local values:

```env
SECRET_KEY=local-development-only-secret-key
DATABASE_URL=sqlite+aiosqlite:///./data/chores_os_dev.db
COOKIE_SECURE=false
REGISTRATION_ENABLED=true
CORS_ORIGINS=http://localhost:5173
CHOREQUEST_BACKEND_URL=http://localhost:8123
```

`backend/config.py` reads `.env` from the current working directory. Run backend commands from the repo root so the local database path resolves to this checkout.

`frontend/vite.config.js` also loads the repo-root `.env` for `CHOREQUEST_BACKEND_URL`, so the frontend dev proxy follows the same local backend setting.

## Backend

From the repo root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8123
```

On first startup, the app creates the SQLite schema and seed data in `./data/chores_os_dev.db`.

Health check:

```powershell
Invoke-RestMethod http://localhost:8123/api/health
```

## Frontend

In another shell:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. API and WebSocket calls under `/api` and `/ws` proxy to `CHOREQUEST_BACKEND_URL`, which should be `http://localhost:8123` for local work.

## Verification

Lightweight checks:

```powershell
node --test frontend/vite.config.test.js
python -m compileall backend
npm --prefix frontend run build
```

If `npm` is not available but dependencies are already installed, Vite can be run directly:

```powershell
node frontend\node_modules\vite\bin\vite.js build --config frontend\vite.config.js
```

## Production Avoidance Checklist

Before running the app locally, confirm:

- `.env` contains `DATABASE_URL=sqlite+aiosqlite:///./data/chores_os_dev.db`.
- `.env` contains `CHOREQUEST_BACKEND_URL=http://localhost:8123`.
- Backend command uses `--port 8123`.
- Browser is opened to `http://localhost:5173`, not the production host.
- No local-development command references `/docker/docker-compose` or production container data.
