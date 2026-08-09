# ProxPilot Authentication Guide

This document explains authentication, user management, role-based access control,
LDAP / Active Directory integration, session handling, infrastructure permissions,
Task Scheduler permissions, and authentication-related audit logging in ProxPilot 1.7.0.

---

# Overview

ProxPilot supports:

- Local authentication
- LDAP / Active Directory authentication
- Session-based authentication using signed HttpOnly cookies
- Three built-in roles:
  - Administrator
  - Operator
  - Viewer
- LDAP group-to-role mapping
- Local administrator fallback
- Persistent user storage in SQLite
- Audit logging for authentication and user-management actions
- Role-based infrastructure management
- Role-based Task Scheduler management
- Role-based browser console access for QEMU virtual machines and LXC containers

Authentication is enabled globally through the environment configuration.

LDAP-specific settings are managed through the ProxPilot web interface.

Proxmox infrastructure configuration is also managed through the web interface.
Proxmox API credentials and node connection information are no longer configured
through global `PVE_*` environment variables.

---

# Authentication Enablement

Authentication is enabled with:

```dotenv
PROXPILOT_AUTH_ENABLED=true
```

When authentication is enabled, protected API routes require a valid session.

If authentication is disabled, ProxPilot does not require a login for normal use.

---

# Initial Administrator

The initial administrator credentials are provided through `.env`.

Example:

```dotenv
PROXPILOT_AUTH_USERNAME=admin
PROXPILOT_AUTH_PASSWORD=change-me
```

These values are used for initial provisioning.

After the local administrator exists in the SQLite database, users are managed
through the web interface.

The local user database is stored in:

```text
./data/proxpilot.db
```

The same persistent database also stores application configuration such as
configured Proxmox infrastructures.

Do not commit this database to Git.

---

# Password Storage

Local passwords are never stored in plain text.

ProxPilot stores password hashes in the SQLite user database.

The current implementation uses Argon2 password hashing.

Passwords must not be written to:

- Application logs
- Audit event details
- Frontend responses
- API responses

---

# Session Handling

Successful authentication creates a signed session token.

The browser receives the session as an HttpOnly cookie.

The session contains the authenticated user's:

- User ID
- Username
- Role
- Authentication source

The supported authentication sources are:

```text
local
ldap
```

The session role is used by backend permission checks and by frontend
permission-aware controls.

---

# Session Lifetime

The session lifetime is configured with:

```dotenv
PROXPILOT_SESSION_MAX_AGE=43200
```

The value is specified in seconds.

Example:

```text
43200 seconds = 12 hours
```

---

# Session Secret

Session signing uses:

```dotenv
PROXPILOT_SESSION_SECRET=<generated-secret>
```

Generate a sufficiently long random value, for example:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

The secret must:

- Remain private
- Not be committed to Git
- Remain stable across container restarts

Changing the session secret invalidates existing browser sessions.

---

# Secure Cookies

When ProxPilot is served over HTTPS, use:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For plain HTTP development only:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

Browsers do not send Secure cookies over plain HTTP.

The integrated browser console should be used through HTTPS in production.

---

# Login Flow

ProxPilot checks authentication in this order:

1. The user submits username and password.
2. ProxPilot validates its authentication configuration.
3. Local authentication is attempted first.
4. If local authentication fails and LDAP is enabled, LDAP authentication is attempted.
5. If LDAP authentication succeeds, ProxPilot determines the user's role.
6. The LDAP user is created or synchronized in the local SQLite database.
7. A signed session cookie is created.
8. The login event is recorded in the audit log.

LDAP is therefore an additional authentication method and does not replace local
authentication.

Existing local accounts continue to work when LDAP is enabled.

---

# Logout

Logout removes the browser's session cookie.

The user must authenticate again before accessing protected routes.

Logout events are recorded in the audit log.

---

# User Roles

ProxPilot 1.7.0 has three interactive user roles:

```text
Administrator
Operator
Viewer
```

The roles are intentionally separated into:

- Security administration
- Operational administration
- Read-only access

Automated Task Scheduler executions are internally identified as scheduler/system
operations rather than interactive user sessions.

---

# Administrator

