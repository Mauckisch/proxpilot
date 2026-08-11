# ProxPilot Installation Guide

This guide explains how to install and configure **ProxPilot 2.0.0** for one or more Proxmox VE environments.

ProxPilot 2.0.0 supports multiple independent Proxmox infrastructures. An infrastructure can be either:

- a Proxmox VE cluster
- a standalone Proxmox VE host

Proxmox API endpoints, API tokens, TLS verification, node addresses and SSH settings are no longer configured through `PVE_*` environment variables. They are managed in the ProxPilot web interface under **Settings → Infrastructure**.

The `.env` file is used only for global ProxPilot application settings such as authentication, sessions, refresh interval and timezone.

This guide covers:

- Docker Compose installation using published images
- Building ProxPilot from source
- Preparing Proxmox VE
- Creating the API user and token
- Creating the required custom roles and ACLs
- Preparing SSH access
- Configuring global ProxPilot settings
- Adding clusters and standalone hosts through Infrastructure discovery
- Adding multiple infrastructures
- Verifying the installation
- Updating ProxPilot
- Troubleshooting

---

# Installation Methods

## Option 1 — Docker Compose with Published Images (Recommended)

This is the recommended installation method for normal and production deployments.

Download these files from the ProxPilot repository or a release:

- `docker-compose.yml`
- `.env.example`

Create the environment file:

```bash
cp .env.example .env
```

Edit it before starting ProxPilot:

```bash
nano .env
```

Start the containers:

```bash
docker compose pull
docker compose up -d
```

The published images are:

```text
ghcr.io/mauckisch/proxpilot-backend
ghcr.io/mauckisch/proxpilot-frontend
```

Verify:

```bash
docker compose ps
```

View logs when required:

```bash
docker compose logs --tail=100
```

---

## Option 2 — Build from Source

Use this method for development or when modifying ProxPilot itself.

```bash
git clone https://github.com/Mauckisch/proxpilot.git
cd proxpilot
cp .env.example .env
```

Edit `.env` and build:

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
```

For the development Compose override used by contributors:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

---

# Requirements

## Software

- Proxmox VE 8 or newer
- Docker Engine
- Docker Compose

## Network

The Docker host running ProxPilot must be able to reach every Proxmox node that is added to ProxPilot.

| Port | Protocol | Purpose |
|------:|:--------:|---------|
| 22 | TCP | SSH host-level functions |
| 8006 | TCP | Proxmox VE API |
| 8085 | TCP | Default ProxPilot web interface |

For multi-infrastructure installations, this requirement applies independently to every configured cluster and standalone host.

DNS names may be used instead of IP addresses if they are resolvable and reachable from the ProxPilot backend container.

## Proxmox Requirements

For every independent Proxmox infrastructure, prepare:

- a dedicated API user
- a dedicated API token
- the required Proxmox roles and ACLs
- SSH access to every node used by ProxPilot

A cluster only needs to be added once. ProxPilot discovers its nodes from one reachable cluster API endpoint.

A standalone host is added as its own infrastructure.

---

# Prepare Proxmox VE

Prepare each independent Proxmox environment before adding it in ProxPilot.

For a cluster, create the account, token, roles and ACLs in the cluster configuration. You do not add every cluster node separately as a ProxPilot infrastructure.

For separate standalone hosts or separate clusters, repeat the preparation for each environment as required.

Do **not** use `root@pam` as the ProxPilot API account.

---

# Create API User

ProxPilot uses a dedicated Proxmox VE API user.

Using a dedicated account instead of the built-in `root@pam` account is strongly recommended because permissions can be restricted to exactly what ProxPilot requires.

Throughout this guide the following account is used:

```text
dashboard@pve
```

Create the user on any Proxmox VE cluster node:

```bash
pveum user add dashboard@pve \
  --comment "ProxPilot API User"
```

Verify that the user exists:

```bash
pveum user list | grep dashboard
```

Expected output:

```text
dashboard@pve
```

The account does not require a password because ProxPilot authenticates using an API token.

---

# Create API Token

Create an API token for the new user.

The examples in this guide use the token name:

```text
dashboard
```

Create the token:

```bash
pveum user token add dashboard@pve dashboard \
  --comment "ProxPilot API Token"
