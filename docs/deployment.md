# Deployment Notes

This is the production flow for moving verified local changes to the Docker host. The development checkout, production source checkout, production configuration, and production data must remain separate.

## Docker Host Layout

| Path | Purpose |
| --- | --- |
| `/docker/docker-compose/docker-compose.yaml` | Root Compose project; defines shared resources such as the `macvlan` network. |
| `/docker/docker-compose/apps/chorequest/compose.yaml` | ChoreQuest service definition included by the root project. |
| `/docker/docker-compose/apps/chorequest/.env` | Values used while parsing the ChoreQuest include. Never copy this file into the development repo. |
| `/docker/docker-compose/apps/chorequest/ChoreQuest` | Production Git checkout and Docker build context. |

The root Compose file connects the app fragment with:

```yaml
include:
  - path: ./apps/chorequest/compose.yaml
    env_file:
      - ./apps/chorequest/.env
```

The included file has its own project directory, so relative paths such as `build: ./ChoreQuest` resolve under `/docker/docker-compose/apps/chorequest`.

The ChoreQuest file is not a standalone Compose project: its service refers to the shared `macvlan` network defined by the root file. Running `docker compose -f compose.yaml ...` from the app directory therefore fails with `undefined network macvlan`. Always run Compose lifecycle commands through `/docker/docker-compose/docker-compose.yaml`.

## Release Flow

1. Develop and verify changes in the local development checkout.
2. Commit and push the selected changes to `https://github.com/mperone/ChoreQuest.git`.
3. On the Docker host, pull the selected commit into `/docker/docker-compose/apps/chorequest/ChoreQuest`.
4. Validate the combined root Compose model.
5. Build and recreate only the `chorequest` service through the root project.
6. Verify container health, logs, and the affected user flow.

## Before Deploying

Record the currently deployed commit and confirm that the production checkout has no unexpected local changes:

```bash
cd /docker/docker-compose/apps/chorequest/ChoreQuest
git status --short
git rev-parse HEAD
```

Production data is the Docker mount whose container destination is `/app/data`. Its host location is controlled by the production app Compose file and is not the development repo's ignored `./data/` directory. Resolve the live mount before backing it up:

```bash
docker inspect chorequest \
  --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

Back up the host source mapped to `/app/data` before deploying database or migration changes. Keep the normal manual backup step even though ChoreQuest also creates migration backups automatically.

## Pull and Rebuild

Update the production source checkout:

```bash
cd /docker/docker-compose/apps/chorequest/ChoreQuest
git fetch origin
git pull --ff-only origin main
```

Then use the root Compose project. Do not pass the app-level Compose file directly, and do not add an app-level `--env-file`; the root `include` already supplies it.

```bash
cd /docker/docker-compose
docker compose -f docker-compose.yaml config --quiet
docker compose -f docker-compose.yaml up -d --build chorequest
```

Targeting `chorequest` rebuilds and recreates that service without taking the entire Compose project down.

## Verify

```bash
cd /docker/docker-compose
docker compose -f docker-compose.yaml ps chorequest
docker compose -f docker-compose.yaml logs --tail=100 chorequest
curl -fsS http://127.0.0.1:8122/api/health
```

After a frontend deployment, open ChoreQuest on installed mobile clients and accept the `Update available — tap to refresh` prompt so the new service worker and assets take control.

## Startup Migrations

ChoreQuest records startup database migrations in a `schema_migrations` table inside the SQLite database. When the container starts, the app checks that table and applies pending migrations before FastAPI begins serving requests.

If a pending migration changes the database, the app first creates a SQLite backup under `/app/data/backups/`. On the host, this appears under the source of the production mount mapped to `/app/data`.

Migration rules:

- If backup creation fails, startup fails before applying the migration.
- If a migration fails, startup fails and the migration is not marked as applied.
- Migrations are recorded only after they complete successfully.
- Re-running the container skips migrations already listed in `schema_migrations`.

Automatic migration backups are a safety net, not a replacement for an intentional pre-deploy backup.

## Rollback

If a release fails:

1. Capture the failing logs before changing anything.
2. Return the production checkout to the previously recorded commit.
3. From `/docker/docker-compose`, run `docker compose -f docker-compose.yaml up -d --build chorequest`.
4. Restore the data backup only if the failed release changed data in a way the old code cannot read.
5. Verify the health endpoint and affected user flows.

## Reminders

- Production source lives at `/docker/docker-compose/apps/chorequest/ChoreQuest`.
- Production Compose commands run from `/docker/docker-compose` against `docker-compose.yaml`.
- Production app configuration stays beside the included app Compose file, outside the Git checkout.
- Local development data stays in this repo's ignored `./data/` directory.
- Never use local development data as a production backup source.
- `8122` is the production service port; `8123` is for local backend development.
