# ProxPilot Installation Guide

This guide explains how to install and configure ProxPilot for a new Proxmox VE environment.

Two installation methods are supported:

- Docker Compose using the published container images (**recommended**)
- Building ProxPilot from source

The guide also covers:

- Preparing Proxmox VE
- Creating the required API user
- Creating the API token
- Creating custom roles
- Assigning ACLs
- Configuring SSH
- Configuring ProxPilot
- Verifying the installation
- Updating ProxPilot
- Troubleshooting

---

# Installation Methods

## Option 1 — Docker Compose (Recommended)

This is the recommended installation method for almost all users.

No source code needs to be compiled.

Download the following files from the GitHub repository or the latest GitHub Release:

- `docker-compose.yml`
- `.env.example`

Rename

```text
.env.example
```

to

```text
.env
```

Open `.env` and configure all required values.

Start ProxPilot:

```bash
docker compose pull
docker compose up -d
```

`docker compose pull` automatically downloads every required container image:

- ghcr.io/mauckisch/proxpilot-backend
- ghcr.io/mauckisch/proxpilot-frontend

Verify the installation:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

This installation method is recommended for production environments.

---

## Option 2 — Build from Source

This installation method is intended for developers or users who want to modify the source code.

Clone the repository:

```bash
git clone https://github.com/Mauckisch/proxpilot.git

cd proxpilot
```

Create the environment file:

```bash
cp .env.example .env
```

Build and start the containers:

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

---

# Requirements

Before installing ProxPilot ensure that the following requirements are met.

## Software

- Proxmox VE 8 or newer
- Docker Engine
- Docker Compose

## Network

The Docker host running ProxPilot must be able to reach every configured Proxmox node.

Required ports:

| Port | Protocol | Purpose |
|------:|:--------:|---------|
| 22 | TCP | SSH |
| 8006 | TCP | Proxmox VE API |
| 8085 | TCP | ProxPilot Web Interface |

If a firewall is used, ensure that these ports are reachable.

## Proxmox Requirements

The installation requires:

- A dedicated API user
- A dedicated API token
- A dedicated SSH key
- Custom Proxmox roles
- Appropriate ACL assignments

These are configured in the following chapters.

---

# Prepare Proxmox VE

Before ProxPilot can communicate with your cluster, a dedicated API account must be created.

Using a dedicated account is recommended because it allows permissions to be limited to exactly the operations required by ProxPilot.

Do **not** use the root account for API access.

The next chapters describe how to create the required user, token and permissions.
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

It will later be entered into the ProxPilot `.env` file.

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
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Migrate VM.PowerMgmt"
```

If the role already exists:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Migrate VM.PowerMgmt"
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

A dedicated SSH key is strongly recommended.

---

## Create the SSH Directory

Inside the ProxPilot directory create a folder for the SSH keys:

```bash
mkdir ssh

chmod 700 ssh
```

---

## Generate an SSH Key

Generate a dedicated Ed25519 key pair.

```bash
ssh-keygen \
  -t ed25519 \
  -C "ProxPilot" \
  -f ./ssh/id_ed25519
```

For unattended operation leave the passphrase empty.

This creates:

```text
ssh/id_ed25519
ssh/id_ed25519.pub
```

---

## Install the Public Key

Copy the public key to every Proxmox node.

Example:

```bash
ssh-copy-id -i ./ssh/id_ed25519.pub root@pve1

ssh-copy-id -i ./ssh/id_ed25519.pub root@pve2

ssh-copy-id -i ./ssh/id_ed25519.pub root@pve3
```

---

## Verify SSH Access

Test every configured node.

```bash
ssh -i ./ssh/id_ed25519 root@pve1 hostname

ssh -i ./ssh/id_ed25519 root@pve2 hostname

ssh -i ./ssh/id_ed25519 root@pve3 hostname
```

Expected output:

```text
pve1

pve2

pve3
```

---

## Protect the Private Key

The private key should only be readable by its owner.

```bash
chmod 600 ./ssh/id_ed25519

chmod 644 ./ssh/id_ed25519.pub
```

The `ssh/` directory is ignored by Git and should never be committed.

---

# Configure .env

Copy the example configuration.

```bash
cp .env.example .env
```

Open the file in your preferred editor.

```bash
nano .env
```

Configure every variable before starting ProxPilot.

---

## Proxmox API

### PVE_ENDPOINTS

Comma-separated list of all Proxmox API endpoints.

Example:

```dotenv
PVE_ENDPOINTS=https://pve1.example.local:8006,https://pve2.example.local:8006,https://pve3.example.local:8006
```

---

### PVE_TOKEN_ID

The full API token ID.

Example:

```dotenv
PVE_TOKEN_ID=dashboard@pve!dashboard
```

---

### PVE_TOKEN_SECRET

Paste the token secret generated when creating the API token.

Example:

```dotenv
PVE_TOKEN_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Never publish this value.