```

The resulting Token ID is:

```text
dashboard@pve!dashboard
```

Proxmox displays the generated token secret only once.

Store this value immediately.

It will later be entered in the ProxPilot web interface under **Settings → Infrastructure**.

List all configured tokens:

```bash
pveum user token list dashboard@pve
```

Example:

```text
TOKENID
dashboard
```

Never commit the token secret into Git or store it inside the repository.

---

# Create Custom Roles

ProxPilot uses two custom Proxmox roles.

Creating dedicated roles instead of using Administrator permissions follows the principle of least privilege.

The required roles are:

- DashboardManager
- ProxPilotBackup

---

## DashboardManager

This role provides read-only access to cluster information together with guest management permissions.

Required privileges:

```text
Datastore.Audit
Sys.Audit
VM.Audit
VM.Migrate
VM.PowerMgmt
```

Create the role:

```bash
pveum role add DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt VM.GuestAgent.Audit"
```

If the role already exists:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt VM.GuestAgent.Audit"
```

---

## ProxPilotBackup

This role contains the permissions required for backups and snapshots.

Required privileges:

```text
Datastore.Allocate
Datastore.AllocateSpace
Datastore.Audit
VM.Audit
VM.Backup
VM.Snapshot
VM.Snapshot.Rollback
```

Create the role:

```bash
pveum role add ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

If the role already exists:

```bash
pveum role modify ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

---

Verify that both roles exist:

```bash
pveum role list | grep -E "DashboardManager|ProxPilotBackup"
```

Expected output:

```text
DashboardManager
ProxPilotBackup
```

The next chapter assigns these roles to the API user and API token using Proxmox ACLs.
# Configure ACLs

After creating the required roles, they must be assigned to both:

- the API user
- the API token

This is required because Proxmox evaluates the effective permissions of an API token using both the user permissions and the token permissions.

If permissions are assigned only to the user or only to the token, certain operations may fail.

---

## Root Path

Assign the `DashboardManager` role to the API user:

```bash
pveum acl modify / \
  --users dashboard@pve \
  --roles DashboardManager \
  --propagate 1
```

Assign the same role to the API token:

```bash
pveum acl modify / \
  --tokens "dashboard@pve!dashboard" \
  --roles DashboardManager \
  --propagate 1
```

---

## Virtual Machines and Containers

The `/vms` path contains all virtual machines and LXC containers.

Assign both custom roles to the API user:

```bash
pveum acl modify /vms \
  --users dashboard@pve \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

Assign both roles to the API token:

```bash
pveum acl modify /vms \
  --tokens "dashboard@pve!dashboard" \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

---

## Backup Storage

Grant the backup role on the storage that will contain your backups.

Replace:

```text
YOUR-BACKUP-STORAGE
```

with your actual Proxmox storage ID.

Example:

```text
backup
backup-nfs
pbs
```

Assign the permission to the API user:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1
```

Assign the permission to the API token:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --tokens "dashboard@pve!dashboard" \
  --roles ProxPilotBackup \
  --propagate 1
```

Example for a storage named `backup-nfs`:

```bash
pveum acl modify /storage/backup-nfs \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1

pveum acl modify /storage/backup-nfs \
  --tokens "dashboard@pve!dashboard" \
  --roles ProxPilotBackup \
  --propagate 1
```

---

# Why are both roles assigned on `/vms`?

Proxmox evaluates permissions based on the resource path.

A common mistake is assigning only the backup role to `/vms`.

This allows operations such as:

- Backups
- Snapshot creation
- Snapshot rollback

but prevents operations like:

- Start
- Stop
- Shutdown
- Reset
- Live migration

Typical error:

```text
Permission check failed (/vms/101, VM.PowerMgmt)
```

To avoid this problem, always assign **both** roles:

```text
DashboardManager
ProxPilotBackup
```

to both:

- API user
- API token

---

# Verify Effective Permissions

Verify the permissions before continuing.

Replace `100` with an existing VM or container ID.

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/100
```

The output should contain at least:

```text
Datastore.Allocate
Datastore.AllocateSpace
Datastore.Audit

Sys.Audit

VM.Audit
VM.Backup
VM.Migrate
VM.PowerMgmt
VM.Snapshot
VM.Snapshot.Rollback
```

---

Verify the configured ACLs:

```bash
pveum acl list | grep dashboard
```

A typical configuration looks similar to:

```text
/                                   DashboardManager   user   dashboard@pve
/                                   DashboardManager   token  dashboard@pve!dashboard

/vms                                DashboardManager   user   dashboard@pve
/vms                                ProxPilotBackup    user   dashboard@pve

