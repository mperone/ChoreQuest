# Deployment Notes

This is the intended future flow for moving local development changes to the Docker server. Do not run these steps from the dev workspace unless you are intentionally preparing a release.

## Flow

1. Develop and verify changes locally in this dev clone.
2. Commit on a feature branch and push to the fork at `https://github.com/mperone/ChoreQuest.git`.
3. Review or merge the branch as appropriate.
4. On the Docker server, use the separate production checkout at `/docker/containers/chorequest/ChoreQuest`.
5. Pull the selected commit or branch into the production checkout.
6. Rebuild and restart the Docker service.
7. Verify health and the main user flows on production.

## Before Pulling on the Server

- Confirm you are in `/docker/containers/chorequest/ChoreQuest`, not the local dev clone.
- Confirm the target commit or branch.
- Back up `/docker/containers/chorequest/data` before changing code.
- Record the currently deployed commit with `git rev-parse HEAD`.
- Check Docker logs and current health so you know the pre-deploy state.

Example backup shape:

```bash
cd /docker/containers/chorequest
tar -czf backups/chorequest-data-$(date +%Y%m%d-%H%M%S).tar.gz data
```

## Rebuild

Typical production update from the production checkout:

```bash
cd /docker/containers/chorequest/ChoreQuest
git fetch origin
git pull --ff-only
docker compose up -d --build
```

Then verify:

```bash
docker compose ps
docker compose logs --tail=100 chorequest
curl http://localhost:8122/api/health
```

## Rollback

If the release fails:

1. Capture failing logs before changing anything.
2. Stop the service if needed.
3. Check out the previously recorded commit.
4. Rebuild and restart with `docker compose up -d --build`.
5. Restore the data backup only if the failed release changed data in a way the old code cannot read.
6. Verify `http://localhost:8122/api/health` and the affected user flows.

## Reminders

- Production data lives in `/docker/containers/chorequest/data`.
- Local dev data lives in this repo's `./data`.
- Never use the local dev database as a production backup source.
- Never copy production `.env` values into the dev repo.
- `8122` is the production service port; `8123` is for local backend development.
