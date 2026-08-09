# ProxPilot Troubleshooting Guide

This document collects common ProxPilot problems and practical troubleshooting steps.

The examples in this guide reflect the ProxPilot 1.7.0 configuration model. Proxmox VE environments are configured as **Infrastructures** in the ProxPilot web interface. Proxmox API credentials, TLS settings, node addresses and SSH settings are therefore no longer expected as global `PVE_*` variables in `.env`.

---

# Docker

## Containers do not start

Check the container state:

```bash
docker compose ps -a
```

Check recent logs:

```bash
docker compose logs --tail=200
```

Validate the Compose configuration:

```bash
docker compose config
```

If required, recreate the containers:

```bash
docker compose down
docker compose up -d
```

For a source installation that must be rebuilt:

```bash
docker compose down
docker compose up -d --build
```

Afterwards verify:

```bash
docker compose ps
```

The backend should eventually report a healthy state.

---

## Backend is unhealthy

Check the backend logs:

```bash
docker compose logs --tail=200 backend
```

Also verify that the persistent data directory is writable and that the SQLite database is accessible.

```bash
ls -ld data
ls -l data/proxpilot.db
```

Do not delete the database as a troubleshooting step unless you intentionally want to reset persistent ProxPilot configuration.

---

# Infrastructure Configuration

ProxPilot 1.7.0 supports multiple independent Proxmox VE environments.

Each configured Infrastructure contains its own:

- Proxmox API endpoint and credentials
- TLS verification setting
- detected cluster or standalone-host information
- node addresses
- SSH user
- SSH port
- SSH key path

If only one Infrastructure is affected, troubleshoot that Infrastructure first instead of assuming a global ProxPilot problem.

---

## Infrastructure discovery fails

When adding an Infrastructure, ProxPilot first connects to the supplied API endpoint and performs **Test & Discover**.

If discovery fails, verify:

- the API endpoint is correct
- TCP port `8006` is reachable
- the API token ID is correct
- the API token secret is correct
- the API user and token still exist in Proxmox VE
- the token has the required permissions
- the TLS verification setting matches the certificate configuration

Example endpoint:

```text
https://192.168.1.10:8006
```

From the Docker host, basic connectivity can be checked with:

```bash
curl -k https://192.168.1.10:8006/api2/json/version
```

The `-k` option disables certificate validation for this test only. It does not change the ProxPilot configuration.

If certificate verification is enabled in ProxPilot, also test without `-k`:

```bash
curl https://192.168.1.10:8006/api2/json/version
```

A certificate error here indicates that the certificate is not trusted by the Docker host. The backend container may require the corresponding CA certificate as well.

---

## Cluster is not detected correctly

ProxPilot determines during discovery whether the supplied endpoint belongs to a Proxmox VE cluster or a standalone host.

Verify the cluster directly on the Proxmox node:

```bash
pvecm status
```

For a clustered environment, also verify the node list:

```bash
pvecm nodes
```

If the cluster itself is unhealthy or has lost quorum, resolve the Proxmox cluster problem before troubleshooting ProxPilot discovery.

---

## Wrong node address detected

After discovery, ProxPilot displays every detected node and a **Reachable host / IP** field.

This value must be reachable from the ProxPilot backend and is used for communication with that node.

The detected value may need to be changed when:

- Proxmox reports an internal hostname that Docker cannot resolve
- management traffic uses another network
- DNS differs between Proxmox and the Docker host
- the node is reachable through a dedicated management IP

Use an address that is reachable from the ProxPilot Docker host.

Example:

```text
pve1 -> 192.168.1.10
pve2 -> 192.168.1.11
pve3 -> 192.168.1.12
```

Test connectivity from the Docker host:

```bash
ping 192.168.1.10
```

Test the API port:

```bash
nc -vz 192.168.1.10 8006
```

Test SSH:

```bash
nc -vz 192.168.1.10 22
```

---

## One Infrastructure works but another does not

Because credentials and connection settings are stored per Infrastructure, one environment can work while another fails.

Compare the affected Infrastructure with a working one and verify:

- API endpoint
- API token
- token permissions
- TLS verification
- node addresses
- SSH user
- SSH port
- SSH key path
- network/firewall reachability

Do not troubleshoot this by changing unrelated global `.env` settings.

Check backend logs while opening or refreshing the affected Infrastructure:

```bash
docker compose logs -f backend
```

---

# Proxmox API

## Authentication failed

Open:

```text
Settings
→ Infrastructure
```

Check the affected Infrastructure.

Verify:

- API endpoint
- Token ID
- Token secret
- API user
- API token
- assigned ACLs

On a Proxmox node, verify that the token exists:

```bash
pveum user token list dashboard@pve
```

