<p align="center">
  <img src="frontend/public/branding/proxpilot-icon.svg" alt="ProxPilot logo" width="128">
</p>

<h1 align="center">ProxPilot</h1>

<p align="center">
  A modern web interface for managing Proxmox VE homelabs.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/platform-Proxmox%20VE-orange" alt="Proxmox VE">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

---

## Overview

ProxPilot is a modern web interface for Proxmox VE designed primarily for homelab environments.

It does not attempt to replace the official Proxmox VE interface. Instead, it provides a focused and responsive overview of frequently used cluster information and day-to-day management functions.

ProxPilot combines cluster status, node details, virtual machines, containers, storage, networking, backups, replication and task monitoring in one interface.

## Features

### Dashboard

- Cluster status overview
- Online and offline node status
- Virtual machine and container overview
- Storage overview
- Resource usage
- Cluster health indication
- Responsive layout
- Light and dark modes

### Nodes

- Node status and resource overview
- CPU information
- Memory information
- Hardware details
- Physical disks and partitions
- ZFS information
- Temperature monitoring
- Network information
- Update checks
- Manual update installation
- Node reboot
- Node shutdown

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
- Storage content types
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

### Cluster

- Cluster member overview
- Node status
- HA service information
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

## Screenshots

Screenshots will be added before the first public release.

## Requirements

- Proxmox VE
- Docker Engine
- Docker Compose
- Network access from the ProxPilot backend to the Proxmox API
- Proxmox API token with the required permissions
- SSH access for node maintenance features that require shell commands

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/proxpilot.git
cd proxpilot
```

Create and configure the environment file:

```bash
cp .env.example .env
```

Open `.env` and configure the Proxmox API and SSH connection settings.

Build and start ProxPilot:

```bash
docker compose up -d --build
```

Check the container status:

```bash
docker compose ps
```

View the logs:

```bash
docker compose logs --tail=100
```

Open ProxPilot in a browser:

```text
http://SERVER-IP:8085
```

## Updating

Pull the latest project files:

```bash
git pull
```

Rebuild and restart the containers:

```bash
docker compose up -d --build
```

Remove unused Docker images when required:

```bash
docker image prune
```

## Configuration

ProxPilot consists of three main components:

- React and Mantine frontend
- FastAPI backend
- Nginx web server and reverse proxy

The browser communicates only with the ProxPilot backend through the included Nginx proxy.

The Proxmox API credentials are used by the backend and are not exposed directly to the browser.

Sensitive values should only be stored in `.env` and should never be committed to Git.

## Proxmox permissions

The configured API token requires sufficient privileges for the functions that should be available through ProxPilot.

Read-only monitoring functions require permissions for resources such as:

- Cluster
- Nodes
- Guests
- Storage
- Tasks
- Backups
- Replication

Management actions such as starting guests, creating snapshots, migrating guests or running backups require additional permissions.

Use the least privileged Proxmox role that still provides the functions required in your environment.

## SSH access

Some node maintenance functions use SSH because they execute operating-system commands directly on the Proxmox hosts.

Examples include:

- Checking available package updates
- Installing package updates
- Rebooting a node
- Shutting down a node
- Reading detailed host hardware information

SSH keys and credentials must not be committed to the repository.

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

## API documentation

When ProxPilot is running, the backend API documentation is available through the frontend proxy:

```text
http://SERVER-IP:8085/docs
```

The OpenAPI schema is available at:

```text
http://SERVER-IP:8085/openapi.json
```

The alternative ReDoc interface is available at:

```text
http://SERVER-IP:8085/redoc
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

## Security

ProxPilot can execute administrative actions against Proxmox nodes and guests.

It should therefore only be exposed to trusted networks unless additional authentication and reverse-proxy security are configured.

Recommended precautions:

- Restrict network access
- Use dedicated API tokens
- Apply least-privilege permissions
- Protect SSH private keys
- Do not commit `.env`
- Use HTTPS when accessing ProxPilot over untrusted networks
- Review permissions before exposing the application to additional users

## License

ProxPilot is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

## Disclaimer

ProxPilot is an independent open-source project.

It is not affiliated with, endorsed by or supported by Proxmox Server Solutions GmbH.

Proxmox and Proxmox VE are trademarks of Proxmox Server Solutions GmbH.
