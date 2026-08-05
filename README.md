<p align="center">
  <img src="frontend/public/branding/proxpilot-logo.svg" alt="ProxPilot Logo" width="560">
</p>

<h1 align="center">ProxPilot</h1>

<p align="center">
A modern, lightweight web interface for monitoring and managing Proxmox VE clusters and homelabs.
</p>

<p align="center">

![License](https://img.shields.io/github/license/Mauckisch/proxpilot)
![Release](https://img.shields.io/github/v/release/Mauckisch/proxpilot)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![React](https://img.shields.io/badge/React-TypeScript-61DAFB)
![Proxmox](https://img.shields.io/badge/Platform-Proxmox%20VE-orange)

</p>

---

# Overview

ProxPilot is an open-source management interface for **Proxmox VE**.

It complements the native Proxmox interface by providing a clean dashboard, simplified daily administration, integrated monitoring and commonly used management actions.

---

# Highlights

- Modern React interface
- FastAPI backend
- Docker deployment
- Local and LDAP authentication
- Integrated noVNC browser console
- VM and LXC management
- Snapshot and backup management
- Node maintenance
- Update management
- Storage and cluster overview

---

# Screenshots

> Screenshots will be added in a future release.

---

# Architecture

```text
Browser
   │
   ▼
Reverse Proxy (optional)
   │
   ▼
Frontend (React)
   │
   ▼
Backend (FastAPI)
   ├── Proxmox API
   ├── SSH
   └── SQLite
```

---

# Quick Start

```bash
git clone https://github.com/Mauckisch/proxpilot.git
cd proxpilot
cp .env.example .env
docker compose up -d --build
```

Configure `.env` before starting.

---

# Documentation

| Document | Description |
|-----------|-------------|
| docs/INSTALLATION.md | Installation |
| docs/CONFIGURATION.md | Configuration |
| docs/API-PERMISSIONS.md | Required Proxmox permissions |
| docs/AUTHENTICATION.md | Local users & LDAP |
| docs/HTTPS_AND_REVERSE_PROXY.md | HTTPS and reverse proxies |
| docs/TROUBLESHOOTING.md | Troubleshooting |
| docs/DEVELOPMENT.md | Development |

---

# Requirements

- Proxmox VE
- Docker Engine
- Docker Compose
- API token
- SSH access

---

# Roadmap

- Historical statistics
- Notifications
- Multi-cluster support
- Additional charts
- RBAC improvements

---

# Why ProxPilot?

ProxPilot was created to simplify the daily administration of Proxmox VE environments.

The official Proxmox VE interface is extremely powerful and exposes every available feature of the platform. For day-to-day administration, however, many users repeatedly navigate through the same menus to perform common tasks.

ProxPilot focuses on these everyday operations and presents them in a clean, modern interface while continuing to use the official Proxmox API and SSH.

## Design Goals

- Fast access to common operations
- Clean, responsive interface
- Safe administration
- Easy deployment with Docker
- Works with single-node and clustered environments
- Modern authentication
- Open source

---

# Why not replace the Proxmox interface?

ProxPilot is **not** intended to replace the official Proxmox VE web interface.

Instead it complements it.

The official interface remains the best choice for advanced cluster configuration, storage creation, networking, firewall configuration and every feature provided by Proxmox VE.

ProxPilot focuses on operational tasks:

- Monitor cluster health
- Manage guests
- Perform maintenance
- Execute backups
- Open browser consoles
- View hardware information
- Review tasks
- Manage users

---

# Feature Matrix

| Area | Supported |
|------|:---------:|
| Dashboard | ✅ |
| Cluster overview | ✅ |
| Node overview | ✅ |
| VM management | ✅ |
| LXC management | ✅ |
| Guest power actions | ✅ |
| Live migration | ✅ |
| Snapshots | ✅ |
| Backups | ✅ |
| Browser console (noVNC) | ✅ |
| Storage overview | ✅ |
| Network overview | ✅ |
| Replication overview | ✅ |
| HA overview | ✅ |
| Package updates | ✅ |
| Maintenance mode | ✅ |
| Hardware information | ✅ |
| ZFS information | ✅ |
| Temperature monitoring | ✅ |
| Local users | ✅ |
| LDAP authentication | ✅ |
| Role management | ✅ |

---

# Detailed Features

## Dashboard

The dashboard combines the most important cluster information on a single page.

Highlights include:

- Cluster summary
- Node status
- Resource utilisation
- Running guests
- Storage usage
- Recent activity

## Nodes

Each node provides:

- CPU
- Memory
- Storage
- Update status
- Hardware details
- Physical disks
- ZFS pools
- Temperatures
- Network interfaces

Administrative actions include:

- Install updates
- Package cleanup
- Maintenance mode
- Reboot
- Shutdown

## Guests

Supported operations:

- Start
- Stop
- Shutdown
- Reset
- Suspend
- Resume
- Migration
- Snapshots
- Manual backups
- Configuration viewer
- Integrated browser console

## Storage

Displays:

- Total capacity
- Used capacity
- Free capacity
- Storage type
- Shared/local status
- Supported content types

## Network

Provides:

- Bridges
- Physical interfaces
- VLAN interfaces
- Guest network assignments
- Relationship visualisation

## Replication

Displays:

- Replication jobs
- Source node
- Target node
- Schedule
- Status

## Cluster & HA

Overview of:

- Cluster members
- HA resources
- Guest distribution
- Node availability

## Tasks

Task monitoring includes:

- Running tasks
- Completed tasks
- Exit status
- Task log output

## Authentication

Supports:

- Local users
- LDAP
- Secure session cookies
- Administrator/User roles

## Browser Console

The integrated noVNC console allows direct browser access to guests without opening the Proxmox interface.

HTTPS is recommended to ensure secure WebSocket communication and Secure cookie support.

---

# Installation

The complete installation guide is available in:

- `docs/INSTALLATION.md`

Configuration details:

- `docs/CONFIGURATION.md`

Required Proxmox permissions:

- `docs/API-PERMISSIONS.md`

Authentication:

- `docs/AUTHENTICATION.md`

HTTPS and reverse proxies:

- `docs/HTTPS_AND_REVERSE_PROXY.md`

Troubleshooting:

- `docs/TROUBLESHOOTING.md`

Development:

- `docs/DEVELOPMENT.md`

---

# Project Structure

```text
proxpilot/
├── backend/
├── frontend/
├── docs/
├── ssh/
├── data/
├── docker-compose.yml
├── .env.example
├── README.md
└── CHANGELOG.md
```

---

# Documentation

| Document | Description |
|----------|-------------|
| INSTALLATION.md | Complete installation guide |
| CONFIGURATION.md | Environment variables |
| API-PERMISSIONS.md | Required Proxmox permissions |
| AUTHENTICATION.md | Local users and LDAP |
| HTTPS_AND_REVERSE_PROXY.md | Reverse proxy configuration |
| TROUBLESHOOTING.md | Common problems |
| DEVELOPMENT.md | Development and release workflow |

---

# FAQ

### Does ProxPilot replace the official Proxmox interface?

No. It complements the official interface by focusing on everyday administration.

### Is HTTPS required?

Strongly recommended.

The integrated browser console works best with HTTPS and Secure cookies.

### Is LDAP required?

No.

Local authentication works without LDAP.

### Where are users stored?

Local users are stored inside:

```text
./data/proxpilot.db
```

---

# Roadmap

Planned improvements include:

- Historical metrics
- Notifications
- Better charts
- Guest agent information
- Multi-cluster support
- Additional storage information
- Extended RBAC

---

# Contributing

Contributions are welcome.

Before opening an issue, include:

- ProxPilot version
- Proxmox VE version
- Docker version
- Browser
- Logs
- Reproduction steps

Never publish:

- API token secrets
- Passwords
- SSH private keys
- SQLite databases

---

# Support

Please use GitHub Issues for:

- Bug reports
- Feature requests
- Documentation improvements

---

# License

ProxPilot is licensed under the MIT License.

See `LICENSE` for details.

---

# Disclaimer

ProxPilot is an independent open-source project.

It is not affiliated with, endorsed by or supported by Proxmox Server Solutions GmbH.
