# ProxPilot Development Guide

This document describes the development and release workflow for ProxPilot 1.7.0.

---

# Repository Layout

```text
backend/
frontend/
docs/
.github/
docker-compose.yml
docker-compose.dev.yml
.env
.env.example
```

The production Compose file:

```text
docker-compose.yml
```

is committed to Git.

The development override:

```text
docker-compose.dev.yml
```

is intended only for the local development environment and is ignored by Git.

The local `.env` file is also ignored by Git.

---

# Production and Development Compose Files

Production deployments use:

```bash
docker compose \
  -f docker-compose.yml \
  up -d
```

Local development uses both files:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d
```

The development file overrides the production configuration with:

- local builds
- source bind mounts
- frontend development server
- backend Uvicorn reload mode
- Watchtower disabled for development containers

Never publish `docker-compose.dev.yml` as part of the production deployment instructions.

---

# Local Development

Start the development environment:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d
```

Rebuild the development containers:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

Check status:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  ps
```

Follow backend logs:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  logs -f backend
```

Follow frontend logs:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  logs -f frontend
```

---

# Frontend

The development environment starts the Vite development server automatically.

Run a production frontend build inside the development container:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T frontend npm run build
```

The frontend version is stored in:

```text
frontend/package.json
frontend/package-lock.json
```

For release 1.7.0:

```bash
cd frontend

npm version 1.7.0 \
  --no-git-tag-version

cd ..
```

Verify the version without printing large files:

```bash
grep -n '"version"' frontend/package.json | head -1
head -12 frontend/package-lock.json | grep '"version"'
```

Expected:

```text
"version": "1.7.0"
```

---

# Backend

Verify Python syntax from the repository root:

```bash
python3 -m compileall backend/app
```

For import checks that require installed container dependencies such as Paramiko,
run Python inside the backend container:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T backend python - <<'PY'
from app.tasks import ManagedTask, TaskManager
from app.update_cache import NodeUpdateStatus, UpdateCache

print("Imports: OK")
PY
```

The backend health endpoint is:

```text
/api/health
```

Check container health:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  ps
```

---

# Configuration Model

Since ProxPilot 1.7.0, Proxmox environments are managed as persistent
Infrastructures.

Proxmox API endpoints, API tokens, node mappings and SSH settings are no longer
configured through the legacy global `PVE_*` environment variables.

Infrastructure configuration is managed through:

```text
Settings
→ Infrastructure
```

The local `.env` contains global ProxPilot settings only.

Typical values include:

```dotenv
TZ=Europe/Berlin
REFRESH_INTERVAL=10

PROXPILOT_AUTH_ENABLED=true
PROXPILOT_AUTH_USERNAME=admin
PROXPILOT_AUTH_PASSWORD=replace-with-a-secure-password

PROXPILOT_SESSION_SECRET=replace-with-a-long-random-secret
PROXPILOT_COOKIE_SECURE=false
PROXPILOT_SESSION_MAX_AGE=43200
```

Do not commit `.env`.

---

# Persistent Development Data

Persistent application data is stored in:

```text
data/
```

The SQLite database is normally:

```text
data/proxpilot.db
```

Infrastructure configuration, users and other persistent application state are
stored there.

Do not delete the database casually during development because this removes
persistent local application configuration.

Back it up before destructive database changes:

```bash
cp data/proxpilot.db \
  data/proxpilot.db.backup
```

---

# Git Workflow

Check the repository state:

```bash
git status --short
```

Review changed files:

```bash
git diff --stat
```

Review a specific file:

```bash
git diff -- path/to/file
```

Check for whitespace errors:

```bash
git diff --check
```

Stage changes:

```bash
git add .
```

Before committing, verify that development-only and secret files are not staged:

```bash
git status --short
```

Commit:

```bash
git commit -m "Describe your changes"
```

Push:

```bash
git push
```

---

# Release Workflow

For a normal release, use the following order:

1. Finish implementation.
2. Update the frontend package version.
3. Update `CHANGELOG.md`.
4. Update affected documentation.
5. Run backend checks.
6. Run frontend build.
7. Validate production Compose.
8. Validate development Compose locally.
9. Run `git diff --check`.
10. Review `git status --short`.
11. Commit the release.
12. Push the commit.
13. Create the Git tag.
14. Push the Git tag.

---

# Release Version

For release 1.7.0:

```bash
cd frontend

npm version 1.7.0 \
  --no-git-tag-version

cd ..
```

