# ChoreQuest Agent Notes

These notes are for future Codex sessions working in this development checkout.

## Repository Boundaries

- This checkout is for local development only.
- Do not edit, read from, copy from, or depend on the production checkout at `/docker/docker-compose/apps/chorequest/ChoreQuest`.
- Do not edit, read from, copy from, or depend on production configuration under `/docker/docker-compose/apps/chorequest` or the root project at `/docker/docker-compose/docker-compose.yaml`.
- Do not edit, read from, copy from, or depend on the production mount mapped to `/app/data` in the ChoreQuest container.
- Keep local data under this repo's ignored `./data/` directory. The intended local SQLite database is `./data/chores_os_dev.db`.
- Do not commit secrets. `.env` is ignored; use `.env.example` for safe local defaults.

## Git

- Prefer branches with the `codex/` prefix. For this setup work, use `codex/project-setup`.
- The Codex sandbox may need per-command Git safe-directory overrides, for example:
  `git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev status --short`
- Do not revert user changes. Existing untracked local items such as `.venv/` are local workspace state unless the user says otherwise.

## Local Development Defaults

- Backend dev port: `8123`
- Frontend Vite port: `5173`
- Production port: `8122`
- Local backend URL for the Vite proxy: `CHOREQUEST_BACKEND_URL=http://localhost:8123`
- Local database URL: `sqlite+aiosqlite:///./data/chores_os_dev.db`

Run backend commands from the repository root so `backend.config` loads the root `.env`.

## Project Shape

- Backend: FastAPI, SQLAlchemy async, SQLite, settings in `backend/config.py`.
- Frontend: React, Vite, Tailwind CSS 4 under `frontend/`.
- Built frontend assets live in `static/` and are served by FastAPI in production.
- Avoid editing generated files in `static/` unless the task is explicitly to refresh production build assets.

## Useful Checks

- Vite proxy config test: `node --test frontend/vite.config.test.js`
- Frontend build, if Node tooling is available: `npm --prefix frontend run build`
- Backend syntax check: `python -m compileall backend`