If necessary, create a new token secret and update the Infrastructure in ProxPilot.

Never publish the token secret in logs, screenshots or Git commits.

---

## Permission check failed

Typical error:

```text
Permission check failed (/vms/100, VM.PowerMgmt)
```

This normally means that API authentication succeeded but the effective Proxmox permissions are insufficient.

Verify effective token permissions:

```bash
pveum user token permissions dashboard@pve dashboard --path /vms/100
```

Also inspect the configured ACLs:

```bash
pveum acl list | grep dashboard
```

Compare the result with:

```text
docs/API-PERMISSIONS.md
```

Remember that Proxmox API token permissions can depend on both the API user ACLs and token ACLs.

---

## API connection fails for only one node

If the Infrastructure itself loads but operations against one particular node fail, verify that node's **Reachable host / IP** value.

Check:

```bash
nc -vz NODE-IP 8006
```

Also verify that the node is online and healthy in Proxmox:

```bash
pvecm nodes
```

For a standalone host, verify the API locally:

```bash
curl -k https://127.0.0.1:8006/api2/json/version
```

---

# SSH

## SSH commands fail

Host-level functions use the SSH configuration stored for the affected Infrastructure.

Verify in:

```text
Settings
→ Infrastructure
```

Check:

- SSH user
- SSH port
- SSH key path
- Reachable host / IP for the node
- firewall rules
- SSH service on the Proxmox node

Test manually from the ProxPilot host:

```bash
ssh -i ssh/id_ed25519 root@NODE-IP hostname
```

For a non-default port:

```bash
ssh -p 2222 -i ssh/id_ed25519 root@NODE-IP hostname
```

The returned hostname should match the intended Proxmox node.

---

## SSH key is rejected

Check the private key permissions:

```bash
ls -l ssh/id_ed25519
```

The private key should normally be readable only by its owner:

```bash
chmod 600 ssh/id_ed25519
```

Verify that the corresponding public key is installed on the Proxmox node:

```bash
cat /root/.ssh/authorized_keys
```

Test with verbose SSH output if required:

```bash
ssh -vvv -i ssh/id_ed25519 root@NODE-IP hostname
```

Do not publish verbose SSH logs without checking them for sensitive information first.

---

## SSH works on the host but not in ProxPilot

The SSH key path configured in the Infrastructure is the path visible **inside the backend container**, not necessarily the path used on the Docker host.

Check the Compose mount and inspect the backend container:

```bash
docker compose exec backend ls -l /app/ssh
```

If the configured key is:

```text
/app/ssh/id_ed25519
```

verify it inside the container:

```bash
docker compose exec backend test -r /app/ssh/id_ed25519 && echo "SSH key readable"
```

Also check backend logs:

```bash
docker compose logs --tail=200 backend
```

---

# Node Information

## Hardware, temperatures, disks or ZFS information is missing

These features depend on SSH access to the Proxmox node.

First verify SSH connectivity.

Then check whether the required command exists on the node.

Examples:

```bash
lscpu
lsblk
zpool status
smartctl --version
sensors
```

Not every node provides every type of hardware information. For example, ZFS information is only available when ZFS is actually present.

---

## Temperature information is missing

Temperature monitoring requires `lm-sensors` on the Proxmox node.

Install it:

```bash
apt update
apt install -y lm-sensors
sensors-detect --auto
```

Verify:

```bash
sensors
```

If `sensors` itself does not report usable hardware sensors, ProxPilot cannot display them.

---

## UPS information is missing

UPS monitoring requires a working Network UPS Tools netclient configuration on the Proxmox node.

Check:

```bash
systemctl status nut-monitor --no-pager
```

Verify the configured monitor target:

```bash
grep -E '^[[:space:]]*MONITOR[[:space:]]' /etc/nut/upsmon.conf
```

Test the configured UPS directly with `upsc`.

Example:

```bash
upsc UPSNAME@UPSHOST
```

The UPS tab is only useful when the node itself can retrieve UPS information successfully.

---

# Network Overview

## Interface IP addresses are missing

ProxPilot obtains interface address information from the Proxmox host.

Verify directly on the affected node:

```bash
ip -j address show
```

For a human-readable view:

```bash
ip address show
```

Confirm that the expected bridge or interface actually has an IPv4 or IPv6 address.

Examples commonly include:

```text
vmbr0
vmbr1
```

If the addresses are visible on the host but missing in ProxPilot, check the backend logs and browser developer console for errors.

Backend:

```bash
docker compose logs --tail=200 backend
```

---

# LDAP

## Bind failed

Check the LDAP configuration in ProxPilot.

Verify:

- LDAP server
- Bind DN
- Bind password
- TLS settings
- network connectivity from the backend

