# ProxPilot Configuration Guide

This document describes the configuration model for **ProxPilot 1.7.2**.

ProxPilot configuration is divided into two areas:

1. **Global application settings** in `.env`
2. **Proxmox infrastructure settings** in the ProxPilot web interface

Starting with ProxPilot 1.7.0, Proxmox API endpoints, API tokens, TLS verification, node addresses and SSH settings are no longer configured with `PVE_*` variables in `.env`.

This separation allows one ProxPilot instance to manage multiple independent Proxmox clusters and standalone hosts.

---

# Environment

Create the local environment file from the supplied example:

```bash
cp .env.example .env
```

Edit it:

```bash
nano .env
```

Only `.env.example` should be committed to Git.

Never commit `.env`, because it can contain authentication and session secrets.

The `.env` file contains only global ProxPilot application settings.

---

# Global Application Settings

A typical ProxPilot 1.7.2 environment file contains:

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

---

# TZ

Controls the default timezone used by the containers.

Example:

```dotenv
TZ=Europe/Berlin
```

This is a global application/container setting and is not related to the timezone of an individual Proxmox infrastructure.

---

# REFRESH_INTERVAL

Controls the frontend refresh interval in seconds.

Example:

```dotenv
REFRESH_INTERVAL=10
```

---

# Authentication

## PROXPILOT_AUTH_ENABLED

Enables or disables ProxPilot authentication.

Example:

```dotenv
PROXPILOT_AUTH_ENABLED=true
```

For normal installations authentication should remain enabled.

---

## PROXPILOT_AUTH_USERNAME

Defines the initial local administrator username.

Example:

```dotenv
PROXPILOT_AUTH_USERNAME=admin
```

The value is used for bootstrap initialization. It is not a replacement for user management in the ProxPilot web interface.

---

## PROXPILOT_AUTH_PASSWORD

Defines the password for the initial local administrator.

Example:

```dotenv
PROXPILOT_AUTH_PASSWORD=replace-with-a-secure-password
```

Use a strong password before exposing ProxPilot to a network.

---

## PROXPILOT_SESSION_SECRET

Secret used for session signing.

Generate a strong random value:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Example:

```dotenv
PROXPILOT_SESSION_SECRET=replace-with-generated-secret
```

Do not reuse API token secrets, passwords or SSH keys as the session secret.

---

## PROXPILOT_COOKIE_SECURE

Controls whether authentication cookies use the Secure attribute.

For HTTPS:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For HTTP-only development or initial local testing:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

Browsers do not send Secure cookies over plain HTTP.

Therefore login over HTTP will fail when:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

Production installations should use HTTPS and Secure cookies.

---

## PROXPILOT_SESSION_MAX_AGE

Session lifetime in seconds.

Example:

```dotenv
PROXPILOT_SESSION_MAX_AGE=43200
```

`43200` seconds corresponds to 12 hours.

---

# Infrastructure Configuration

Proxmox environments are configured through:

```text
Settings
→ Infrastructure
```

An infrastructure represents one independent Proxmox environment.

It can be:

- a Proxmox VE cluster
- a standalone Proxmox VE host

Multiple infrastructures can be configured in the same ProxPilot instance.

Examples:

```text
Production Cluster
Lab Cluster
Remote Cluster
Standalone Test Host
```

Each infrastructure has its own API credentials, node addressing and SSH configuration.

---

# Adding an Infrastructure

Open:

```text
Settings
→ Infrastructure
→ Add Infrastructure
```

The configuration is performed in two stages:

1. API connection and discovery
2. Infrastructure and node configuration

---

# Proxmox API Connection

## API endpoint

Enter one reachable Proxmox API endpoint.

Example:

```text
https://192.168.1.10:8006
```

For a cluster, only one reachable cluster node is required for discovery.

ProxPilot determines whether the endpoint belongs to:

```text
Cluster
```

or:

```text
Standalone
```

For a cluster, the remaining nodes are discovered automatically.

Do not add every node of the same Proxmox cluster as a separate infrastructure.

---

## Token ID

Enter the complete Proxmox API token ID.

Example:

```text
dashboard@pve!dashboard
```

The API token is configured independently for each infrastructure.

---

## Token secret

Enter the secret generated when the Proxmox API token was created.

The token secret must be treated as sensitive information.

Never publish it in:

- Git repositories
- screenshots
- documentation
- issue reports
- log excerpts

---

# TLS Certificate Verification

The Infrastructure dialog contains:

```text
Verify TLS certificate
```

Enable this when the Proxmox API certificate can be validated by the ProxPilot backend container.

For example, this is appropriate when the Proxmox API uses a certificate whose complete trust chain is available to the backend.

