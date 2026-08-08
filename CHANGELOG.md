# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [1.5.1] - 2026-08-08

### Added

- Integrated browser console support for LXC containers
- Unified console support for both QEMU virtual machines and LXC containers

### Changed

- Guest details now allow opening the integrated browser console for supported LXC containers
- Console handling has been generalized to support multiple guest types through a shared implementation

### Fixed

- Enabled the integrated browser console button for running LXC containers
- Preserved existing role-based console permissions for Administrator and Operator users
- No changes to the required Proxmox API permissions (`VM.Console` continues to be sufficient)

## [1.5.0] - 2026-08-07

### Added

#### Audit

- Comprehensive audit logging framework
- Dedicated Audit Log page
- Detailed audit event dialog with structured JSON details
- CSV export of filtered audit events
- JSON export of filtered audit events
- Audit summary with total events, warnings, errors and failed operations
- Configurable audit retention period
- Automatic cleanup of expired audit entries
- Dynamic audit filter values
- Multi-select filtering across all audit categories
- Context-aware filter suggestions that automatically adapt to the currently selected filters
- Audit logging for:
  - Authentication
  - User management
  - LDAP configuration changes
  - LDAP connection tests
  - Guest actions
  - Guest migrations
  - Guest backups
  - Manual backup execution
  - Snapshot creation, rollback and deletion
  - Node maintenance mode
  - Node actions
  - Console sessions
  - Audit retention configuration changes

#### Virtual Machines

- Guest Agent information
- Guest disk usage analysis
- Guest filesystem information
- Additional guest runtime information
- Extended guest details drawer

#### Storage

- ZFS pool health overview
- Detailed ZFS pool information
- SMART warning detection
- Improved storage information

#### Permissions

- Operator role between Administrator and Viewer
- Shared operator-aware UI components
- Operator-aware backend permission enforcement

### Changed

#### Tasks

- Improved task detection
- Improved task categorization
- Better task presentation
- Better activity panel integration

#### User Interface

- Improved guest details page
- Expanded host details page
- Enhanced Storage page
- Enhanced ZFS page
- Improved Activity Panel
- Improved permission-aware action buttons
- Improved audit filtering experience

#### Authentication

- Operator permissions implemented consistently throughout frontend and backend
- Updated authentication model to support Administrator, Operator and Viewer roles

#### API

- Added Audit API endpoints
- Added audit summary endpoint
- Added audit export endpoints
- Added audit filter endpoint
- Extended guest information endpoints
- Extended host details endpoints
- Extended storage information endpoints
- Extended task information returned by the backend
- Administrative endpoints now generate comprehensive audit events

### Security

- All privileged operations are now fully audited
- Audit events now include user, role, authentication source, client IP, target object, node and structured metadata
- LDAP bind passwords continue to remain protected and are never returned by the API
- Operator permissions are enforced independently in frontend and backend

### Fixed

- Numerous permission inconsistencies between Administrator, Operator and Viewer
- Missing audit events for several administrative operations
- Various task handling inconsistencies
- Multiple guest information inconsistencies
- Storage and ZFS presentation improvements
- Various frontend consistency issues
- Various backend robustness improvements

### Documentation

- Expanded API documentation
- Updated authentication documentation
- Updated configuration documentation
- Updated development documentation
- Updated installation documentation
- Updated reverse proxy documentation
- Updated README
- General documentation polish

## [1.4.1] - 2026-08-06

### Changed

- Removed the Watchtower exclusion labels from the public production Compose configuration
- Production deployments can now receive automatic image updates through Watchtower
- The development Compose configuration continues to disable Watchtower for local development

## [1.4.0] - 2026-08-05

### Added

- Persistent SQLite database for ProxPilot users and application settings
- Local user management with administrator and viewer roles
- User creation, role changes, enable/disable controls, password changes and deletion
- Protection against disabling or deleting the last enabled administrator
- Protection against disabling the currently signed-in administrator account
- Reusable administrator-only frontend controls
- Backend role enforcement for administrative API routes
- Optional LDAP and Active Directory authentication
- LDAP configuration through the Settings page
- LDAP connection testing before saving settings
- Support for LDAPS, StartTLS and TLS certificate verification
- LDAP bind account, Base DN and configurable user filter support
- Optional LDAP administrator and viewer group mappings
- Local administrator fallback when LDAP is enabled
- System information panel with runtime, database and authentication details
- Browser-based noVNC console for running QEMU virtual machines
- Dedicated full-screen console page opened in a separate browser tab
- Console controls for scaling, remote resize, fullscreen, Ctrl+Alt+Del, reconnect and disconnect
- Short-lived backend-managed console sessions
- Node-specific Proxmox VNC proxy creation
- WebSocket proxy between the browser and the Proxmox VNC endpoint
- `VM.Console` permission documentation
- HTTPS and reverse-proxy requirements for the integrated console
- `websockets`, `ldap3`, `argon2-cffi` and related backend dependencies
- `@novnc/novnc` frontend dependency

### Changed

- Authentication moved from a single environment-defined account to database-backed users
- Existing local authentication remains the first login method
- LDAP authentication is attempted only when local authentication fails and LDAP is enabled
- Existing local users continue to work when LDAP is enabled
- Administrative actions are now restricted consistently in both frontend and backend
- Viewer users can inspect the interface but cannot execute guest, node, backup, snapshot, migration, update, console or user-management actions
- Guest backup, snapshot and migration controls now use administrator-aware components
- Node actions and update controls now enforce administrator permissions
- Manual backup execution on the Backups page now requires administrator access
- Users navigation is hidden from viewers
- Settings page expanded with LDAP and system-information sections
- Guest details drawer expanded with console access and administrator-aware controls
- Proxmox VNC ticket creation now targets the node that currently hosts the VM
- Vite development proxy now supports WebSocket traffic under `/api`
- Vite development server can run behind arbitrary reverse-proxy hostnames
- README rewritten to document the current architecture, permissions, roles, LDAP, console security, HTTPS and reverse-proxy requirements

### Security

- Administrative backend routes return HTTP `403` for viewer sessions
- Session role is validated independently for WebSocket console connections
- Console sessions use short-lived one-time identifiers
- The permanent Proxmox API token remains backend-only
- Short-lived Proxmox VNC tickets are delivered only to authenticated administrators over HTTPS
- Passwords for local users are stored using Argon2 hashes
- LDAP bind passwords are not returned by the settings API
- Existing local accounts cannot be replaced by same-named LDAP accounts
- The last enabled administrator cannot be removed or disabled
- Secure-cookie support remains configurable for HTTPS deployments

### Fixed

- Prevented viewer access to snapshot, backup, migration, node update and manual backup actions through alternate UI paths
- Prevented duplicate `AdminButton` imports introduced during permission-control changes
- Removed the obsolete module placeholder shown below the Users page
- Fixed LDAP settings visibility in the Settings page
- Fixed LDAP connection testing so unsaved form values can be tested
- Fixed noVNC package resolution with Vite by using the package root export
- Fixed noVNC startup behind the Vite development server after dependency installation
- Fixed WebSocket forwarding for console traffic under `/api`
- Fixed VNC proxy failures caused by creating the ticket through a different Proxmox node
- Fixed missing VNC credentials during the RFB security handshake
- Fixed console access over HTTPS through a WebSocket-capable reverse proxy

### Known limitations

- The integrated console currently supports QEMU virtual machines only
- The integrated console requires HTTPS and a WebSocket-capable reverse proxy
- LDAP functionality has been implemented but still requires validation against the target directory environment
- LXC terminal support is not currently implemented

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
