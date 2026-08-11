# ProxPilot Troubleshooting Guide

This document collects common ProxPilot problems and practical troubleshooting steps.

The examples in this guide reflect the ProxPilot 2.0.0 configuration model. Proxmox VE environments are configured as **Infrastructures** in the ProxPilot web interface. Proxmox API credentials, TLS settings, node addresses and SSH settings are therefore no longer expected as global `PVE_*` variables in `.env`.

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

Starting with ProxPilot 1.7.2, also check the persistent SSH directory when the backend fails during startup:

```bash
ls -ld ssh
ls -la ssh
```

The normal Compose mount must be writable:

```yaml
- ./ssh:/app/ssh
```

A backend startup error can occur if only `id_ed25519.pub` exists while the matching private key is missing. In that case restore the original private key from backup instead of generating an unrelated replacement key.

---

# Infrastructure Configuration

ProxPilot supports multiple independent Proxmox VE environments.

Each configured Infrastructure contains its own:

- Proxmox API endpoint and credentials
- TLS verification setting
- detected cluster or standalone-host information
- node addresses
- SSH user
- SSH port
- managed ProxPilot SSH identity and public-key authorization

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
- managed ProxPilot SSH identity and public-key authorization
- network/firewall reachability

Do not troubleshoot this by changing unrelated global `.env` settings.

Check backend logs while opening or refreshing the affected Infrastructure:

```bash
docker compose logs -f backend
```

---

## Infrastructure or standalone host is disconnected

Starting with ProxPilot 1.7.2, a configured standalone host is not removed from the dashboard simply because its Proxmox API endpoint is unreachable.

The expected behavior is:

- all nodes online → infrastructure indicator is green
- some cluster nodes offline → infrastructure indicator is yellow
- all cluster nodes offline → infrastructure indicator is red
- standalone host offline → infrastructure indicator is red
- the configured node remains visible with status `disconnected`

For a disconnected node, ProxPilot intentionally avoids opening host details or querying node network information that requires the unreachable host. This prevents avoidable `502` errors in the normal UI.

If an Infrastructure unexpectedly disappears completely, verify that it is still enabled and that its stored node records still exist.

If a node is shown as `disconnected`, check:

- Proxmox host power state
- network connectivity
- API port `8006`
- configured `Reachable host / IP`
- DNS resolution when a hostname is used
- firewall rules between the ProxPilot backend and the Proxmox host

A disconnected status is different from deleting or disabling the Infrastructure.

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

Host-level functions use the SSH user and port stored for the affected Infrastructure together with the ProxPilot-managed SSH identity.

Verify in:

```text
Settings
→ Infrastructure
```

Check:

- SSH user
- SSH port
- Reachable host / IP for the node
- firewall rules
- SSH service on the Proxmox node
- ProxPilot public key authorization on the target account

The private key path is managed internally and is normally:

```text
/app/ssh/id_ed25519
```

On the Docker host, the persistent file is:

```text
./ssh/id_ed25519
```

Test manually from the ProxPilot host:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

For a non-default port:

```bash
ssh -p 2222 -i ./ssh/id_ed25519 root@NODE-IP hostname
```

The returned hostname should match the intended Proxmox node.

---

## SSH key is rejected

Check the private key permissions:

```bash
ls -l ./ssh/id_ed25519
```

The private key should normally be readable only by its owner:

```bash
chmod 600 ./ssh/id_ed25519
```

The corresponding public key should exist as:

```text
./ssh/id_ed25519.pub
```

Verify that the public key shown by ProxPilot is present on the Proxmox node:

```bash
cat /root/.ssh/authorized_keys
```

For the default `root` account, the ProxPilot public key must be present in:

```text
/root/.ssh/authorized_keys
```

Test with verbose SSH output if required:

```bash
ssh -vvv -i ./ssh/id_ed25519 root@NODE-IP hostname
```

Do not publish verbose SSH logs without checking them for sensitive information first.

---

## SSH works on the Docker host but not in ProxPilot

ProxPilot uses the private key inside the backend container at:

```text
/app/ssh/id_ed25519
```

The normal Compose mount is:

```yaml
- ./ssh:/app/ssh
```

Starting with ProxPilot 1.7.2 this mount must be writable because the backend can automatically create or reconstruct SSH key material.

Inspect the backend container:

```bash
docker compose exec backend ls -la /app/ssh
```