Administrators have unrestricted ProxPilot permissions.

Administrators can:

- View all pages
- Manage local users
- Create local users
- Delete local users
- Enable and disable users
- Change user roles
- Change local user passwords
- Configure LDAP
- Test LDAP configuration
- Configure LDAP role mappings
- Change audit retention
- View the audit log
- Export audit events
- Perform guest power actions
- Start guest backups
- Start configured backup jobs
- Manage snapshots
- Roll back snapshots
- Delete snapshots
- Migrate guests
- Open QEMU browser consoles
- Open LXC browser consoles
- Manage node maintenance mode
- Check node updates
- Install node updates
- Run package cleanup
- Reboot nodes
- Shut down nodes
- View system information
- View operational status and health information
- View configured Proxmox infrastructures
- Discover Proxmox infrastructures
- Add Proxmox infrastructures
- Modify Proxmox infrastructures
- Remove Proxmox infrastructures
- Remove configured infrastructure nodes
- View scheduled tasks
- Create scheduled tasks
- Modify scheduled tasks
- Enable and disable scheduled tasks
- Manually execute scheduled tasks
- Delete scheduled tasks

---

# Operator

Operators have operational permissions but do not have access to security or user
administration.

Operators can:

- View normal operational pages
- Perform guest power actions
- Start guest backups
- Start configured backup jobs
- Create snapshots
- Roll back snapshots
- Delete snapshots
- Migrate guests
- Open QEMU browser consoles
- Open LXC browser consoles
- Enable and disable node maintenance mode
- Check node updates
- Install node updates
- Run package cleanup
- Reboot nodes
- Shut down nodes
- View system information
- View the audit log
- Export audit events
- View configured Proxmox infrastructures
- Discover Proxmox infrastructures
- Add Proxmox infrastructures
- Modify Proxmox infrastructures
- Remove Proxmox infrastructures
- Remove configured infrastructure nodes
- View scheduled tasks
- Create scheduled tasks
- Modify scheduled tasks
- Enable and disable scheduled tasks
- Manually execute scheduled tasks
- Delete scheduled tasks

Operators cannot:

- Manage users
- Create users
- Delete users
- Change user roles
- Change local user passwords
- Configure LDAP
- Change LDAP settings
- Change LDAP role mappings
- Change audit retention
- Modify authentication configuration

---

# Viewer

Viewers have read-only access.

Viewers can inspect available information such as:

- Dashboard
- Cluster status
- Nodes
- Guests
- Storage
- Network
- Replication
- Backups
- Tasks
- Configured Proxmox infrastructures
- Scheduled tasks
- Guest Agent information
- Guest disk usage information
- ZFS health information
- SMART warnings
- Hardware and runtime information

Viewers cannot execute privileged guest or node operations.

Viewers cannot:

- Add, modify or remove Proxmox infrastructures
- Run infrastructure discovery
- Create scheduled tasks
- Modify scheduled tasks
- Enable or disable scheduled tasks
- Manually execute scheduled tasks
- Delete scheduled tasks
- Open privileged browser consoles
- Perform guest power operations
- Perform node administration

---

# Role Permission Summary

| Function | Administrator | Operator | Viewer |
|----------|:-------------:|:--------:|:------:|
| View infrastructure data | Yes | Yes | Yes |
| Add infrastructure | Yes | Yes | No |
| Discover infrastructure | Yes | Yes | No |
| Modify infrastructure | Yes | Yes | No |
| Delete infrastructure | Yes | Yes | No |
| View scheduled tasks | Yes | Yes | Yes |
| Create scheduled tasks | Yes | Yes | No |
| Modify scheduled tasks | Yes | Yes | No |
| Enable / disable scheduled tasks | Yes | Yes | No |
| Run scheduled tasks manually | Yes | Yes | No |
| Delete scheduled tasks | Yes | Yes | No |
| Guest operational actions | Yes | Yes | No |
| Node operational actions | Yes | Yes | No |
| QEMU / LXC browser console | Yes | Yes | No |
| View audit log | Yes | Yes | Limited / unavailable |
| Manage users | Yes | No | No |
| Configure LDAP | Yes | No | No |
| Change audit retention | Yes | No | No |