If LDAP is provided by Active Directory, verify that the bind account is still active and its password has not expired or changed.

---

## User not found

Check:

- Base DN
- search filter
- username attribute
- user location in the directory
- LDAP group or access restrictions if configured

Use ProxPilot's LDAP test functionality before relying on LDAP for production login.

Keep at least one working local administrator account as an emergency login.

---

# Browser Console

## WebSocket 403

Check:

- the user has an authenticated ProxPilot session
- HTTPS is being used
- Secure cookies are configured correctly
- the reverse proxy supports WebSockets
- the affected Infrastructure and node are reachable
- the API token has the required console permission

Review:

```text
docs/HTTPS_AND_REVERSE_PROXY.md
docs/API-PERMISSIONS.md
```

Check backend logs while opening the console:

```bash
docker compose logs -f backend
```

---

## Console shows a black screen or does not connect

Verify the affected node's **Reachable host / IP** in:

```text
Settings
→ Infrastructure
```

Check TCP port `8006` from the ProxPilot host:

```bash
nc -vz NODE-IP 8006
```

Also verify that a console can be opened for the same guest through the native Proxmox VE interface.

If the native Proxmox console also fails, resolve that problem first.

---

# HTTPS

## Login fails over HTTP

This is expected when:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

Secure cookies are not sent over plain HTTP.

For production, use HTTPS and keep:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For an HTTP-only development environment:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

Restart the containers after changing `.env`:

```bash
docker compose up -d
```

---

## Application works but browser console does not

The integrated browser console relies on WebSockets.

Verify that the reverse proxy:

- forwards WebSocket upgrade requests
- uses HTTPS correctly
- does not block the console path
- preserves the authenticated session

See:

```text
docs/HTTPS_AND_REVERSE_PROXY.md
```

---

# SQLite

## Database location

Persistent ProxPilot data is stored in:

```text
./data/proxpilot.db
```

This includes application configuration that must survive container recreation.

Do not delete the database during ordinary troubleshooting.

If the database is intentionally deleted, ProxPilot creates a new database during startup, but persisted application configuration is lost.

Before destructive database work, create a backup:

```bash
cp data/proxpilot.db data/proxpilot.db.backup
```

---

# Build Problems

## Frontend build fails

For a source checkout, run:

```bash
cd frontend
npm run build
```

If dependencies need to be restored:

```bash
npm ci
npm run build
```

Return to the repository root afterwards:

```bash
cd ..
```

---

## Backend compilation check fails

From the repository root:

```bash
python3 -m compileall backend/app
```

The command should complete without Python syntax errors.

---

## Docker Compose validation fails

Validate both the production Compose file and, when applicable, the development override.

Production:

```bash
docker compose -f docker-compose.yml config >/dev/null && echo "Compose OK"
```

Development:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  config >/dev/null && echo "Compose DEV OK"
```

---

# Git

## Verify ignored sensitive files

Check that local secrets and persistent data are ignored:

```bash
git check-ignore -v .env data/proxpilot.db ssh/id_ed25519
```

Never commit:

```text
.env
data/
ssh/
```

---

## Check repository state

Use:

```bash
git status --short
```

Inspect changes:

```bash
git diff --stat
git diff
```

Check for whitespace errors:

```bash
git diff --check
```

---

# Log Collection

## Backend

```bash
docker compose logs --tail=200 backend
```

## Frontend

```bash
docker compose logs --tail=200 frontend
```

## All services

```bash
docker compose logs --tail=200
```

## Follow backend logs live

```bash
docker compose logs -f backend
```

When troubleshooting a specific Infrastructure, reproduce the problem while following the backend logs. This makes it easier to distinguish Infrastructure-specific connection failures from application-wide problems.

Before sharing logs publicly, remove:

- API token secrets
- passwords
- LDAP credentials
- session data
- private IP addresses if they should remain confidential
- SSH key material

---

# Before Reporting a Bug

First determine whether the problem affects:

- all Infrastructures
- one Infrastructure
- one node
- one guest
- one browser or user account

Include:

- ProxPilot version
- Proxmox VE version
- standalone or clustered Proxmox environment
- Docker version
- browser
- affected feature
- relevant logs
- exact reproduction steps

For Infrastructure-related problems, also state whether:

- **Test & Discover** succeeds
- other Infrastructures work
- API access works
- SSH access works
- only one node is affected

Do not include:

- API token secrets
- passwords
- LDAP bind passwords
- SSH private keys
- session secrets
- SQLite databases

---

# Related Documentation

- `INSTALLATION.md`
- `CONFIGURATION.md`
- `API-PERMISSIONS.md`
- `AUTHENTICATION.md`
- `HTTPS_AND_REVERSE_PROXY.md`
- `DEVELOPMENT.md`

---

End of document.