Verify the private key is readable:

```bash
docker compose exec backend   test -r /app/ssh/id_ed25519   && echo "SSH key readable"
```

Also check backend logs:

```bash
docker compose logs --tail=100 backend
```

---

## SSH key files are missing

ProxPilot 2.0.0 manages the default Ed25519 key pair automatically.

Expected persistent files:

```text
./ssh/id_ed25519
./ssh/id_ed25519.pub
```

Behavior at backend startup:

- neither file exists → a new Ed25519 key pair is generated
- private key exists but `.pub` is missing → the public key is reconstructed
- public key exists but private key is missing → startup does not silently create a replacement private key

If only the public key exists, restore the matching private key from backup.

Do not delete a working private key merely to force regeneration. A regenerated key has a different public key and must be authorized again on every Proxmox node.

---

## Public key shown in the GUI is not accepted

When adding an Infrastructure, ProxPilot displays the **ProxPilot SSH public key** with a **Copy** button.

Copy the complete value, beginning with:

```text
ssh-ed25519
```

Append it to the target account's `authorized_keys` file. For `root`:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
echo 'ssh-ed25519 AAAA... proxpilot' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Using `>>` preserves other authorized keys.

An upgraded installation may show an older comment such as a hostname instead of `proxpilot`. The comment at the end of the public key does not affect SSH authentication.

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

# Regional Settings

## Timezone appears wrong

Regional settings are configured under:

```text
Settings
→ Regional
```

Only an Administrator can change these settings.

Verify that the configured timezone is the intended ProxPilot application timezone.

The Regional setting does not change the operating-system timezone of the Proxmox nodes.

If the displayed time still appears wrong, also verify the browser and client system time because some frontend date and time values are rendered by the browser.

---

## Regional settings return 401 or 403

A `401 Unauthorized` response means that the request does not have a valid authenticated ProxPilot session.

A `403 Forbidden` response means that the authenticated account does not have sufficient permission for the requested setting.

Regional configuration is Administrator-only.

Verify:

- the current ProxPilot session is still valid
- the account is an Administrator
- the browser is sending the current session cookie
- HTTPS and secure-cookie settings are correct when HTTPS is enabled

Backend logs can help distinguish authentication and authorization failures:

```bash
docker compose logs --tail=200 backend
```

---

# Notifications

## Test notification works but operational notifications do not

A successful Discord or email test confirms that the channel configuration itself works.

It does **not** automatically enable delivery for operational events.

For an operational event to be delivered, both conditions must be true:

1. the notification channel is globally enabled
2. the corresponding event is enabled for that channel

Check:

```text
Settings
→ Notifications
```

Verify the global state of:

```text
Discord
Email
```

Then verify the per-event routing below the channel configuration.

For example, receiving an update notification through Discord requires:

```text
Discord channel: Enabled
Updates available → Discord: Enabled
```

The same logic applies independently to Email.

---

## Channel was enabled in the interface but notifications are still disabled

In ProxPilot 2.0.0, the global Email and Discord enable/disable switches are persisted immediately.

If the visible state and actual behavior do not match, reload the Settings page and verify the switch again.

Also check the backend log for errors while toggling the channel:

```bash
docker compose logs -f backend
```

If necessary, inspect recent notification-related requests:

```bash
docker compose logs backend 2>&1 \
  | grep -Ei 'notification|discord|smtp|email' \
  | tail -100
```

---

## Discord test fails

Verify:

- a Discord webhook is configured
- the webhook has not been deleted or regenerated in Discord
- the ProxPilot backend has outbound HTTPS access
- DNS resolution works from the Docker host and backend container
- the Discord channel is configured correctly

Use **Send test** from:

```text
Settings
→ Notifications
→ Discord
```

Check the backend logs while sending the test:

```bash
docker compose logs -f backend
```

Treat the webhook URL as a secret. Do not publish it in screenshots, logs or issue reports.

---

## Discord test works but an event is not sent

If **Send test** works, the Discord webhook itself is normally functional.

Check:

- Discord is globally enabled
- Discord is enabled for the affected event
- the operation actually produced the expected event
- the operation reached a completed or failed state
- the backend remained running while the task completed

For task-related events, also inspect the task output and Activity view.

The task output can contain notification delivery information for notification-enabled operations.

---

## Email test fails

Verify the SMTP configuration under:

