# ProxPilot

> Modern web interface for monitoring and managing Proxmox VE clusters.

## Overview

ProxPilot is a lightweight web application built with:

-   **Frontend:** React + TypeScript + Mantine
-   **Backend:** FastAPI
-   **Deployment:** Docker Compose

It focuses on day-to-day Proxmox administration while keeping the
interface clean and responsive.

## Features

### Dashboard

-   Cluster overview
-   Node health
-   VM and LXC overview
-   Storage utilization
-   Live task activity

### Node Management

-   Package updates
-   Autoremove / autoclean
-   Maintenance mode
-   Reboot / shutdown
-   Hardware information
-   ZFS information
-   Network information
-   Temperature information

### Guests

-   Start / Stop / Shutdown
-   Reboot
-   Suspend / Resume
-   Migration
-   Snapshots
-   Backups
-   Guest configuration
-   Integrated noVNC console

### Authentication

-   Local users
-   LDAP authentication
-   Session cookies
-   Role based administration
-   User management through the web interface

## Requirements

-   Proxmox VE 8 or newer
-   Docker Engine
-   Docker Compose

## Installation

``` bash
git clone https://github.com/Mauckisch/proxpilot.git
cd proxpilot
cp .env.example .env
docker compose up -d --build
```

Fill in the values in `.env` before starting the application.

## Important Notes

### SQLite database

The application automatically creates:

    ./data/proxpilot.db

during the first startup.

Do **not** commit this file.

### SSH keys

Place the SSH key inside:

    ./ssh/

The directory is ignored by Git.

### Guest Console

The integrated noVNC console requires a **secure browser context**.

This means:

-   HTTPS must be used.
-   A reverse proxy (for example Caddy or Nginx) should terminate TLS.
-   Plain HTTP cannot be used for the browser console.

Administrative actions continue to work without HTTPS, but the browser
console does not.

### Cookies

When HTTPS is used:

    PROXPILOT_COOKIE_SECURE=true

For local HTTP development only:

    PROXPILOT_COOKIE_SECURE=false

## Security

Never commit:

-   `.env`
-   `./data`
-   `./ssh`

Use a dedicated Proxmox API user with the minimum required permissions.

## Updating

``` bash
git pull
docker compose up -d --build
```

## License

MIT