For environments using an untrusted or self-signed certificate, verification may need to remain disabled until the certificate is trusted.

TLS verification is configured independently for each infrastructure.

---

# Test & Discover

After entering:

- API endpoint
- Token ID
- Token secret
- TLS verification setting

click:

```text
Test & Discover
```

ProxPilot authenticates against the Proxmox API and discovers the environment.

Successful discovery displays:

```text
Infrastructure detected
```

and confirms that API authentication succeeded.

The result includes:

- Type
- Cluster name
- Number of nodes

The type is shown as either:

```text
Cluster
```

or:

```text
Standalone
```

---

# Infrastructure Name

After successful discovery, configure:

```text
Infrastructure name
```

This is the display name used throughout ProxPilot.

It does **not** rename:

- the Proxmox cluster
- Proxmox nodes
- DNS hosts

Example names:

```text
Production
Lab
Datacenter 1
Remote Site
```

Use unique and descriptive names when managing several infrastructures.

---

# Description

An optional description can be stored for each infrastructure.

It can be used to identify:

- purpose
- location
- environment
- administrative responsibility

Example:

```text
Primary production Proxmox cluster
```

---

# Node Configuration

After discovery, ProxPilot displays every node belonging to the detected infrastructure.

For every node the dialog contains:

```text
Node
Reachable host / IP
```

## Node

The node name comes from Proxmox and is read-only.

Example:

```text
pve1
```

The node name represents the actual Proxmox node identity.

---

## Reachable host / IP

This field defines the address ProxPilot should use to communicate with the node.

Example:

```text
192.168.1.10
```

or:

```text
pve1.example.local
```

For a three-node cluster:

```text
pve1    192.168.1.10
pve2    192.168.1.11
pve3    192.168.1.12
```

The configured address must be reachable from the ProxPilot backend.

This is particularly important when:

- Proxmox node names are not resolvable inside Docker
- management traffic uses dedicated addresses
- internal DNS differs from the Docker host's DNS environment
- nodes are reachable through different routed networks

The node name itself is not changed by editing the reachable address.

---

# SSH Configuration

ProxPilot uses SSH for host-level functionality that is not fully available through the Proxmox API.

Starting with **ProxPilot 1.7.2**, ProxPilot manages a dedicated Ed25519 SSH key pair automatically. A normal installation no longer requires manually generating a key pair or entering the private-key path when adding an Infrastructure.

The Infrastructure configuration exposes:

```text
SSH user
SSH port
ProxPilot SSH public key
```

The SSH user and port are stored per infrastructure. The managed private-key path is used internally by ProxPilot.

---

## SSH user

Typical value:

```text
root
```

The account must have the permissions required for the host-level operations used by ProxPilot.

---

## SSH port

Default:

```text
22
```

Change this only if the Proxmox nodes of the infrastructure use another SSH port.

---

## Managed SSH key

Docker Compose persists the SSH identity through:

```yaml
- ./ssh:/app/ssh
```

On the Docker host:

```text
./ssh/id_ed25519
./ssh/id_ed25519.pub
```

Inside the backend container:

```text
/app/ssh/id_ed25519
/app/ssh/id_ed25519.pub
```

At backend startup ProxPilot checks this persistent directory.

If neither key file exists, ProxPilot creates a new Ed25519 key pair automatically.

Generated permissions:

```text
id_ed25519      0600
id_ed25519.pub  0644
```

Existing complete key pairs are preserved and are never silently replaced.

If the private key exists but the public key is missing, ProxPilot recreates only the public key from the existing Ed25519 private key.

If the public key exists but the matching private key is missing, ProxPilot intentionally does not generate a replacement private key. Restore the original private key from backup instead.

---

## Authorize the ProxPilot public key

When adding an Infrastructure, the SSH section displays the **ProxPilot SSH public key** and provides a copy-to-clipboard action.

Copy only this public key to the target Proxmox node.

For the default `root` SSH user:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
```

Append the complete public key displayed by ProxPilot to:

```text
/root/.ssh/authorized_keys
```

Example:

```bash
echo 'ssh-ed25519 AAAA... proxpilot' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Using `>>` preserves existing authorized keys.

For a cluster, authorize the ProxPilot public key on every node that ProxPilot should manage through SSH.

Never copy, publish or expose the private key:

```text
./ssh/id_ed25519
```

---

## Verify SSH access

From the Docker host:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

For a non-default port:

```bash
ssh -p PORT -i ./ssh/id_ed25519 root@NODE-IP hostname
```

The command should return the hostname of the target Proxmox node.

---

# API and SSH Responsibilities

ProxPilot uses both the Proxmox API and SSH.

The Proxmox API is used for Proxmox-managed resources and operations.

