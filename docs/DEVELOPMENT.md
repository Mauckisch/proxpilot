# ProxPilot Development Guide

This document describes the development workflow for ProxPilot.

# Repository Layout

``` text
backend/
frontend/
docs/
.github/
docker-compose.yml
docker-compose.dev.yml
```

The production compose file is committed.

`docker-compose.dev.yml` is intended for local development and should
not be used in production deployments.

------------------------------------------------------------------------

# Local Development

Start the development environment:

``` bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d
```

Rebuild after dependency changes:

``` bash
docker compose up -d --build
```

------------------------------------------------------------------------

# Frontend

Development server:

``` bash
docker compose exec frontend npm run dev
```

Production build:

``` bash
docker compose exec frontend npm run build
```

Version:

``` bash
docker compose exec frontend npm version 1.5.2 --no-git-tag-version
```

The frontend package version is displayed inside the web interface and
is also used by the backend API.

------------------------------------------------------------------------

# Backend

Syntax verification:

``` bash
python3 -m compileall backend/app
```

Health endpoint:

``` text
/api/health
```

------------------------------------------------------------------------

# Git Workflow

Check status:

``` bash
git status
```

Review changes:

``` bash
git diff
```

Stage:

``` bash
git add .
```

Commit:

``` bash
git commit -m "Describe your changes"
```

Push:

``` bash
git push
```

------------------------------------------------------------------------

# Releases

Recommended workflow:

1.  Update frontend/package.json version.
2.  Update CHANGELOG.md.
3.  Commit changes.
4.  Create a Git tag.
5.  Push commit.
6.  Push tag.

Example:

``` bash
git tag v1.5.2
git push
git push origin v1.5.2
```

------------------------------------------------------------------------

# GitHub Actions

The repository automatically builds:

-   Backend container
-   Frontend container

Supported architectures:

-   linux/amd64
-   linux/arm64

Images are published to GitHub Container Registry.

------------------------------------------------------------------------

# Docker Images

Backend:

``` text
ghcr.io/<owner>/proxpilot-backend
```

Frontend:

``` text
ghcr.io/<owner>/proxpilot-frontend
```

------------------------------------------------------------------------

# Ignored Files

Never commit:

``` text
.env
data/
ssh/
__pycache__/
dist/
node_modules/
```

Verify:

``` bash
git check-ignore -v \
.env \
data/proxpilot.db \
ssh/id_ed25519
```

------------------------------------------------------------------------

# Build Verification

Backend:

``` bash
python3 -m compileall backend/app
```

Frontend:

``` bash
docker compose exec frontend npm run build
```

Compose:

``` bash
docker compose config
```

------------------------------------------------------------------------

# Cleaning

Remove Python cache:

``` bash
find . -type d -name __pycache__ -exec rm -rf {} +
```

Remove frontend build:

``` bash
rm -rf frontend/dist
```

Docker cleanup:

``` bash
docker image prune
docker builder prune
```

------------------------------------------------------------------------

# Documentation

Update documentation whenever:

-   configuration changes
-   authentication changes
-   new features are added
-   release process changes

Keep:

-   README.md
-   CHANGELOG.md
-   docs/

synchronized.

------------------------------------------------------------------------

# Related Documentation

-   README.md
-   INSTALLATION.md
-   CONFIGURATION.md
-   AUTHENTICATION.md
-   API-PERMISSIONS.md
-   HTTPS_AND_REVERSE_PROXY.md
-   TROUBLESHOOTING.md
