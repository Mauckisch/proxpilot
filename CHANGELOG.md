# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## \[2.3.1\] - 2026-08-13

### Fixed

-   Fixed the node shutdown confirmation showing the HA maintenance-mode
    warning for standalone Proxmox hosts.
-   The maintenance-mode warning is now shown only when shutting down a
    node that belongs to a Proxmox cluster and is not currently in
    maintenance mode.

## \[2.3.0\] - 2026-08-13

### Added

-   Added cross-infrastructure migration for stopped QEMU virtual
    machines between independently managed Proxmox infrastructures.
-   Added selection of the target infrastructure, target node, target
    VMID, target storage and target network bridge for remote guest
    migrations.
-   Added a dedicated remote-migration preflight check before any
    migration operation is started.
-   Added preflight validation for target infrastructure availability,
    target-node state, VMID conflicts, CPU architecture, available
    memory, target storage, storage capacity and target network bridge.
-   Added storage-transfer compatibility detection for remote
    migrations.
-   Added staged storage migration for storage combinations that cannot
    be transferred directly by Proxmox remote migration.
-   Added automatic temporary movement of guest disks to compatible
    staging storage before the remote migration.
-   Added automatic restoration of staged source disks to their
    original storage after the remote migration has completed.
-   Added automatic cleanup of temporary staging-storage entries and
    source migration locks.
-   Added managed multi-stage migration tasks so preparation, remote
    migration and cleanup can be tracked as one ProxPilot operation.
-   Added migration progress and task-log reporting while multi-stage
    remote migrations are running.
-   Added support for monitoring ProxPilot-managed migration tasks before
    the final Proxmox migration UPID exists.

### Changed

-   Extended the Proxmox migration backend with support for the
    `remote_migrate` API and remote target endpoint configuration.
-   Remote migration now verifies storage compatibility and can
    transparently use a supported staging path when the source and target
    storage types are incompatible.
-   Temporary disk moves used for staging and restoration now remove the
    obsolete source volume after a successful move instead of leaving
    duplicate storage volumes behind.
-   The guest migration interface now displays remote-migration warnings
    returned by the preflight check before the user confirms the
    operation.
-   Increased the frontend API request timeout from 15 seconds to
    30 seconds to allow longer migration preflight requests to complete.
-   Replaced the raw ProxPilot SSH public key field in infrastructure
    settings with a ready-to-run SSH setup command.
-   The SSH setup command now creates `~/.ssh` and
    `authorized_keys` when required, applies the correct permissions and
    adds the ProxPilot public key only when it is not already present.

### Fixed

-   Fixed remote migration progress not appearing while disks were being
    prepared on staging storage.
-   Fixed multi-stage migrations waiting synchronously for disk staging
    before returning a trackable task to the frontend.
-   Fixed storage preflight details referencing an obsolete
    `storage_status` variable.
-   Fixed successful staged migrations leaving the source VM disk on the
    temporary staging storage.
-   Fixed successful source-storage restoration leaving duplicate
    temporary disk volumes behind.
-   Fixed source VMs potentially remaining migration-locked after a
    completed cross-infrastructure migration.

## \[2.1.0\] - 2026-08-12

### Added

-   Added guest restore from available Proxmox backup archives for QEMU
    virtual machines and LXC containers.
-   Added discovery and selection of available backup archives for the
    selected guest.
-   Added optional target-storage selection for guest restores.
-   Added an option to start the guest automatically after a successful
    restore.
-   Added guest restore as a Task Scheduler action.
-   Added snapshot rollback as an interactive and scheduled operation.
-   Added validation for scheduled guest restore tasks, including the
    selected archive, optional target storage and start-after-restore
    setting.
-   Added backend handling for guest status and HA state during guest
    restore operations.
-   Added Proxmox task monitoring for guest restore and other tracked
    Proxmox activities.
-   Added the `ProxPilotSDN` role documentation with the `SDN.Use`
    privilege for environments where ProxPilot needs to use SDN-managed
    network resources.

### Changed

-   Extended snapshot handling and notifications to distinguish snapshot
    creation, deletion and rollback operations.
-   Extended the Task Scheduler to configure guest restore and snapshot
    rollback operations.
-   Guest targets in the Task Scheduler are now displayed by guest name
    when the guest can be resolved; the technical QEMU/LXC VMID remains
    as a fallback.
-   Guest targets in the Audit Log are now resolved dynamically to guest
    names when possible, including existing audit entries; the original
    technical target remains as a fallback.
-   Extended guest restore handling with explicit destructive-operation
    safeguards and restore-state tracking.
-   Updated README and installation documentation for the 2.1.0 feature
    set, including guest restore, scheduled restore, snapshot rollback
    and SDN role requirements.

## [2.0.4] - 2026-08-12

### Changed

- Redesigned the Users settings view from a wide table into individual responsive user cards.
- User information is now grouped more clearly by role, authentication source, account status, creation date and last login.
- User actions are now displayed below each user instead of in a dedicated table column.
- Improved the Users settings layout for narrower application widths.
- Replaced the manual migration target-storage input with a selectable list of compatible storages available on the selected target node.
- Added a Default migration storage option that preserves Proxmox automatic storage mapping.
- The Default migration storage option now shows the storage or storages currently used by the guest when that information is available.
- Migration storage choices are refreshed automatically when the target node changes.