```text
Settings
→ Notifications
→ Email
```

Check:

- SMTP server
- SMTP port
- security mode
- SMTP username
- SMTP password
- sender address
- recipient addresses

Supported security modes are:

```text
None
STARTTLS
TLS
```

Common combinations include:

```text
587 → STARTTLS
465 → TLS
```

The correct settings depend on the SMTP provider.

Use **Send test** while following the backend logs:

```bash
docker compose logs -f backend
```

A connection failure, TLS error or SMTP authentication error should be investigated according to the mail provider's required settings.

---

## Email test works but event email is not sent

A successful test email proves that the SMTP channel can deliver mail.

It does not prove that event routing is enabled.

Verify:

```text
Email channel: Enabled
Affected event → Email: Enabled
```

Reload the Notifications settings page after changing the global Email switch and verify that it still shows **Enabled**.

Also confirm that the event itself completed after Email was enabled.

---

## SMTP password is already configured

When an SMTP password has already been stored, ProxPilot does not expose the stored secret again.

Leaving the password field empty while saving unrelated email settings preserves the existing stored password.

Do not replace the password unless the SMTP credential itself has changed.

---

## Notification settings return 401 or 403

Notification configuration is Administrator-only.

A response such as:

```text
401 Unauthorized
```

means that authentication is missing or the session is no longer valid.

A response such as:

```text
403 Forbidden
```

means that the authenticated account does not have the required permission.

Log in with an Administrator account and retry.

---

## Multi-node notification contains unexpected node order

Multi-node update checks, update installations and package cleanup use natural node ordering.

Expected ordering for names such as these is:

```text
pve
pve2
pve3
```

If a different order is displayed, verify that the current frontend and backend both belong to the same ProxPilot release and rebuild the development installation if required.

For a source checkout:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

---

# Task Scheduler

## Multi-node selection is not available for an action

This is intentional for safety.

Multiple nodes can only be selected for:

- Check updates
- Install updates
- Package cleanup

The following node actions are restricted to exactly one node:

- Reboot
- Shutdown
- Maintenance enable
- Maintenance disable

These restrictions are enforced by the backend and cannot be bypassed by crafting a direct API request.

---

## Scheduled multi-node task shows only one or an unknown target

For supported multi-node actions, the scheduler stores the configured node list and should display all selected nodes as the target.

Expected example:

```text
pve
pve2
pve3
```

or, in notification text:

```text
Target: pve, pve2, pve3
```

If the target appears as `Unknown node`, verify that the task was created or edited with ProxPilot 2.0.0 and recreate an older task if necessary.

---

## Scheduled task completes but no scheduler notification is received

Check the Notification settings first.

For scheduler completion notifications, verify the corresponding routing:

```text
Scheduled task succeeded
Scheduled task failed
```

The desired Email or Discord channel must be enabled for those events.

Also check whether the underlying operation itself generated its own notification. Multi-node update operations can produce an aggregated operation notification in addition to the Task Scheduler completion notification.

Follow the backend logs while using **Run now**:

```bash
docker compose logs -f backend
```

To focus on scheduler and notification messages:

```bash
docker compose logs backend 2>&1 \
  | grep -Ei 'scheduler|scheduled task|notification|discord|smtp|email' \
  | tail -150
```

---

## Multi-node task is marked partial

The `partial` state means that a multi-node operation completed successfully on at least one node but failed on at least one other node.

Inspect the task details and output to identify the affected nodes.

Then troubleshoot the failed nodes independently.

Typical causes include:

- one node is offline
- SSH access fails for one node
- one node has a package-management error
- one node has different repository or package state
- network connectivity differs between nodes

A partial result should not be treated as a complete cluster-wide success.

---

## Task Scheduler table is clipped on a smaller display

ProxPilot 2.0.0 provides horizontal scrolling for the Task Scheduler table.

If columns or action buttons still appear clipped:

- perform a hard browser refresh
- verify that the frontend container is running the current build
- rebuild the frontend when using a source checkout

For development:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
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

Also preserve the ProxPilot SSH identity:

```text
ssh/id_ed25519
ssh/id_ed25519.pub
```

The private key is already trusted by the configured Proxmox nodes. Losing it means a newly generated public key must be authorized again on every affected node.

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
- SMTP credentials
- Discord webhook URLs
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
- SMTP passwords
- Discord webhook URLs
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
