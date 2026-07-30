<p align="center">
  <img src="frontend/public/branding/proxpilot-logo.svg" alt="ProxPilot logo" width="420">
</p>

<h1 align="center">ProxPilot</h1>

<p align="center">
  A modern web interface for managing Proxmox VE homelabs.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue" alt="Version 1.2.0">
  <img src="https://img.shields.io/badge/platform-Proxmox%20VE-orange" alt="Proxmox VE">
  <img src="https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-61dafb" alt="React and TypeScript">
  <img src="https://img.shields.io/badge/backend-FastAPI-009688" alt="FastAPI">
  <img src="https://img.shields.io/badge/deployment-Docker-2496ed" alt="Docker">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

---

## Overview

ProxPilot is a modern web interface for monitoring and managing Proxmox VE homelab environments.

It does not attempt to replace the official Proxmox VE interface. Instead, it provides a focused and responsive overview of frequently used cluster information and day-to-day management functions.

ProxPilot combines cluster status, node details, virtual machines, containers, storage, networking, backups, replication, update information and task monitoring in one interface.

## Features

### Dashboard

- Cluster status overview
- Online and offline node status
- Virtual machine and container overview
- Storage overview
- Resource utilization
- Cluster health indication
- Responsive layout
- Light and dark modes

### Nodes

- Node status and resource overview
- CPU, memory and storage information
- Hardware details
- Physical disks and partitions
- ZFS pool information
- Temperature monitoring
- Network information
- Available package updates
- Manual update installation
- Package cleanup (autoremove and autoclean)
- Maintenance mode enable/disable
- Node reboot and shutdown actions

### Virtual machines and containers

- QEMU virtual machine overview
- LXC container overview
- Start, stop and shutdown actions
- Reboot
- Suspend and resume
- Snapshot management
- Guest configuration viewer
- CPU and memory usage
- Configured disk size
- Guest tags
- Migration options
- Backup actions

### Storage

- Cluster storage overview
- Used, free and total capacity
- Local and shared storage identification
- Storage type
- Supported content types
- Storage availability status

### Network

- Cluster network overview
- Node network interfaces
- Linux bridges
- VLAN interfaces
- Guest network assignments
- Graphical network relationships

### Replication

- Replication job overview
- Source and target nodes
- Replication state
- Schedule information
- Associated guest information

### Backups

- Backup job overview
- Backup configuration
- Backup task history
- Guest backup actions
- Task log viewer

### Cluster and HA

- Cluster member overview
- Node status
- HA service information
- HA resource overview
- Guest distribution

### Tasks

- Current task overview
- Completed task history
- Task status
- Task output and logs
- Live activity panel

### Interface

- React-based responsive interface
- Collapsible navigation
- Optional activity panel
- Light and dark modes
- Persistent interface preferences
- Central version display
- About dialog

### Node Actions

The Nodes page provides common maintenance and management actions directly from the web interface.

#### Update Management

- Check for available package updates
- Install all available package updates
- Display the number of pending updates for each node

#### Package Cleanup

- Remove packages that are no longer required using `apt autoremove`
- Clean the local APT package cache using `apt autoclean`
- Executes both operations non-interactively

#### Maintenance Mode

- Enable Proxmox VE HA maintenance mode
- Disable maintenance mode after maintenance has been completed

#### Power Operations

- Reboot a node
- Shut down a node
- Confirmation dialog before execution

## Screenshots

Screenshots will be added in a future release.

## Architecture

ProxPilot consists of three main components:

- A React and TypeScript frontend
- A FastAPI backend
- An Nginx web server and reverse proxy

The browser communicates only with the ProxPilot backend through the included Nginx proxy.

Proxmox API credentials and SSH keys are handled by the backend and are not exposed directly to the browser.

## Requirements

Before installing ProxPilot, ensure that the following requirements are available:

- A working Proxmox VE cluster or standalone Proxmox VE node
- Docker Engine
- Docker Compose
- Network access from the ProxPilot server to the Proxmox API
- TCP port `8006` access to all configured Proxmox nodes
- SSH access to the Proxmox nodes for host maintenance functions
- A dedicated Proxmox API user and API token
- A dedicated SSH key for ProxPilot

## Installation overview

The installation consists of the following steps:

1. Clone the repository
2. Create a Proxmox API user
3. Create an API token
4. Create the required Proxmox roles
5. Assign the required ACLs
6. Verify the effective permissions
7. Configure SSH access
8. Configure `.env`
9. Build and start ProxPilot
10. Verify the installation

## 1. Clone the repository