---

# Administrator Protection

ProxPilot protects against accidental administrator lockout.

The last enabled administrator cannot be:

- Deleted
- Disabled
- Downgraded to Operator
- Downgraded to Viewer

An administrator also cannot remove their own administrator role.

This prevents the system from ending up without an enabled administrator.

---

# User Management

User management is available to administrators only.

The Users page supports:

- Local user creation
- Role assignment
- Enable / disable
- Password changes for local users
- User deletion

The available roles are:

```text
admin
operator
viewer
```

LDAP users are synchronized automatically after successful LDAP authentication.

LDAP usernames are managed by the directory and are not renamed through ProxPilot.

---

# Local and LDAP Users

Users have a source:

```text
local
ldap
```

Local users authenticate against the password hash stored in ProxPilot.

LDAP users authenticate against the configured directory.

A same-named existing local user is not silently replaced by an LDAP account.

This protects local administrative fallback accounts.

---

# LDAP / Active Directory

LDAP configuration is managed through:

```text
Settings → Authentication → LDAP
```

The implementation is suitable for generic LDAP and Microsoft Active Directory.

---

# LDAP Settings

The LDAP configuration includes:

- Enabled
- LDAP server
- Port
- Use LDAPS
- Use StartTLS
- Verify TLS certificate
- Bind DN
- Bind password
- Base DN
- User filter
- Default role
- Administrator group DN
- Operator group DN
- Viewer group DN

---

# LDAP Server

Enter the LDAP server hostname or IP address without a URI scheme.

Example:

```text
dc01.example.local
```

Do not enter:

```text
ldap://dc01.example.local
```

or:

```text
ldaps://dc01.example.local
```

Encryption mode is configured separately.

---

# LDAP Ports

Common values are:

```text
389  LDAP / StartTLS
636  LDAPS
```

The configured port is independent of the encryption checkboxes.

---

# LDAPS

When `Use LDAPS` is enabled, encryption starts immediately when the connection is
opened.

Typical configuration:

```text
Port: 636
Use LDAPS: enabled
Use StartTLS: disabled
```

---

# StartTLS

When `Use StartTLS` is enabled, ProxPilot first opens a normal LDAP connection
and upgrades it to TLS.

Typical configuration:

```text
Port: 389
Use LDAPS: disabled
Use StartTLS: enabled
```

LDAPS and StartTLS cannot be enabled at the same time.

---

# TLS Certificate Verification

`Verify TLS certificate` controls whether the LDAP server certificate is validated.

For production environments this should normally remain enabled.

Disabling certificate verification can be useful during isolated testing but
reduces connection security.

---

# Bind Account

If the directory requires a service account for searching, configure:

- Bind DN
- Bind password

Example Active Directory DN:

```text
CN=svc-proxpilot,OU=Service Accounts,DC=example,DC=local
```

The bind password is stored by ProxPilot but is not returned by the settings API.

The frontend only receives whether a bind password has already been configured.

---

# Base DN

The Base DN defines where ProxPilot searches for users.

Example:

```text
DC=example,DC=local
```

User searches use subtree scope below this Base DN.

---

# User Filter

The LDAP user filter must contain:

```text
{username}
```

Example for Active Directory:

```text
(&(objectClass=user)(sAMAccountName={username}))
```

The entered username is escaped before being inserted into the LDAP filter.

---

# LDAP Authentication Process

For an LDAP login, ProxPilot:

1. Opens a search connection.
2. Uses the configured bind account when available.
3. Searches below the Base DN using the configured user filter.
4. Reads the matched user's distinguished name.
5. Reads the user's `memberOf` values.
6. Opens a second LDAP connection using the user's own DN and submitted password.
7. Performs a user bind.
8. Determines the ProxPilot role from LDAP group membership.
9. Creates or updates the local representation of the LDAP user.

Authentication succeeds only when the user bind succeeds.

---

# LDAP Role Mapping

LDAP roles are determined from group membership.

Available mappings:

```text
Administrator group DN -> admin
Operator group DN      -> operator
Viewer group DN        -> viewer
```

Example:

