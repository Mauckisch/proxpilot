# ProxPilot Troubleshooting Guide

This document collects common problems and their solutions.

# Docker

## Containers do not start

Check:

``` bash
docker compose ps -a
docker compose logs --tail=200
docker compose config
```

If required:

``` bash
docker compose down
docker compose up -d --build
```

------------------------------------------------------------------------

# Proxmox API

## Authentication failed

Verify:

-   PVE_TOKEN_ID
-   PVE_TOKEN_SECRET
-   API user
-   API token
-   Assigned ACLs

Useful commands:

``` bash
grep '^PVE_TOKEN_ID=' .env
pveum user token list dashboard@pve
```

------------------------------------------------------------------------

## Permission check failed

Typical error:

``` text
Permission check failed (/vms/100, VM.PowerMgmt)
```

Verify ACL assignments and effective permissions:

``` bash
pveum user token permissions dashboard@pve dashboard --path /vms/100
```

------------------------------------------------------------------------

# SSH

## SSH commands fail

Test manually:

``` bash
ssh -i ssh/id_ed25519 root@pve hostname
```

Verify:

-   key permissions
-   node mapping
-   firewall
-   SSH service

------------------------------------------------------------------------

# LDAP

## Bind failed

Check:

-   Bind DN
-   Bind password

## User not found

Check:

-   Base DN
-   Search filter
-   Username attribute

------------------------------------------------------------------------

# Browser Console

## WebSocket 403

Check:

-   authenticated session
-   Secure cookies
-   HTTPS
-   reverse proxy WebSocket support

## Black screen

Check:

-   PVE_NODE_HOSTS
-   node name mapping
-   TCP 8006 access
-   Proxmox console availability

------------------------------------------------------------------------

# HTTPS

## Login fails over HTTP

Expected when:

``` dotenv
PROXPILOT_COOKIE_SECURE=true
```

Either use HTTPS or disable Secure cookies only for development.

------------------------------------------------------------------------

# SQLite

Database:

``` text
./data/proxpilot.db
```

If deleted, ProxPilot creates a new database during startup.

------------------------------------------------------------------------

# Build Problems

Frontend:

``` bash
docker compose exec frontend npm run build
```

Backend:

``` bash
python3 -m compileall backend/app
```

------------------------------------------------------------------------

# Git

Verify ignored files:

``` bash
git check-ignore -v .env data/proxpilot.db ssh/id_ed25519
```

Repository state:

``` bash
git status
git diff
```

------------------------------------------------------------------------

# Log Collection

Backend:

``` bash
docker compose logs --tail=200 backend
```

Frontend:

``` bash
docker compose logs --tail=200 frontend
```

All services:

``` bash
docker compose logs --tail=200
```

------------------------------------------------------------------------

# Before Reporting a Bug

Include:

-   ProxPilot version
-   Proxmox VE version
-   Docker version
-   Browser
-   Relevant logs
-   Reproduction steps

Do not include:

-   API token secrets
-   Passwords
-   SSH private keys
-   SQLite database

------------------------------------------------------------------------

# Related Documentation

-   INSTALLATION.md
-   CONFIGURATION.md
-   API-PERMISSIONS.md
-   AUTHENTICATION.md
-   HTTPS_AND_REVERSE_PROXY.md