Clone ProxPilot and enter the project directory:

```bash
git clone https://github.com/Mauckisch/proxpilot.git
cd proxpilot
```

## 2. Create the Proxmox API user

The following examples use this dedicated API user:

```text
dashboard@pve
```

Run the command on any Proxmox cluster node:

```bash
pveum user add dashboard@pve \
  --comment "ProxPilot API user"
```

Confirm that the user exists:

```bash
pveum user list | grep dashboard
```

## 3. Create the API token

Create a token named `dashboard` for the API user:

```bash
pveum user token add dashboard@pve dashboard \
  --comment "ProxPilot API token"
```

The full token ID will be:

```text
dashboard@pve!dashboard
```

Proxmox displays the generated token secret only once. Save it immediately and store it later in the ProxPilot `.env` file.

Do not commit the token secret to Git.

List the configured tokens:

```bash
pveum user token list dashboard@pve
```

## 4. Create the required Proxmox roles

ProxPilot uses two custom roles:

- `DashboardManager`
- `ProxPilotBackup`

### DashboardManager

This role provides read access and guest power and migration operations.

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

If the role already exists, update it instead:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Migrate VM.PowerMgmt"
```

### ProxPilotBackup

This role provides the permissions required for backups and snapshots.

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

If the role already exists, update it instead:

```bash
pveum role modify ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

Verify both roles:

```bash
pveum role list | grep -E "DashboardManager|ProxPilotBackup"
```

## 5. Assign the required ACLs

Permissions must be assigned to both:

- The API user `dashboard@pve`
- The API token `dashboard@pve!dashboard`

This is important when token privilege separation is enabled. The effective token permissions are limited by the permissions available to both the user and the token.

### Root path

Assign `DashboardManager` to the API user:

```bash
pveum acl modify / \
  --users dashboard@pve \
  --roles DashboardManager \
  --propagate 1
```

Assign `DashboardManager` to the API token:

```bash
pveum acl modify / \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager \
  --propagate 1
```

### Virtual machine path

Assign both roles to the API user on `/vms`:

```bash
pveum acl modify /vms \
  --users dashboard@pve \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

Assign both roles to the API token on `/vms`:

```bash
pveum acl modify /vms \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

### Backup storage

Replace `YOUR-BACKUP-STORAGE` with the actual Proxmox storage ID used for backups.

Assign the backup role to the API user:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1
```

Assign the backup role to the API token:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --tokens 'dashboard@pve!dashboard' \
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
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotBackup \
  --propagate 1
```

## Important: both roles are required on `/vms`

Proxmox evaluates ACLs based on their resource paths.

Assigning only `ProxPilotBackup` directly to `/vms` can result in the API token having backup and snapshot permissions but not the required power-management permissions.

The effective permissions may then include:

```text
VM.Backup
VM.Snapshot
VM.Snapshot.Rollback
```

while missing:

```text
VM.PowerMgmt
VM.Migrate
```

Guest actions will then fail with an error similar to:

```text
Permission check failed (/vms/102, VM.PowerMgmt)
```

For this reason, both roles must be assigned on `/vms`:

```text
DashboardManager
ProxPilotBackup
```

## 6. Verify the effective permissions

Replace `100` with the VM ID or container ID of an existing guest:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/100
```

The effective permissions should include at least:

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

Check all ACL entries associated with the API user and token:

```bash
pveum acl list | grep dashboard
```

A typical configuration contains entries similar to:

```text
/                          DashboardManager  user   dashboard@pve
/                          DashboardManager  token  dashboard@pve!dashboard
/vms                       DashboardManager  user   dashboard@pve
/vms                       ProxPilotBackup    user   dashboard@pve
/vms                       DashboardManager  token  dashboard@pve!dashboard
/vms                       ProxPilotBackup    token  dashboard@pve!dashboard
/storage/YOUR-BACKUP-STORAGE ProxPilotBackup user   dashboard@pve
/storage/YOUR-BACKUP-STORAGE ProxPilotBackup token  dashboard@pve!dashboard
```

## 7. Configure SSH access

Some host functions require SSH because they execute operating-system commands directly on the Proxmox nodes.

These functions include:

- Reading detailed hardware information
- Reading physical disk information
- Reading ZFS details
- Reading temperature information
- Checking package updates
- Installing package updates
- Rebooting a Proxmox node
- Shutting down a Proxmox node

Create the local SSH directory in the ProxPilot project:

```bash
cd /path/to/proxpilot

mkdir -p ssh
chmod 700 ssh
```

Generate a dedicated SSH key:

```bash
ssh-keygen -t ed25519 \
  -C "ProxPilot" \
  -f ./ssh/id_ed25519