/vms                                DashboardManager   token  dashboard@pve!dashboard
/vms                                ProxPilotBackup    token  dashboard@pve!dashboard

/storage/backup-nfs                 ProxPilotBackup    user   dashboard@pve
/storage/backup-nfs                 ProxPilotBackup    token  dashboard@pve!dashboard
```

If your output is comparable to the example above, the API permissions are correctly configured and you can continue with the SSH configuration.
# Configure SSH

Several ProxPilot features require direct SSH access to the Proxmox nodes.

The Proxmox API does not expose every operating system function. Therefore, ProxPilot uses SSH for host-level operations.

SSH is required for:

- Hardware information
- Physical disks
- SMART information (where supported)
- ZFS information
- Temperature monitoring
- Package update checks
- Installing package updates
- Package cleanup
- Node reboot
- Node shutdown

Starting with ProxPilot 1.7.2, the application manages its own dedicated Ed25519 SSH key pair automatically. A normal installation no longer requires manually running `ssh-keygen` or manually entering a private-key path in the Infrastructure dialog.

---

## Persistent SSH Directory

The Docker Compose configuration mounts the local SSH directory into the backend container:

```yaml
- ./ssh:/app/ssh
```

The mount must be writable because ProxPilot creates the key pair automatically when it is missing.

On the Docker host, the persistent files are:

```text
./ssh/id_ed25519
./ssh/id_ed25519.pub
```

Inside the backend container, the corresponding paths are:

```text
/app/ssh/id_ed25519
/app/ssh/id_ed25519.pub
```

Docker creates the bind-mount directory when required. For a source checkout you may also create it explicitly:

```bash
mkdir -p ssh
```

---

## Automatic Key Generation

At backend startup ProxPilot checks the persistent SSH directory.

If neither key file exists, ProxPilot creates a new Ed25519 key pair automatically. The generated files use these permissions:

```text
id_ed25519      0600
id_ed25519.pub  0644
```

Existing complete key pairs are preserved and are never silently replaced.

If the private key exists but the public key is missing, ProxPilot recreates only the public key from the existing Ed25519 private key.

If the public key exists but the matching private key is missing, ProxPilot refuses to silently create a replacement private key. This avoids unexpectedly changing the SSH identity already trusted by the Proxmox nodes.

---

## Install the Public Key on Proxmox

After the backend has started, open:

```text
Settings
→ Infrastructure
→ Add Infrastructure
```

The SSH section displays the **ProxPilot SSH public key** and provides a **Copy** button.

Only the public key is intended to be copied to Proxmox. Never copy or expose the private key `ssh/id_ed25519`.

The default SSH user is `root`. On each Proxmox node that ProxPilot should manage through SSH, prepare the root SSH directory if necessary:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
```

Append the complete public key shown by ProxPilot to:

```text
/root/.ssh/authorized_keys
```

Example:

```bash
echo 'ssh-ed25519 AAAA... proxpilot' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Using `>>` appends the key and preserves existing authorized keys.

For a Proxmox cluster, authorize the ProxPilot public key on every node that ProxPilot should manage through SSH. For a standalone environment, authorize it on that host.

A newly generated ProxPilot key normally ends with the comment `proxpilot`. Upgraded installations can retain another comment from an older manually created key; the comment does not affect SSH authentication.

---

## Verify SSH Access

From the Docker host, test each configured node with the persistent private key:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

For example:

```bash
ssh -i ./ssh/id_ed25519 root@192.168.1.10 hostname
```

Expected output is the hostname of the target Proxmox node.

If the infrastructure uses a non-default SSH port, add `-p PORT`.

---

## Protect and Back Up the SSH Identity

The `ssh/` directory is security-critical persistent application data.

It must:

- remain outside Git
- survive container recreation and image updates
- be protected from unauthorized access
- be included in ProxPilot backups

The private key should remain mode `0600`:

```bash
chmod 600 ./ssh/id_ed25519
chmod 644 ./ssh/id_ed25519.pub
```

If `ssh/id_ed25519` is lost and a new key pair is generated, the new public key must be authorized again on every affected Proxmox node.

The `ssh/` directory is ignored by Git and should never be committed.

---

# Configure Global ProxPilot Settings

ProxPilot separates global application configuration from Proxmox infrastructure configuration.

The following settings remain in `.env`:

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

The following legacy variables must **not** be used to configure infrastructures:

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

These settings have been replaced by the Infrastructure configuration in the web interface.

## Session Secret

Generate a strong session secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the generated value to:

```dotenv
PROXPILOT_SESSION_SECRET=...
```

## Secure Cookies

For HTTPS deployments:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For HTTP-only development or initial local testing:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

Browsers do not send Secure cookies over plain HTTP. Therefore an HTTP deployment cannot log in correctly when `PROXPILOT_COOKIE_SECURE=true`.

## Initial Administrator

The configured initial administrator is created only when no local user with that username already exists in the SQLite database.

Example:

```dotenv
PROXPILOT_AUTH_USERNAME=admin
PROXPILOT_AUTH_PASSWORD=replace-with-a-secure-password
```

Use a strong password before exposing ProxPilot to a network.

---

# First Startup

For the published-image installation:

```bash
docker compose pull
docker compose up -d
```

For a source build:

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
```