### Fixed

- Fixed user action buttons being clipped when the available content width was too small.
- Removed the need for horizontal scrolling in the Users settings view.
- Fixed migration target storage requiring a manually entered storage name.
- Prevented stale migration storage selections from remaining selected after changing the target node.

## [2.0.3] - 2026-08-12

### Changed

- Redesigned the Task Scheduler from a wide table into individual responsive task cards.
- Task details are now grouped more clearly by infrastructure, action, target, schedule, next run, last result, status and creator.
- Task actions are now displayed below each scheduled task instead of in a dedicated table column.
- The Task Scheduler no longer requires horizontal scrolling for normal desktop layouts.
- The Run now action is now displayed as a dedicated green button.
- Enable and disable remain separate toggle controls and only control the scheduled task state.

### Fixed

- Fixed the Task Scheduler layout being clipped on narrower application widths.
- Fixed task action controls being difficult to access when the scheduler table exceeded the available content width.
- Fixed an invalid frontend task-result comparison that caused the TypeScript build to fail.

## [2.0.2] - 2026-08-11

### Changed

- Notification event preferences now use toggle switches with immediate autosave instead of checkboxes and a separate save action.
- The desktop navigation is now permanently expanded and the obsolete navigation-collapse setting has been removed.
- Improved the application header layout with a full-height separator aligned with the navigation sidebar.
- Header and navigation separators now consistently use the ProxPilot border color.
- Updated the application subtitle from `Proxmox Homelab Control` to `Proxmox Infrastructure Management` to better reflect support for both homelab and professional Proxmox environments.

### Fixed

- Fixed inconsistent notification event controls and removed the redundant manual event-settings save step.
- Fixed header/sidebar separator alignment and coloring.

## [2.0.1] - 2026-08-11

### Added

- Added dedicated notification events for successful and failed guest migrations.
- Added dedicated notification events for successful and failed maintenance mode operations.
- Added configurable Email and Discord notification preferences for migration and maintenance events.

### Changed

- Improved snapshot notifications to clearly distinguish between snapshot creation and deletion.
- Snapshot notifications now include the performed operation and snapshot name.
- Improved migration notifications to show both the source and target node.
- Improved maintenance mode notifications to clearly indicate whether maintenance mode was enabled or disabled.
- Improved operation notifications with more contextual information about the affected infrastructure, node, guest, and action.

### Fixed

- Fixed ambiguous snapshot notifications that previously did not indicate whether a snapshot was created or deleted.
- Fixed missing operation context in maintenance mode notifications.
- Fixed missing source-node information in migration notifications.

## [2.0.0] - 2026-08-11

### Added

- Added configurable notification delivery through Discord webhooks and email/SMTP.
- Added per-event notification routing so administrators can choose independently which events are sent through email and Discord.
- Added notification events for node availability, available updates, update installation results, package cleanup results, reboot requirements, guest backups, snapshots and Task Scheduler execution results.
- Added task-aware notification summaries with meaningful operational content instead of generic success messages.
- Added aggregated cluster notifications for multi-node update checks, update installations and package cleanup.
- Added delivery status information to task output for notification-enabled operations.
- Added global Regional settings with selectable timezone configuration.
- Added multi-node scheduled tasks for update checks, update installation and package cleanup.
- Added a partial task state for multi-node operations where only some nodes complete successfully.
- Added aggregate audit entries for multi-node node operations.
- Added horizontal scrolling to the Task Scheduler table for smaller displays.

### Changed

- Regional settings are now restricted to administrators.
- Infrastructure configuration is now administrator-only while Viewer accounts retain read-only visibility.
- Notification configuration is administrator-only.
- Notification channel enable/disable switches now save immediately instead of requiring an additional Save action.
- Task Scheduler node selection now supports multiple nodes only for update checks, update installation and package cleanup.
- Reboot, shutdown and maintenance operations are restricted to a single node and cannot be configured as multi-node scheduled actions.
- Multi-node tasks are now represented as one logical task instead of separate top-level tasks for every node.
- Multi-node task notifications now show individual nodes and results in natural node order.
- Scheduled-task notifications now display all configured node targets instead of an unknown or single-node placeholder.
- Task and Activity views now recognize and display partial task completion.
- Node ordering now uses natural sorting so names such as `pve`, `pve2` and `pve3` appear in the expected order.
- Application version updated to 2.0.0.

### Fixed

- Fixed notification events not being delivered because the configured channel enable state had not been persisted.
- Fixed scheduled-task notifications not being emitted correctly after manual `Run now` executions.
- Fixed duplicate per-node notifications during aggregate multi-node scheduler operations.
- Fixed multi-node scheduled tasks displaying `Unknown node` as their target.
- Fixed Task Scheduler tables being clipped without horizontal scrolling.
- Fixed frontend task-state handling after introducing the partial state.
- Fixed TypeScript build errors caused by incomplete partial-state handling.
- Fixed stale single-node state references after converting scheduler node selection to multi-select.