---

### PVE_VERIFY_SSL

Enable certificate validation.

```dotenv
PVE_VERIFY_SSL=true
```

For self-signed certificates inside trusted homelabs:

```dotenv
PVE_VERIFY_SSL=false
```

---

## SSH Configuration

### PVE_SSH_USER

Normally:

```dotenv
PVE_SSH_USER=root
```

---

### PVE_SSH_KEY

Path inside the backend container.

```dotenv
PVE_SSH_KEY=/app/ssh/id_ed25519
```

---

### PVE_SSH_PORT

Default:

```dotenv
PVE_SSH_PORT=22
```

---

### PVE_NODE_HOSTS

Maps Proxmox node names to reachable IP addresses or hostnames.

Example:

```dotenv
PVE_NODE_HOSTS=pve1=192.168.1.10,pve2=192.168.1.11,pve3=192.168.1.12
```

The names on the left side **must exactly match** the node names reported by Proxmox.

---

## General Settings

### REFRESH_INTERVAL

Refresh interval in seconds.

Example:

```dotenv
REFRESH_INTERVAL=10
```

---

## Local Authentication

Enable or disable authentication.

```dotenv
PROXPILOT_AUTH_ENABLED=true
```

---

Initial administrator username:

```dotenv
PROXPILOT_AUTH_USERNAME=admin
```

---

Initial administrator password:

```dotenv
PROXPILOT_AUTH_PASSWORD=replace-with-a-secure-password
```

---

Session signing secret.

Generate a random secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Example:

```dotenv
PROXPILOT_SESSION_SECRET=replace-with-generated-secret
```

---

### PROXPILOT_COOKIE_SECURE

When using HTTPS:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For HTTP development environments only:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

When Secure cookies are enabled, HTTP logins will not work because browsers refuse to send Secure cookies over unencrypted connections.

---

### PROXPILOT_SESSION_MAX_AGE

Session lifetime in seconds.

Example:

```dotenv
PROXPILOT_SESSION_MAX_AGE=43200
```

This example keeps users logged in for 12 hours.

---

# First Startup

## Docker Compose Installation

```bash
docker compose pull

docker compose up -d
```

---

## Source Installation

```bash
docker compose up -d --build
```

---

Verify that all containers are running.

```bash
docker compose ps
```

Example:

```text
proxpilot-backend     Up (healthy)

proxpilot-frontend    Up
```

View the logs:

```bash
docker compose logs --tail=100

docker compose logs -f
```

Open ProxPilot:

```text
http://YOUR-SERVER-IP:8085
```

If HTTPS is configured through a reverse proxy:

```text
https://proxpilot.example.com
```
# Verify Installation

After starting the containers, verify that ProxPilot is operating correctly.

---

## Verify Docker Containers

Check the container status.

```bash
docker compose ps
```

Example:

```text
NAME                   STATUS
proxpilot-backend      Up (healthy)
proxpilot-frontend     Up
```

The backend container should eventually report a healthy status.

---

## Verify the Web Interface

Open the application in your browser.

HTTP:

```text
http://SERVER-IP:8085
```

HTTPS (recommended):

```text
https://proxpilot.example.com
```

The login page should appear if authentication is enabled.

---

## Verify Login

Log in using the administrator account configured in `.env`.

Example:

```text
Username: admin
Password: ********
```

If LDAP is enabled later, LDAP users can authenticate using their Active Directory credentials.

---

## Verify Dashboard

Confirm that:

- Cluster summary is displayed
- Nodes are listed
- Guest counts are correct
- Storage information is available
- No API errors are shown

---

## Verify Nodes

Open the **Nodes** page.

Verify:

- CPU information
- Memory usage
- Storage usage
- Hardware information
- Network information
- Temperature information
- Package update information

---

## Verify Guests

Confirm that:

- Virtual machines are listed
- LXC containers are listed
- Power state is correct
- Tags are displayed
- Configuration opens correctly

Test a non-production guest.

Verify:

- Start
- Shutdown
- Stop
- Reset
- Suspend
- Resume

---

## Verify Snapshots

Open a guest.

Create a test snapshot.

Verify that:

- Snapshot creation succeeds
- Snapshot list refreshes
- Snapshot deletion works

---

## Verify Backups

Open the Backups page.

Verify:

- Backup jobs are visible
- Existing backups are listed
- Manual backup creation works