The backend should become healthy.

Check recent logs if necessary:

```bash
docker compose logs --tail=100
```

Open ProxPilot:

```text
http://YOUR-SERVER-IP:8085
```

or, when a reverse proxy and HTTPS are configured:

```text
https://proxpilot.example.com
```

Log in with the initial local administrator configured in `.env`.

At this point it is normal for no Proxmox resources to be displayed yet. Proxmox environments are added after login.

---

# Add the First Infrastructure

Open:

```text
Settings
→ Infrastructure
→ Add Infrastructure
```

ProxPilot first asks for one reachable Proxmox API endpoint and API credentials.

## 1. Enter the API Endpoint

Example:

```text
https://192.168.1.10:8006
```

For a cluster, enter **one reachable node**. ProxPilot uses discovery to determine that the endpoint belongs to a cluster and discovers the cluster nodes.

For a standalone Proxmox host, enter that host's API endpoint.

## 2. Enter the API Token

Enter:

```text
Token ID
Token secret
```

Example Token ID:

```text
dashboard@pve!dashboard
```

The token secret is the value shown by Proxmox when the token was created.

## 3. Configure TLS Verification

The switch is named:

```text
Verify TLS certificate
```

Enable it when the Proxmox API certificate is trusted by the ProxPilot backend container.

If the environment uses an untrusted or self-signed certificate, certificate verification may need to remain disabled until a trusted certificate chain is available.

## 4. Test and Discover

Click:

```text
Test & Discover
```

Successful authentication displays:

```text
Infrastructure detected
```

and confirms that Proxmox API authentication succeeded.

ProxPilot then displays:

- **Type** — `Cluster` or `Standalone`
- **Cluster name** — when available
- **Nodes** — number of discovered nodes

Do not save the infrastructure before checking the detected result.

---

# Configure the Detected Infrastructure

After successful discovery, complete the remaining fields.

## Infrastructure Name

Set:

```text
Infrastructure name
```

This is ProxPilot's display name for the environment. It does not rename the actual Proxmox cluster or node.

Use a descriptive name when multiple environments will be managed, for example:

```text
Production
Lab
Datacenter 1
Remote Site
```

## Description

The description is optional and can be used to document the purpose or location of the infrastructure.

## Node Addresses

For every discovered node ProxPilot displays:

```text
Node
Reachable host / IP
```

`Node` is the Proxmox node name and is read-only.

`Reachable host / IP` is the address ProxPilot should use for API and SSH communication with that node.

Verify every discovered node carefully.

Examples:

```text
pve1    192.168.1.10
pve2    192.168.1.11
pve3    192.168.1.12
```

The addresses must be reachable from the ProxPilot backend.

This is particularly important when Proxmox reports node names that are not resolvable inside Docker or when management traffic uses dedicated addresses.

---

# Configure SSH for the Infrastructure

Host-level functions use SSH in addition to the Proxmox API.

The Infrastructure dialog provides:

```text
SSH user
SSH port
ProxPilot SSH public key
```

Typical values are:

```text
SSH user: root
SSH port: 22
```

The private-key path is managed internally by ProxPilot. New infrastructures automatically use:

```text
/app/ssh/id_ed25519
```

The user does not need to enter or edit this path during normal setup.

Use the **Copy** button next to the displayed ProxPilot SSH public key and add that key to the configured SSH user's `authorized_keys` file on every node ProxPilot should manage.

For the default `root` user, the target file is:

```text
/root/.ssh/authorized_keys
```

The infrastructure-level SSH user and port are combined with the individual `Reachable host / IP` values of the discovered nodes.