```text
CN=ProxPilot-Admins,OU=Groups,DC=example,DC=local
CN=ProxPilot-Operators,OU=Groups,DC=example,DC=local
CN=ProxPilot-Viewers,OU=Groups,DC=example,DC=local
```

The group DN comparison is case-insensitive.

---

# LDAP Role Precedence

Role evaluation uses this order:

```text
Administrator
Operator
Viewer
Default role
```

Therefore, if a user is a member of both Administrator and Operator groups, the
Administrator role wins.

If no configured group matches, the configured default role is used.

---

# LDAP Role Synchronization

LDAP role evaluation happens during authentication.

When an LDAP user's directory group membership changes, ProxPilot updates the
local role after the user's next successful LDAP login.

For example:

```text
Viewer group -> Operator group
```

After the next successful LDAP login, the user is synchronized to:

```text
operator
```

An active session does not automatically change role in the middle of the session.

The user should log out and authenticate again.

---

# LDAP Test

The Settings page contains an LDAP connection test.

The test uses the values currently entered in the form, including unsaved values.

The test verifies:

- LDAP server connectivity
- Port
- Encryption configuration
- Bind account
- Base DN query

A successful connection test does not authenticate a specific end user.

LDAP tests are written to the audit log.

---

# Local Administrator Fallback

Local authentication is always checked before LDAP.

Keeping at least one local administrator is recommended.

This provides emergency access when:

- LDAP is offline
- Active Directory is offline
- DNS fails
- Network connectivity fails
- LDAP certificates are invalid
- LDAP settings are accidentally misconfigured

---

# Infrastructure Authorization

ProxPilot 1.7.0 manages Proxmox environments as persistent infrastructures.

An infrastructure can represent:

- A Proxmox VE cluster
- A standalone Proxmox VE host

Infrastructure information can be viewed by authenticated users.

Infrastructure-changing operations require either:

```text
Administrator
Operator
```

These operations include:

- Testing and discovering an infrastructure
- Adding an infrastructure
- Updating an infrastructure
- Renaming an infrastructure
- Updating node connection information
- Removing a node from an infrastructure
- Deleting an infrastructure

Viewer accounts have read-only access to infrastructure information.

Infrastructure authorization is enforced by the backend and does not rely only
on frontend controls.

---

# Task Scheduler Authorization

ProxPilot includes a persistent Task Scheduler for automated Proxmox operations.

Scheduled tasks can be viewed by authenticated users.

Creating or changing scheduler configuration requires either:

```text
Administrator
Operator
```

Administrators and Operators can:

- Create scheduled tasks
- Modify scheduled tasks
- Enable scheduled tasks
- Disable scheduled tasks
- Manually execute tasks using `Run now`
- Delete scheduled tasks

Viewer accounts have read-only access to scheduled task information.

The `Run now` operation executes an existing scheduled task immediately without
changing its configured schedule.

Background scheduler executions are not interactive user sessions.

They are internally identified as scheduler/system operations so automated
activity can be distinguished from actions performed directly by logged-in users.

---

# Browser Console Authorization

The integrated browser console is available for:

- QEMU virtual machines
- LXC containers

Console access is available to:

```text
Administrator
Operator
```

Viewer sessions are rejected.

Authorization is enforced in both:

- HTTP console ticket creation
- WebSocket console session validation

Console sessions use short-lived backend-managed identifiers.

Opening a console creates an audit event.

---

# Audit Logging

Authentication and security-related operations are written to the persistent
audit log.

Operational actions are also recorded where supported.

Examples include:

- Successful login
- Failed login
- Logout
- User creation
- User updates
- User password changes
- User deletion
- LDAP connection tests
- LDAP configuration changes
- Console opening
- Audit retention changes
- Infrastructure configuration changes
- Scheduled task configuration changes
- Scheduled task executions

Audit events may contain:

- Timestamp
- User ID
- Username
- Role
- Authentication source
- Client IP address
- Action
- Target type
- Target
- Node
- Result
- Severity
- Duration
- Structured details

Passwords, API token secrets, LDAP bind passwords and other credentials must never
be stored in audit details.

Scheduled background executions are identified as scheduler/system operations
rather than being attributed to an unrelated interactive user session.