---

## Verify Browser Console

Open the integrated browser console.

Verify that:

- The console opens successfully
- Keyboard input works
- Mouse input works

If the browser console cannot connect, verify HTTPS and reverse proxy configuration.

---

## Verify Node Actions

Open the Nodes page.

Test:

- Check for updates
- Package cleanup
- Maintenance mode

Avoid rebooting production nodes during the initial verification.

---

# Browser Console

The integrated browser console uses noVNC.

Unlike ordinary REST API requests, browser consoles rely on WebSockets.

For the best browser compatibility HTTPS is strongly recommended.

When accessing ProxPilot over HTTPS, configure:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For local HTTP-only development:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

Modern browsers refuse to send Secure cookies over plain HTTP.

If Secure cookies are enabled while using HTTP, login will fail.

---

# LDAP Authentication

ProxPilot supports both:

- Local users
- LDAP users

LDAP configuration is performed through the web interface.

Open:

```text
Settings
→ Authentication
→ LDAP
```

Configure:

- LDAP server
- Bind DN
- Bind password
- Base DN
- User search filter
- TLS settings

Test the connection before enabling LDAP authentication.

Local administrator accounts remain available and should always be kept as emergency accounts.

---

# Updating ProxPilot

## Docker Compose Installation

Pull the latest images.

```bash
docker compose pull
```

Restart the containers.

```bash
docker compose up -d
```

Verify:

```bash
docker compose ps

docker compose logs --tail=100
```

---

## Source Installation

Update the repository.

```bash
git pull
```

Rebuild the containers.

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps

docker compose logs --tail=100
```

---

# Troubleshooting

## Containers do not start

Validate the Compose configuration.

```bash
docker compose config
```

View logs.

```bash
docker compose logs

docker compose logs --tail=200
```

---

## API Authentication Fails

Verify the configured token.

```bash
grep PVE_TOKEN_ID .env
```

Verify that the token exists.

```bash
pveum user token list dashboard@pve
```

Check backend logs.

```bash
docker compose logs backend
```

---

## SSH Functions Fail

Verify SSH connectivity.

```bash
ssh -i ./ssh/id_ed25519 root@pve1 hostname
```

Check file permissions.

```bash
ls -l ./ssh/id_ed25519
```

Expected:

```text
-rw-------
```

Correct them if required.

```bash
chmod 600 ./ssh/id_ed25519
```

---

## Browser Console Does Not Connect

Verify:

- HTTPS is configured correctly.
- Reverse proxy supports WebSockets.
- Browser blocks neither cookies nor mixed content.
- `PROXPILOT_COOKIE_SECURE` matches your deployment.

---

## Database

Local users and settings are stored in:

```text
./data/proxpilot.db
```

The database is created automatically during the first startup.

Do not delete this file unless you intentionally want to reset the local configuration.

---

# Next Steps

Your ProxPilot installation is now complete.

For additional documentation see:

- `CONFIGURATION.md`
- `API-PERMISSIONS.md`
- `AUTHENTICATION.md`
- `HTTPS_AND_REVERSE_PROXY.md`
- `TROUBLESHOOTING.md`
- `DEVELOPMENT.md`

You are now ready to monitor and manage your Proxmox VE environment using ProxPilot.
---

# Appendix

## Default Directory Structure

A typical ProxPilot installation looks like this:

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

---

## Files Created Automatically

During the first startup ProxPilot creates the local SQLite database automatically.

```text
./data/proxpilot.db
```

No manual database initialization is required.

---

## Files That Must Never Be Committed

Never commit the following files to Git:

```text
.env
data/
ssh/
```

The repository already ignores these paths using `.gitignore`.

---

## Related Documentation

Additional documentation is available in the `docs` directory.

| Document | Description |
|----------|-------------|
| API-PERMISSIONS.md | Required Proxmox permissions |
| AUTHENTICATION.md | Local users and LDAP |
| CONFIGURATION.md | Environment variables |
| DEVELOPMENT.md | Development setup |
| HTTPS_AND_REVERSE_PROXY.md | HTTPS configuration |
| TROUBLESHOOTING.md | Common issues |

---

## Getting Help

If you encounter a problem:

1. Verify the installation steps.
2. Check the Docker container logs.
3. Review the troubleshooting guide.
4. Search existing GitHub Issues.
5. Open a new issue if the problem persists.

Please include:

- ProxPilot version
- Proxmox VE version
- Docker version
- Browser
- Relevant log output
- Steps to reproduce

Never include:

- API token secrets
- Passwords
- SSH private keys
- SQLite databases

---

End of document.