For a cluster, authorize the same ProxPilot public key on every cluster node that should support SSH-dependent ProxPilot functions.

After the API, node and SSH settings are correct, save the infrastructure.

---

# Add Additional Infrastructures

Repeat:

```text
Settings
→ Infrastructure
→ Add Infrastructure
```

for every additional independent Proxmox environment.

Examples include:

- a second Proxmox cluster
- a standalone lab host
- a remote Proxmox environment
- production and development clusters managed by the same ProxPilot instance

Each infrastructure has its own:

- API endpoint
- Token ID
- Token secret
- TLS verification setting
- discovered topology
- infrastructure name
- description
- node addresses
- SSH user
- SSH port
- authorization of the managed ProxPilot public key on the target nodes

Resources with identical node names in different infrastructures remain distinguishable because ProxPilot 1.7.0 tracks them by infrastructure.

---

# Cluster vs. Standalone Behavior

## Cluster

Provide one reachable cluster node as the initial API endpoint.

After **Test & Discover**, ProxPilot detects the cluster and lists the nodes belonging to it.

Confirm a reachable address for every node.

Do **not** add each node from the same cluster as a separate infrastructure.

## Standalone

A non-clustered Proxmox VE host is detected as:

```text
Standalone
```

It can coexist with clusters and other standalone hosts in the same ProxPilot installation.

---

# Verify the Installation

After saving the infrastructure, verify the installation in stages.

## Infrastructure

Open **Settings → Infrastructure** and confirm:

- the infrastructure is listed
- the expected type is shown
- all expected nodes are present
- node addresses are correct
- the infrastructure is enabled

## Dashboard

Confirm:

- the infrastructure is available
- nodes are listed
- guest counts are plausible
- storage information is available
- no API connection error is displayed

With multiple infrastructures, verify data from each environment rather than checking only one cluster.

Starting with ProxPilot 1.7.2, an unreachable configured standalone host remains visible and is shown as `Disconnected` instead of disappearing from the interface. Infrastructure selectors use a health indicator: green when all nodes are online, yellow when only part of a cluster is online, and red when all nodes of an infrastructure are disconnected.

## Nodes

Open **Nodes** and verify:

- CPU information
- memory usage
- storage usage
- hardware information
- network information
- IP addresses
- temperature information
- package update information

## Guests

Verify:

- QEMU virtual machines are listed
- LXC containers are listed
- infrastructure assignment is correct
- node assignment is correct
- power state is correct
- configuration opens correctly

Test management operations only on a non-production guest:

- Start
- Shutdown
- Stop
- Reset
- Suspend
- Resume

## Snapshots

On a test guest:

- create a snapshot
- verify that it appears
- delete the test snapshot

Test rollback only when it is safe to modify the guest state.

## Backups

Verify:

- backup jobs are visible
- existing backups are listed
- manual backup creation works

## Browser Console

Verify:

- QEMU console opens
- LXC console opens where supported
- keyboard input works
- mouse input works where applicable

The integrated browser console uses WebSockets. HTTPS is strongly recommended.

## Node Actions

Test non-disruptive operations first:

- Check for updates
- Package cleanup where appropriate
- Maintenance mode on a suitable test node

Do not reboot or shut down production nodes merely to verify the installation.

---

# Temperature Monitoring

Hardware temperature monitoring requires `lm-sensors` on the relevant Proxmox node.

Install it on Proxmox:

```bash
apt update
apt install -y lm-sensors
sensors-detect --auto
```

Verify:

```bash
sensors
```

Once sensor data is available on the host, ProxPilot can display the hardware temperatures exposed by the system.

---

# Browser Console and HTTPS

The integrated browser console uses noVNC and WebSockets.

For HTTPS deployments:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For HTTP-only development:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

A reverse proxy must support WebSocket forwarding.

See:

```text
docs/HTTPS_AND_REVERSE_PROXY.md
```

for the complete reverse-proxy configuration.

---

# LDAP Authentication

ProxPilot supports local and LDAP users.

LDAP is configured through the web interface:

```text
Settings
→ Authentication
→ LDAP
```

Configure the LDAP server, bind account, Base DN, user search settings and TLS options there.

Test LDAP before relying on it for administrative access.

Keep at least one working local administrator account for emergency access.

See:

```text
docs/AUTHENTICATION.md
```

---

# ProxPilot 2.0.0 Settings

After the first infrastructure is configured, review the application-wide settings available in the web interface.

