# ProxPilot Configuration Guide

This document explains every configuration option used by ProxPilot.

------------------------------------------------------------------------

# Configuration file

Copy the example file:

``` bash
cp .env.example .env
```

Edit `.env` before starting the containers.

------------------------------------------------------------------------

# Proxmox API

## PVE_ENDPOINTS

Comma-separated list of API endpoints.

Example:

``` dotenv
PVE_ENDPOINTS=https://pve1.example.com:8006,https://pve2.example.com:8006
```

Every endpoint must include:

-   https://
-   hostname or IP
-   port 8006

------------------------------------------------------------------------

## PVE_TOKEN_ID

Example:

``` dotenv
PVE_TOKEN_ID=dashboard@pve!dashboard
```

Must match the token created in Proxmox.

------------------------------------------------------------------------

## PVE_TOKEN_SECRET

Paste the secret generated when creating the API token.

Never commit this value.

------------------------------------------------------------------------

## PVE_VERIFY_SSL

``` dotenv
PVE_VERIFY_SSL=true
```

Recommended when using trusted certificates.

For isolated homelabs:

``` dotenv
PVE_VERIFY_SSL=false
```

------------------------------------------------------------------------

# SSH

## PVE_SSH_USER

Normally:

``` dotenv
PVE_SSH_USER=root
```

## PVE_SSH_KEY

``` dotenv
PVE_SSH_KEY=/app/ssh/id_ed25519
```

The key must exist inside:

``` text
./ssh/
```

## PVE_SSH_PORT

Default:

``` dotenv
PVE_SSH_PORT=22
```

------------------------------------------------------------------------

## PVE_NODE_HOSTS

Maps Proxmox node names to SSH/API addresses.

Example:

``` dotenv
PVE_NODE_HOSTS=pve=192.168.1.10,pve2=192.168.1.11,pve3=192.168.1.12
```

The names on the left **must exactly match** the node names reported by
Proxmox.

This mapping is also used for the integrated browser console.

------------------------------------------------------------------------

# General

## REFRESH_INTERVAL

Frontend refresh interval in seconds.

Example:

``` dotenv
REFRESH_INTERVAL=10
```

------------------------------------------------------------------------

# Authentication

## PROXPILOT_AUTH_ENABLED

Enable or disable authentication.

``` dotenv
PROXPILOT_AUTH_ENABLED=true
```

------------------------------------------------------------------------

## PROXPILOT_AUTH_USERNAME

Initial administrator.

Only used when the SQLite database does not already contain this user.

------------------------------------------------------------------------

## PROXPILOT_AUTH_PASSWORD

Initial administrator password.

Only used during initial provisioning.

After the first login the user is stored in SQLite and managed through
the web interface.

------------------------------------------------------------------------

## PROXPILOT_SESSION_SECRET

Generate a random secret.

Example:

``` bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Store the generated value:

``` dotenv
PROXPILOT_SESSION_SECRET=<generated-secret>
```

------------------------------------------------------------------------

## PROXPILOT_COOKIE_SECURE

When using HTTPS:

``` dotenv
PROXPILOT_COOKIE_SECURE=true
```

For local HTTP development only:

``` dotenv
PROXPILOT_COOKIE_SECURE=false
```

With `true`, browsers refuse to send the session cookie over plain HTTP.

The integrated browser console also requires a secure browser context
(HTTPS).

------------------------------------------------------------------------

## PROXPILOT_SESSION_MAX_AGE

Session lifetime in seconds.

Example:

``` dotenv
PROXPILOT_SESSION_MAX_AGE=43200
```

------------------------------------------------------------------------

# LDAP

LDAP configuration is **not** stored in `.env`.

It is configured entirely through the web interface.

Only local authentication bootstrap settings remain in `.env`.

------------------------------------------------------------------------

# SQLite database

During the first startup ProxPilot automatically creates:

``` text
./data/proxpilot.db
```

Do not create this file manually.

Do not commit it to Git.

------------------------------------------------------------------------

# SSH directory

Create:

``` bash
mkdir ssh
chmod 700 ssh
```

Generate a key:

``` bash
ssh-keygen -t ed25519 -f ssh/id_ed25519
```

Copy the public key to every Proxmox node.

------------------------------------------------------------------------

# Reverse proxy

When exposing ProxPilot publicly:

-   Use HTTPS
-   Enable `PROXPILOT_COOKIE_SECURE=true`
-   Place Caddy or Nginx in front of ProxPilot

------------------------------------------------------------------------

# Example configuration

``` dotenv
PVE_ENDPOINTS=https://pve1.example.com:8006,https://pve2.example.com:8006
PVE_TOKEN_ID=dashboard@pve!dashboard
PVE_TOKEN_SECRET=replace-me
PVE_VERIFY_SSL=false

PVE_SSH_USER=root
PVE_SSH_KEY=/app/ssh/id_ed25519
PVE_SSH_PORT=22

PVE_NODE_HOSTS=pve1=192.168.1.11,pve2=192.168.1.12

REFRESH_INTERVAL=10

PROXPILOT_AUTH_ENABLED=true
PROXPILOT_AUTH_USERNAME=admin
PROXPILOT_AUTH_PASSWORD=replace-me
PROXPILOT_SESSION_SECRET=replace-me
PROXPILOT_COOKIE_SECURE=true
PROXPILOT_SESSION_MAX_AGE=43200
```

------------------------------------------------------------------------

# Related documentation

-   INSTALLATION.md
-   API-PERMISSIONS.md
-   AUTHENTICATION.md
-   HTTPS_AND_REVERSE_PROXY.md
-   TROUBLESHOOTING.md