Verify:

```bash
grep -n '"version"' frontend/package.json | head -1

head -12 frontend/package-lock.json \
  | grep '"version"'
```

---

# Release Verification

## Backend

```bash
python3 -m compileall backend/app
```

## Frontend

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T frontend npm run build
```

## Production Compose

```bash
docker compose \
  -f docker-compose.yml \
  config >/dev/null &&
echo "Production Compose: OK"
```

## Development Compose

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  config >/dev/null &&
echo "Development Compose: OK"
```

## Git whitespace check

```bash
git diff --check
```

## Repository state

```bash
git status --short
```

---

# Release Tag

After the release commit has been pushed:

```bash
git tag v1.7.0
```

Push the tag:

```bash
git push origin v1.7.0
```

Verify:

```bash
git tag --list 'v1.7.0'
```

Do not create the tag before the final release commit is ready.

---

# GitHub Actions

The repository automatically builds the ProxPilot container images through
GitHub Actions.

Images include:

- Backend container
- Frontend container

Supported architectures:

```text
linux/amd64
linux/arm64
```

Images are published to GitHub Container Registry.

---

# Docker Images

Backend:

```text
ghcr.io/mauckisch/proxpilot-backend
```

Frontend:

```text
ghcr.io/mauckisch/proxpilot-frontend
```

Production deployments use the published images through `docker-compose.yml`.

The local development environment builds from the checked-out source through
`docker-compose.dev.yml`.

---

# Ignored Files

Never commit local secrets or runtime data.

Important ignored paths include:

```text
.env
docker-compose.dev.yml
data/
ssh/
__pycache__/
dist/
node_modules/
```

Verify:

```bash
git check-ignore -v \
  .env \
  docker-compose.dev.yml \
  data/proxpilot.db \
  ssh/id_ed25519
```

The expected result is that all of these local paths are ignored.

The tracked deployment files should include:

```text
docker-compose.yml
.env.example
```

Verify:

```bash
git ls-files \
  docker-compose.yml \
  docker-compose.dev.yml \
  .env \
  .env.example
```

A normal result should contain:

```text
docker-compose.yml
.env.example
```

and should not contain:

```text
docker-compose.dev.yml
.env
```

---

# Cleaning

Remove Python bytecode caches:

```bash
find . \
  -type d \
  -name __pycache__ \
  -prune \
  -exec rm -rf {} +
```

Remove the frontend production build:

```bash
rm -rf frontend/dist
```

Unused Docker images can be cleaned with:

```bash
docker image prune
```

Unused Docker build cache can be cleaned with:

```bash
docker builder prune
```

Review the proposed Docker cleanup before confirming destructive operations.

---

# Documentation

Documentation must be updated whenever:

- configuration changes
- authentication changes
- infrastructure handling changes
- API permissions change
- new features are added
- release processes change
- Docker deployment changes

Keep these files synchronized:

```text
README.md
CHANGELOG.md
docs/INSTALLATION.md
docs/CONFIGURATION.md
docs/AUTHENTICATION.md
docs/API-PERMISSIONS.md
docs/HTTPS_AND_REVERSE_PROXY.md
docs/TROUBLESHOOTING.md
docs/DEVELOPMENT.md
```

Before releasing, search for obsolete version numbers and legacy configuration
references.

Example:

```bash
grep -RIn \
  --include='*.md' \
  -E '1\\.5|1\\.6|PVE_ENDPOINTS|PVE_TOKEN_ID|PVE_NODE_HOSTS' \
  README.md docs
```

Review every result rather than deleting all matches automatically. Some
documentation may intentionally mention legacy configuration for migration or
troubleshooting purposes.

---

# Final Pre-Release Check

A compact final verification can be performed with:

```bash
cd /home/dennigma/proxpilot

python3 -m compileall backend/app

docker compose \
  -f docker-compose.yml \
  config >/dev/null &&
echo "Production Compose: OK"

docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  config >/dev/null &&
echo "Development Compose: OK"

git diff --check

git status --short
```

Run the frontend build separately:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T frontend npm run build
```

All checks should succeed before the release commit and tag are created.

---

# Related Documentation

- `README.md`
- `INSTALLATION.md`
- `CONFIGURATION.md`
- `AUTHENTICATION.md`
- `API-PERMISSIONS.md`
- `HTTPS_AND_REVERSE_PROXY.md`
- `TROUBLESHOOTING.md`

---

End of document.