SSH is used for host-level information and operations where direct operating-system access is required.

Examples of SSH-dependent functionality include:

- hardware information
- physical disk information
- S.M.A.R.T. information
- ZFS information
- temperature monitoring
- package update checks
- installing package updates
- package cleanup
- node reboot
- node shutdown

A successful API connection therefore does not automatically mean that all host-level functionality will work.

If dashboard and guest data work but hardware or update information does not, verify SSH separately.

---

# Multiple Infrastructures

ProxPilot 1.7.0 supports multiple independent Proxmox environments.

Each infrastructure maintains its own:

- display name
- description
- type
- API endpoint
- API token
- TLS verification setting
- discovered nodes
- reachable node addresses
- SSH user
- SSH port
- managed ProxPilot SSH identity
- enabled state

This allows one ProxPilot installation to manage combinations such as:

```text
Cluster A
Cluster B
Standalone Host A
Standalone Host B
```

Node identity is infrastructure-aware.

For example, two independent infrastructures may both contain a node named:

```text
pve1
```

ProxPilot can distinguish them by their infrastructure.

---

# Cluster Configuration

For a Proxmox cluster, configure only one initial reachable API endpoint.

Example:

```text
https://192.168.1.10:8006
```

After **Test & Discover**, ProxPilot discovers the cluster topology.

Confirm the `Reachable host / IP` for every discovered node before saving.

Example:

```text
Infrastructure: Production
Type: Cluster

pve1 → 192.168.1.10
pve2 → 192.168.1.11
pve3 → 192.168.1.12
```

Do not create three separate infrastructures for these three nodes when they belong to the same Proxmox cluster.

---

# Standalone Configuration

A non-clustered Proxmox VE host is detected as:

```text
Standalone
```

Example:

```text
Infrastructure: Lab Host
Type: Standalone
Node: pve-lab
Reachable host / IP: 192.168.1.50
```

Standalone hosts can be managed alongside Proxmox clusters.

---

# Legacy PVE Environment Variables

Earlier ProxPilot releases configured the Proxmox connection through `.env`.

Variables included:

```text
PVE_ENDPOINTS
PVE_TOKEN_ID
PVE_TOKEN_SECRET
PVE_VERIFY_SSL
PVE_SSH_USER
PVE_SSH_KEY
PVE_SSH_PORT
PVE_NODE_HOSTS
```

These variables belong to the old single-infrastructure configuration model.

They must not be used as the normal infrastructure configuration method in ProxPilot 1.7.0.

Equivalent configuration is now managed under:

```text
Settings
→ Infrastructure
```

This change is required for multi-infrastructure support because every environment can have independent API, TLS, node and SSH settings.

---

# LDAP

LDAP configuration remains managed through the web interface.

Open:

```text
Settings
→ Authentication
→ LDAP
```

Supported configuration includes:

- Active Directory
- OpenLDAP
- LDAPS
- StartTLS
- bind account
- group mapping
- default role
- Administrator mapping
- Operator mapping
- Viewer mapping
- connection testing before saving

LDAP configuration is application-wide rather than tied to a specific Proxmox infrastructure.

---

# Audit Log

Audit retention is configured from the Settings page.

Audit functionality includes:

- configurable retention period
- automatic cleanup
- CSV export
- JSON export
- multi-filter support
- context-aware filter values

With multiple infrastructures, audit information should be interpreted together with the recorded target and infrastructure context.

---

# Task Scheduler

The Task Scheduler is configured through the ProxPilot web interface.

Scheduled operations can target Proxmox resources managed by ProxPilot.

Supported scheduling includes one-time and recurring operations.

Examples include:

- guest power operations
- guest migrations
- backups
- snapshots
- node update checks
- update installation
- package cleanup
- node reboot
- node shutdown
- maintenance mode

Scheduler execution is independent of an interactive browser session.

Scheduled and manually triggered scheduler runs are recorded in ProxPilot's activity and audit information.

Because ProxPilot 1.7.0 can manage multiple infrastructures, verify the infrastructure and target before saving administrative scheduled tasks.

---

# Database

ProxPilot uses a local SQLite database.

Default persistent location:

```text
./data/proxpilot.db
```

The database is created automatically.

It stores persistent application configuration.

With ProxPilot 1.7.0 this includes infrastructure-related application state, making the database especially important in multi-infrastructure deployments.

Do not delete the database during normal updates.

Back it up before major changes or migrations.

---

# Persistent Data

At minimum, protect:

```text
.env
data/
ssh/
```

A practical backup should include:

```text
.env
data/proxpilot.db
ssh/
docker-compose.yml
```

The API credentials and infrastructure configuration stored by the application should be treated as sensitive data.