## Regional Settings

Regional settings are configured under **Settings → Regional** and are restricted to administrators.

ProxPilot 2.0.0 provides a selectable timezone setting so administrators do not need to enter timezone identifiers manually. The selected timezone is used by application features that require the configured regional timezone.

The `TZ` environment variable remains the container-level default timezone setting.

## Notifications

ProxPilot 2.0.0 supports notification delivery through:

- Discord webhooks
- email through SMTP

Notification configuration is administrator-only.

Administrators can enable or disable the individual notification channels and configure per-event routing so that each supported event can be sent through email, Discord, both channels or neither channel. Channel enable/disable changes are saved immediately.

Supported notification events include node availability, available package updates, update installation results, package cleanup results, reboot requirements, guest backups, snapshots and Task Scheduler execution results.

For multi-node update checks, update installations and package cleanup, ProxPilot aggregates the result into one notification and includes the individual node results.

SMTP credentials and Discord webhook URLs are sensitive configuration and must not be published in screenshots, logs, issue reports or Git repositories.

## Task Scheduler in 2.0.0

The Task Scheduler supports multiple node targets for these node operations:

- update checks
- update installation
- package cleanup

These operations are represented as one logical scheduled task even when several nodes are selected.

For safety, reboot, shutdown and maintenance operations remain restricted to a single node. The backend enforces this restriction independently of the frontend, so a crafted API request cannot turn these actions into multi-node operations.

A multi-node execution can finish with a partial result when only some selected nodes complete successfully. Task and Activity views expose this partial state.

---

# Updating ProxPilot

## Published Docker Images

Pull the current images:

```bash
docker compose pull
docker compose up -d
```

Verify:

```bash
docker compose ps
docker compose logs --tail=100
```

## Source Installation

Update the repository:

```bash
git pull
```