### Security

- Added backend validation to prevent unsafe multi-node node actions from being created through direct API requests.
- Multi-node execution is explicitly limited to update checks, update installation and package cleanup.
- Power and maintenance actions remain single-node operations even if a crafted request attempts to supply multiple targets.

## [1.7.2] - 2026-08-10

### Added

- Added automatic generation of a persistent Ed25519 SSH key pair during ProxPilot startup when no SSH key exists yet.
- Added an API endpoint for retrieving the ProxPilot SSH public key.
- Added the ProxPilot SSH public key to the infrastructure setup dialog with a copy-to-clipboard action for easier host enrollment.
- Added automatic reconstruction of a missing public key from an existing Ed25519 private key.

### Changed

- New infrastructures now automatically use the managed ProxPilot SSH private key at `/app/ssh/id_ed25519`.
- SSH key storage is persisted through the existing `./ssh:/app/ssh` Docker volume mount.
- Infrastructure setup no longer requires users to manually enter the SSH private key path.

### Security

- Automatically generated SSH private keys are stored with `0600` permissions and public keys with `0644` permissions.
- Existing SSH key pairs are preserved and are never silently regenerated or replaced.
- ProxPilot refuses to silently generate a replacement private key when only a public key exists, preventing accidental loss of SSH trust relationships.

## [1.7.1] - 2026-08-09

### Fixed

- Fixed scheduled snapshot deletion failing because the Task Scheduler called a non-existent Proxmox client method instead of the existing snapshot listing method.

## [1.7.0] - 2026-08-09

### Added

- Added support for managing multiple Proxmox infrastructures in a single ProxPilot installation.
- Added support for both Proxmox clusters and standalone Proxmox nodes.
- Added infrastructure management in Settings for configuring API access, nodes and infrastructure-specific connection settings.
- Added infrastructure-aware handling throughout dashboards, nodes, guests, storage, backups, snapshots, replication, networking, console access, tasks, updates, audit logging and the Task Scheduler.
- Added infrastructure IDs to runtime tasks and update status tracking to keep nodes with identical names isolated between infrastructures.

### Changed

- Proxmox API credentials, API endpoints, SSL verification and node connection settings are now stored per infrastructure instead of being configured globally through environment variables.
- Proxmox API clients now require an explicit infrastructure and obtain their connection configuration from the infrastructure database.
- Node and guest operations now explicitly carry their infrastructure context from the frontend through the API to the Proxmox client.
- Task Scheduler executions now retain the infrastructure context of their configured target.
- Update tracking and node update locks are now scoped by infrastructure and node.
- Simplified `.env` configuration by removing the legacy `PVE_*` Proxmox settings.
- Added `TZ` to the example application environment configuration.

### Fixed

- Fixed network interface IP addresses not being displayed after the infrastructure refactoring by aligning the frontend network address model with the backend API response.
- Fixed infrastructure context propagation for Proxmox operations that could otherwise become ambiguous when multiple infrastructures contain similarly named nodes.

## [1.6.1] - 2026-08-08

### Fixed

- Fixed Task Scheduler audit log targets to display the actual Proxmox node or guest target instead of the scheduled task name.

## [1.6.0] - 2026-08-08

### Added

- Added a new Task Scheduler for automated Proxmox operations.
- Added support for one-time and recurring scheduled tasks with intervals in minutes, hours, days, weeks and months.
- Added scheduled guest power actions, migrations, backups and snapshot operations.
- Added scheduled node update checks, update installation, package cleanup, reboot, shutdown and maintenance mode operations.
- Added manual "Run now" execution for scheduled tasks without modifying their configured schedule.
- Added execution tracking for scheduled and manually triggered scheduler runs.
- Added Task Scheduler integration with the Activity panel.
- Added dedicated audit logging for scheduler configuration changes and executions.
- Added role-based Task Scheduler permissions: viewers have read-only access while operators and administrators can manage and execute tasks.
- Added Task Scheduler action allowlisting to prevent scheduling of user, authentication and LDAP management operations.
- Added a centered clock to the application header using the browser timezone.
- Added configurable 12-hour and 24-hour time display in Settings.
- Added English calendar controls and international date formatting.

### Changed

- Docker timezone configuration now uses a neutral default instead of assuming a specific geographic timezone.
- Scheduled background executions are explicitly identified as system/scheduler actions in audit and activity information.
- One-time scheduled tasks are automatically completed and disabled after execution, including failed executions.

## [1.5.2] - 2026-08-08

### Added

- Added UPS monitoring for Proxmox nodes using Network UPS Tools (NUT)
- Added a dedicated UPS tab to the node details page
- Automatically detects NUT netclient configuration on each node
- Reads the configured NUT monitor targets directly from the existing host configuration
- Displays the complete values returned by `upsc`
- Supports multiple monitored UPS devices per node
- Added color-coded UPS status information

### Changed

- UPS information is collected through the existing SSH host-details connection
- UPS monitoring requires no additional ProxPilot configuration
- The UPS tab is only displayed when a working NUT netclient is detected on the node

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