The `ssh/` directory is also security-critical persistent state. Preserve both:

```text
ssh/id_ed25519
ssh/id_ed25519.pub
```

If the private key is lost and a new SSH identity is generated, the new public key must be authorized again on every affected Proxmox node.

Never publish the SQLite database or the SSH private key.

---

# Reverse Proxy

For production deployments, use:

- HTTPS
- Secure cookies
- WebSocket support
- forwarding of client IP headers required by your reverse-proxy configuration

The integrated browser console requires WebSocket communication.

When HTTPS is used:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

See:

```text
docs/HTTPS_AND_REVERSE_PROXY.md
```

for the complete reverse-proxy configuration.

---

# Example Global .env

A normal ProxPilot 1.7.2 `.env` can look like:

```dotenv
# ============================================================
# General application settings
# ============================================================

TZ=Europe/Berlin
REFRESH_INTERVAL=10

# ============================================================
# ProxPilot authentication
# ============================================================

PROXPILOT_AUTH_ENABLED=true

PROXPILOT_AUTH_USERNAME=admin
PROXPILOT_AUTH_PASSWORD=replace-with-a-secure-password

PROXPILOT_SESSION_SECRET=replace-with-a-long-random-secret

PROXPILOT_COOKIE_SECURE=true
PROXPILOT_SESSION_MAX_AGE=43200
```

Notice that no Proxmox endpoint, API token or node mapping is present in this file.

Those settings are configured through the Infrastructure page.

---

# Example Infrastructure

Example cluster:

```text
Infrastructure name:
Production

Description:
Primary production cluster

API endpoint:
https://192.168.1.10:8006

Token ID:
dashboard@pve!dashboard

Verify TLS certificate:
Enabled

Type:
Cluster

Nodes:
pve1 → 192.168.1.10
pve2 → 192.168.1.11
pve3 → 192.168.1.12

SSH user:
root

SSH port:
22

SSH identity:
managed automatically by ProxPilot

Public key:
displayed in Settings → Infrastructure when adding an Infrastructure
```

Example standalone host:

```text
Infrastructure name:
Lab

API endpoint:
https://192.168.1.50:8006

Token ID:
dashboard@pve!dashboard

Type:
Standalone

Node:
pve-lab → 192.168.1.50

SSH user:
root

SSH port:
22

SSH identity:
managed automatically by ProxPilot

Public key:
displayed in Settings → Infrastructure when adding an Infrastructure
```

The values above are examples only and must be replaced with values appropriate for the actual installation.

---

# Configuration Verification

After configuration, verify:

## Global application

```bash
docker compose ps
docker compose logs --tail=100
```

Confirm:

- backend is healthy
- login works
- session handling works
- HTTPS and cookie settings match the deployment

## Infrastructure

Under:

```text
Settings
→ Infrastructure
```

confirm:

- infrastructure is listed
- expected type is detected
- infrastructure is enabled
- all expected nodes are present
- node addresses are correct

## API

Confirm that:

- dashboard data loads
- nodes appear
- guests appear
- storage information loads
- Proxmox operations permitted by the API role work

## SSH

Confirm that host-level data loads.

If necessary, test manually:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

## Multiple infrastructures

For every configured infrastructure verify:

- correct nodes
- correct guests
- correct storage
- correct infrastructure association
- API connectivity
- SSH connectivity

Do not assume that a successful test of one infrastructure validates the others.

---

# Troubleshooting Configuration

## Old PVE_* values still exist in .env

Remove them from the active configuration after migrating to the 1.7.0 Infrastructure model.

The Proxmox connection should be configured through:

```text
Settings
→ Infrastructure
```

## API authentication fails during discovery

Check:

- endpoint
- Token ID
- token secret
- token existence
- API permissions
- TLS verification

## Cluster discovery succeeds but individual nodes fail

Check each:

```text
Reachable host / IP
```

The backend must be able to reach the configured node address.

## API works but SSH-dependent functions fail

Check:

- SSH user
- SSH port
- persistent `./ssh:/app/ssh` mount
- presence and permissions of `./ssh/id_ed25519`
- node address
- SSH authorization on the Proxmox host

## Login fails after enabling HTTPS settings

Verify that:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

is used only when the browser actually accesses ProxPilot through HTTPS.

For HTTP-only access use:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

---

# Security

Treat the following as secrets:

- `.env`
- session secret
- local passwords
- LDAP bind password
- Proxmox API token secrets
- SSH private keys
- SQLite database

Do not commit them to Git.

Use HTTPS for production.

Use dedicated Proxmox API credentials with only the permissions required by ProxPilot.

Enable Proxmox API TLS certificate verification whenever a trusted certificate chain is available.

---

End of document.