Rebuild:

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
docker compose logs --tail=100
```

Persistent configuration stored in the ProxPilot data directory must be preserved during upgrades.

Do not remove the SQLite database as part of a normal update.

---

# Troubleshooting

## Containers Do Not Start

Validate Compose:

```bash
docker compose config
```

Check status:

```bash
docker compose ps
```

Check recent logs:

```bash
docker compose logs --tail=200
```

## Infrastructure Discovery Fails

Check these items in **Add Infrastructure**:

- API endpoint is reachable from the backend
- port `8006/TCP` is reachable
- Token ID is correct
- Token secret is correct
- API token still exists in Proxmox
- required API permissions are assigned
- TLS verification matches the certificate environment

Verify the token on Proxmox:

```bash
pveum user token list dashboard@pve
```

Then inspect the backend logs:

```bash
docker compose logs --tail=100 backend
```

The Proxmox token is no longer diagnosed with `grep PVE_TOKEN_ID .env` because infrastructure credentials are not stored in the legacy `PVE_*` environment variables.

## Cluster Is Detected but a Node Is Unreachable

Check the `Reachable host / IP` value for the affected node under **Settings → Infrastructure**.

The address must be reachable from the ProxPilot backend for the required API and SSH operations.

Test network reachability from the Docker host first.

For SSH:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

Also verify DNS resolution when hostnames are used.

## SSH Functions Fail

Verify that the managed private key exists on the Docker host:

```bash
ls -l ./ssh/id_ed25519 ./ssh/id_ed25519.pub
```

The expected permissions are:

```text
id_ed25519      0600
id_ed25519.pub  0644
```

Correct them if required:

```bash
chmod 600 ./ssh/id_ed25519
chmod 644 ./ssh/id_ed25519.pub
```

Test the key directly:

```bash
ssh -i ./ssh/id_ed25519 root@NODE-IP hostname
```

Then verify:

- the Infrastructure uses the correct SSH user
- the Infrastructure uses the correct SSH port
- the node `Reachable host / IP` is correct
- the ProxPilot public key shown in the Infrastructure dialog exists in the SSH user's `authorized_keys` file on the target node
- the backend can reach the target node on the configured SSH port

For the default root account, inspect the remote authorization file on the Proxmox node:

```bash
cat /root/.ssh/authorized_keys
```

The private key path is managed internally as `/app/ssh/id_ed25519` and is no longer a normal user-editable Infrastructure setting.

If only `id_ed25519.pub` exists but the private key is missing, restore the original private key from backup. ProxPilot intentionally does not generate a replacement in this state.

## API Works but Hardware or Update Information Fails

This usually indicates that API communication works while SSH communication does not.

Check SSH connectivity and the Infrastructure SSH settings.

Host-level information such as hardware, SMART, ZFS and package management depends on SSH.

## Wrong Infrastructure or Duplicate Node Names

In 1.7.0 node identity is infrastructure-aware.

When two independent environments contain a node with the same name, verify that both infrastructures were added independently and that each resource is associated with the expected infrastructure.

Do not merge independent environments by manually reusing node addresses.

## IP Addresses Missing from Network Overview

ProxPilot's backend returns network address fields as:

```text
address
prefix_length
```

The frontend must use the same schema.

If this problem appears after a development change, verify that frontend types and consumers are not still expecting legacy field names such as:

```text
local
prefixlen
```

Rebuild the frontend after correcting the schema.

## Browser Console Does Not Connect

Verify:

- HTTPS configuration
- WebSocket forwarding
- `PROXPILOT_COOKIE_SECURE`
- browser mixed-content restrictions
- API permissions including console access

## Database

Persistent local ProxPilot data is stored in:

```text
./data/proxpilot.db
```

The database is created automatically.

It contains persistent ProxPilot configuration and must be preserved during normal updates.

Do not delete it unless you intentionally want to reset the local application state.

---

# Security Notes

Never publish or commit:

```text
.env
data/
ssh/
```

Never expose:

- Proxmox API token secrets
- local or LDAP passwords
- SSH private keys
- session secrets
- SMTP credentials
- Discord webhook URLs
- the ProxPilot SQLite database

Use a dedicated Proxmox API account rather than `root@pam`.

Use HTTPS for production deployments.

Enable TLS certificate verification for Proxmox API connections whenever the backend can validate the certificate chain.

---

# Backup Before Major Changes

At minimum, preserve:

```text
.env
data/
ssh/
docker-compose.yml
```

The most important persistent application state is the SQLite database:

```text
data/proxpilot.db
```

Infrastructure configuration introduced with ProxPilot 1.7.0 is persistent application data, so protecting the database is especially important in multi-infrastructure deployments.

The SSH directory is also security-critical persistent application state:

```text
ssh/
```

In particular, preserve:

```text
ssh/id_ed25519
ssh/id_ed25519.pub
```

The private key is the SSH identity already authorized on the configured Proxmox nodes. If it is lost, a newly generated key has a different public key and must be authorized again on every affected node.

---

# Default Directory Structure

A source-based installation typically looks like:

```text
proxpilot/
├── backend/
├── frontend/
├── docs/
├── ssh/
│   ├── id_ed25519
│   └── id_ed25519.pub
├── data/
│   └── proxpilot.db
├── docker-compose.yml
├── .env
├── .env.example
├── README.md
└── CHANGELOG.md
```

The exact source directories are not required when deploying only the published container images.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/CONFIGURATION.md` | Global application and Infrastructure configuration |
| `docs/API-PERMISSIONS.md` | Required Proxmox permissions |
| `docs/AUTHENTICATION.md` | Local users and LDAP |
| `docs/HTTPS_AND_REVERSE_PROXY.md` | HTTPS, reverse proxies and WebSockets |
| `docs/TROUBLESHOOTING.md` | Common problems |
| `docs/DEVELOPMENT.md` | Development and release workflow |

---

# Installation Checklist

Before considering the installation complete, verify:

- Docker containers are running
- backend is healthy
- a strong session secret is configured
- initial administrator login works
- API user and token exist
- required Proxmox roles and ACLs are configured
- the ProxPilot SSH public key is authorized on every required node
- SSH key access works
- at least one Infrastructure was successfully discovered and saved
- cluster/standalone detection is correct
- all node addresses are reachable
- dashboard data is visible
- node information loads
- guests are assigned to the correct infrastructure
- snapshots and backups work where permitted
- browser console works
- HTTPS is configured for production
- Regional settings use the intended timezone
- notification channels and per-event routing are configured if notifications are required
- multi-node scheduled actions are limited to update checks, update installation and package cleanup
- persistent `data/` and SSH material are backed up

---

# Getting Help

When reporting a problem, include:

- ProxPilot version
- Proxmox VE version
- whether the target is a cluster or standalone host
- number of configured infrastructures
- Docker version
- browser
- relevant log output
- steps to reproduce

Never include:

- API token secrets
- passwords
- session secrets
- SSH private keys
- SQLite databases

---

End of document.