```

For unattended backend operations, leave the passphrase empty.

Copy the public key to every configured Proxmox node:

```bash
ssh-copy-id -i ./ssh/id_ed25519.pub root@PVE-NODE-1
ssh-copy-id -i ./ssh/id_ed25519.pub root@PVE-NODE-2
ssh-copy-id -i ./ssh/id_ed25519.pub root@PVE-NODE-3
```

Test access to every node:

```bash
ssh -i ./ssh/id_ed25519 root@PVE-NODE-1 "hostname"
ssh -i ./ssh/id_ed25519 root@PVE-NODE-2 "hostname"
ssh -i ./ssh/id_ed25519 root@PVE-NODE-3 "hostname"
```

Protect the private key:

```bash
chmod 600 ./ssh/id_ed25519
chmod 644 ./ssh/id_ed25519.pub
```

The `ssh/` directory is excluded by `.gitignore` and must never be committed.

## 8. Configure the environment file

Copy the provided example:

```bash
cp .env.example .env
```

Open `.env` and enter the values for your environment.

Example:

```dotenv
PVE_ENDPOINTS=https://pve1.example.com:8006,https://pve2.example.com:8006,https://pve3.example.com:8006
PVE_TOKEN_ID=dashboard@pve!dashboard
PVE_TOKEN_SECRET=your_api_token_secret
PVE_VERIFY_SSL=false
PVE_SSH_USER=root
PVE_SSH_KEY=/app/ssh/id_ed25519
PVE_SSH_PORT=22
PVE_NODE_HOSTS=pve1=192.168.1.11,pve2=192.168.1.12,pve3=192.168.1.13
REFRESH_INTERVAL=10
```

### Environment variables

#### PVE_ENDPOINTS

Comma-separated list of Proxmox API endpoints:

```dotenv
PVE_ENDPOINTS=https://pve1.example.com:8006,https://pve2.example.com:8006
```

Each entry must include:

- `https://`
- The hostname or IP address
- Proxmox API port `8006`

#### PVE_TOKEN_ID

Full Proxmox API token ID:

```dotenv
PVE_TOKEN_ID=dashboard@pve!dashboard
```

#### PVE_TOKEN_SECRET

Secret generated when the API token was created:

```dotenv
PVE_TOKEN_SECRET=your_api_token_secret
```

Never publish or commit this value.

#### PVE_VERIFY_SSL

Controls TLS certificate verification:

```dotenv
PVE_VERIFY_SSL=true
```

Use `true` when all Proxmox API certificates are trusted by the ProxPilot container.

For self-signed certificates in an isolated homelab, verification can be disabled:

```dotenv
PVE_VERIFY_SSL=false
```

Disabling certificate verification reduces protection against man-in-the-middle attacks.

#### PVE_SSH_USER

SSH account used for host-level maintenance operations:

```dotenv
PVE_SSH_USER=root
```

#### PVE_SSH_KEY

Path to the SSH private key inside the backend container:

```dotenv
PVE_SSH_KEY=/app/ssh/id_ed25519
```

#### PVE_SSH_PORT

SSH port used by the Proxmox nodes:

```dotenv
PVE_SSH_PORT=22
```

#### PVE_NODE_HOSTS

Mapping between Proxmox node names and their SSH addresses:

```dotenv
PVE_NODE_HOSTS=pve1=192.168.1.11,pve2=192.168.1.12,pve3=192.168.1.13
```

The names on the left side must match the node names reported by the Proxmox cluster.

#### REFRESH_INTERVAL

Frontend refresh interval in seconds:

```dotenv
REFRESH_INTERVAL=10
```

## 9. Build and start ProxPilot

Build the containers:

```bash
docker compose build
```

Start ProxPilot:

```bash
docker compose up -d
```

Check the container status:

```bash
docker compose ps
```

Follow the logs:

```bash
docker compose logs -f
```

Show only recent logs:

```bash
docker compose logs --tail=100
```

## 10. Open ProxPilot

Open the application in a browser:

```text
http://SERVER-IP:8085
```

Replace `SERVER-IP` with the address of the Docker host.

## 11. Verify the installation

After opening ProxPilot, verify the following pages:

- Dashboard
- Nodes
- Guests
- Storage
- Network
- Replications
- Backups
- Cluster
- Tasks
- Settings
- Host details

Also test the following actions:

- Start a stopped VM
- Shut down or stop a test VM
- Start a stopped container
- Open guest details
- Create and delete a test snapshot
- Open the node update dialog
- Open the About dialog