---

# Audit Access

The Audit Log page is available to:

```text
Administrator
Operator
```

Administrators can additionally change the retention configuration.

Viewer accounts do not have operational access to privileged audit-management
features.

---

# Audit Retention

The default audit retention is:

```text
90 days
```

Retention can be changed through the ProxPilot web interface.

Changing retention itself creates an audit event.

Expired entries are removed automatically according to the configured retention.

---

# Client IP Addresses

Audit events use the client address from the request.

When a reverse proxy is present, ProxPilot can read:

```text
X-Forwarded-For
X-Real-IP
```

The first `X-Forwarded-For` address is used when present.

Only trusted reverse proxies should be allowed to supply these headers.

---

# Security Recommendations

For production use:

- Use HTTPS
- Enable Secure cookies
- Use a strong session secret
- Keep at least one local administrator
- Use strong local passwords
- Use LDAPS or StartTLS for LDAP where possible
- Enable LDAP certificate verification
- Use a dedicated LDAP bind account
- Give the bind account only the directory permissions it requires
- Use dedicated Proxmox API tokens
- Grant only the required Proxmox API permissions
- Protect Proxmox API token secrets
- Protect SSH private keys
- Restrict ProxPilot to trusted networks where possible
- Protect the SQLite database
- Protect `.env`
- Review audit events regularly
- Avoid exposing ProxPilot directly to the public Internet without appropriate access controls

---

# Troubleshooting LDAP

## LDAP connection test fails

Verify:

- DNS resolution
- Firewall rules
- LDAP hostname
- LDAP port
- LDAPS / StartTLS selection
- TLS certificate trust
- Bind DN
- Bind password
- Base DN

---

## LDAP user is not found

Verify:

- Base DN
- User filter
- `{username}` placeholder
- `sAMAccountName` when using Active Directory
- Search permissions of the bind account

Example Active Directory filter:

```text
(&(objectClass=user)(sAMAccountName={username}))
```

---

## LDAP connection succeeds but login fails

The connection test and user authentication are separate operations.

Verify:

- The user is found by the configured filter
- The user's submitted password is correct
- The user's DN can be bound
- The LDAP account is not disabled
- The bind account can read required user attributes

---

## Wrong role after LDAP login

Verify:

- Administrator group DN
- Operator group DN
- Viewer group DN
- User's `memberOf` values
- Default role

Group DNs must match the values returned by the directory.

After changing directory group membership:

1. Log out of ProxPilot.
2. Log in again.
3. Verify the role displayed in ProxPilot.

---

## Local login unexpectedly wins over LDAP

This is expected behavior.

ProxPilot checks local users first.

If an existing local account successfully authenticates, LDAP is not attempted for
that login.

This protects local administrator fallback accounts.

---

## Secure cookie prevents login over HTTP

If:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

the browser will not send the session cookie over plain HTTP.

For production:

```text
Use HTTPS.
```

For local HTTP development only:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

---

# Troubleshooting Infrastructure Permissions

## Viewer cannot add or modify an infrastructure

This is expected behavior.

Infrastructure-changing operations require:

```text
Administrator
Operator
```

Viewer accounts have read-only access.

---

## Operator can manage infrastructures

This is expected behavior in ProxPilot 1.7.0.

Infrastructure discovery, creation, modification and deletion are operational
administration functions and are available to both Administrators and Operators.

---

# Troubleshooting Task Scheduler Permissions

## Viewer can see tasks but cannot modify them

This is expected behavior.

Viewer accounts have read-only access to Task Scheduler information.

Creating, modifying, enabling, disabling, manually executing or deleting tasks
requires:

```text
Administrator
Operator
```

---

## Scheduled execution is shown as scheduler/system activity

This is expected behavior.

Background executions are performed independently of an interactive browser
session and are identified as scheduler/system operations in activity and audit
information.

---

# Related Documentation

- `README.md`
- `CONFIGURATION.md`
- `API-PERMISSIONS.md`
- `INSTALLATION.md`
- `HTTPS_AND_REVERSE_PROXY.md`
- `TROUBLESHOOTING.md`

---

End of document.
