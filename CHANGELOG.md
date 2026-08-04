# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [1.3.0] - 2026-08-04

### Added

- Optional authentication for the entire ProxPilot web interface
- Secure session-based login using HttpOnly cookies
- Login page with configurable username and password
- Logout support
- Authentication configuration through environment variables
- Authentication configuration added to `.env.example`

### Changed

- Introduced shared natural sorting utilities
- Unified node sorting across Dashboard, Nodes, Guests, Storage, Replications, Backups and Cluster pages
- Dashboard node cards are now read-only and serve as an overview

### Security

- Sensitive backend API endpoints now require authentication
- Configurable username and password are loaded from the local `.env` file
- Authentication uses cryptographically signed HttpOnly session cookies
- The real `.env` file remains excluded from Git

## [1.2.4] - 2026-07-31

### Fixed

- Automatically re-check for remaining package updates after a successful update installation
- Refresh the update cache after installation so the Nodes page no longer shows stale update counts
- Keep the update task active until installation and the follow-up check are complete

## [1.2.3] - 2026-07-31

### Changed

- Added a read-only mode for node cards on the Dashboard
- Removed administrative node actions from the Dashboard
- Hidden update and reboot-required badges from Dashboard node cards
- Kept all node management actions exclusively on the Nodes page

## [1.2.2] - 2026-07-30

### Fixed

- Fixed HA maintenance mode detection for Proxmox VE 9
- Maintenance status is now correctly reported in the dashboard API
- Fixed maintenance state used by node actions and shutdown safety checks

## [1.2.1] - 2026-07-30

### Added

- Cluster summary on the Nodes page
- Cluster-wide CPU usage with weighted utilization calculation

### Changed

- CPU summary now displays the total number of CPU cores
- Centralized application metadata in `frontend/src/config/app.ts`
- About dialog now uses centralized application metadata
- Fixed GitHub repository link in the About dialog
- Version information is now automatically read from the frontend package version
- Natural node sorting (`pve`, `pve2`, `pve3`, ...) on the Dashboard and Nodes pages

## [1.2.0] - 2026-07-30

### Added

- Package cleanup action for Proxmox nodes (`apt autoremove` + `apt autoclean`)
- Maintenance mode enable and disable actions
- Dedicated "Node Actions" documentation in the README

### Changed

- Improved layout of node action buttons
- Extended feature overview in the README
- Version bumped to 1.2.0

## [1.1.0] - 2026-07-30

### Added

- Node management actions
- Package update management
- Reboot and shutdown actions

## [1.0.1] - 2026-07-30

### Changed

- Bug fixes
- Documentation improvements

## [1.0.0] - 2026-07-30

### Added

- Initial public release