Do not test destructive actions against production workloads.

## API documentation

The FastAPI documentation is available through the frontend reverse proxy.

Swagger UI:

```text
http://SERVER-IP:8085/docs
```

ReDoc:

```text
http://SERVER-IP:8085/redoc
```

OpenAPI schema:

```text
http://SERVER-IP:8085/openapi.json
```

## Updating ProxPilot

Enter the project directory:

```bash
cd /path/to/proxpilot
```

Pull the latest changes:

```bash
git pull
```

Rebuild and restart the containers:

```bash
docker compose up -d --build
```

Check the status:

```bash
docker compose ps
```

Review the logs:

```bash
docker compose logs --tail=100
```

Remove unused Docker images when required:

```bash
docker image prune
```

## Stopping ProxPilot

Stop the running containers:

```bash
docker compose down
```

Start them again:

```bash
docker compose up -d
```

## Troubleshooting

### Guest actions fail with VM.PowerMgmt

Error:

```text
Permission check failed (/vms/VMID, VM.PowerMgmt)
```

Check the effective token permissions:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/VMID
```

If `VM.PowerMgmt` is missing, ensure that both roles are assigned to `/vms` for both the user and token:

```bash
pveum acl modify /vms \
  --users dashboard@pve \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1

pveum acl modify /vms \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

### API authentication fails

Confirm the configured token ID without exposing the secret:

```bash
grep '^PVE_TOKEN_ID=' .env
```

Confirm that the token exists:

```bash
pveum user token list dashboard@pve
```

Review the backend logs:

```bash
docker compose logs --tail=200 backend
```

### Proxmox API cannot be reached

Test access from the Docker host:

```bash
curl -k https://PVE-NODE:8006/api2/json/version
```

Check TCP connectivity:

```bash
nc -vz PVE-NODE 8006
```

### SSH functions fail

Test the same key manually:

```bash
ssh -i ./ssh/id_ed25519 root@PVE-NODE "hostname"
```

Verify the configured mapping:

```bash
grep '^PVE_NODE_HOSTS=' .env
```

Check the private key permissions:

```bash
ls -l ./ssh/id_ed25519
```

Expected permissions:

```text
-rw-------
```

Correct them when necessary:

```bash
chmod 600 ./ssh/id_ed25519
```

### Containers do not start

Check the Compose configuration:

```bash
docker compose config
```

Check container status:

```bash
docker compose ps -a
```

Review all logs:

```bash
docker compose logs --tail=200
```

Rebuild the project:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Security

ProxPilot can execute administrative actions against Proxmox nodes and guests.

It should only be exposed to trusted networks unless additional authentication and reverse-proxy security are configured.

Recommended precautions:

- Restrict access to trusted management networks
- Do not expose ProxPilot directly to the public internet
- Use a dedicated Proxmox API user
- Use a dedicated API token
- Apply only the required permissions
- Protect the API token secret
- Protect the SSH private key
- Never commit `.env`
- Never commit the `ssh/` directory
- Use trusted TLS certificates whenever possible
- Use HTTPS when accessing ProxPilot over untrusted networks
- Review permissions before allowing additional users to access the application
- Back up the configuration securely

## Technology stack

### Frontend

- React
- TypeScript
- Mantine UI
- Tabler Icons
- Vite

### Backend

- Python
- FastAPI
- Uvicorn

### Infrastructure

- Docker
- Docker Compose
- Nginx

## Project structure

```text
proxpilot/
├── backend/
│   ├── app/
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/
│   ├── public/
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.ts
├── ssh/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── LICENSE
└── README.md
```

## Roadmap

Possible future improvements include:

- Guest Agent filesystem usage
- Historical resource statistics
- Additional charts
- Notification support
- Multi-cluster support
- Authentication
- Role-based access control
- Additional storage details
- Additional guest operating-system information
- Automated API permission checks
- More detailed error diagnostics

## Contributing

Issues, bug reports and feature suggestions are welcome through GitHub Issues.

Before submitting an issue, include:

- ProxPilot version
- Proxmox VE version
- Docker and Docker Compose versions
- Relevant backend or frontend logs
- Steps required to reproduce the problem
- The exact error message

Do not include:

- API token secrets
- Private SSH keys
- Passwords
- Internal information that should not be published

## License

ProxPilot is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

## Disclaimer

ProxPilot is an independent open-source project.

It is not affiliated with, endorsed by or supported by Proxmox Server Solutions GmbH.

Proxmox and Proxmox VE are trademarks of Proxmox Server Solutions GmbH.
