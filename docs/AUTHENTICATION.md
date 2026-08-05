# ProxPilot Authentication Guide

This document explains authentication, user management and LDAP
integration.

# Overview

ProxPilot supports:

-   Local authentication
-   LDAP authentication
-   Session-based authentication using HttpOnly cookies
-   Role-based access (Administrator / User)

LDAP configuration is performed entirely through the web interface.

------------------------------------------------------------------------

# Local Authentication

Local authentication is enabled with:

``` dotenv
PROXPILOT_AUTH_ENABLED=true
```

Initial credentials are taken from `.env` only during the first startup
when no matching user exists in the SQLite database.

After that, users are managed exclusively through the web interface.

------------------------------------------------------------------------

# First Login

1.  Start ProxPilot.
2.  Open the web interface.
3.  Sign in using the initial administrator credentials.
4.  Verify access to the Settings and Users pages.

------------------------------------------------------------------------

# User Roles

## Administrator

Administrators can:

-   Manage users
-   Configure LDAP
-   Change system settings
-   Execute administrative guest and node actions

## User

Regular users can access the dashboard and permitted management
functions but cannot modify authentication settings.

------------------------------------------------------------------------

# User Management

Administrators can:

-   Create users
-   Delete users
-   Reset passwords
-   Change roles
-   Enable or disable accounts

All user data is stored in:

``` text
./data/proxpilot.db
```

------------------------------------------------------------------------

# Password Storage

Passwords are not stored in plain text.

ProxPilot hashes passwords before storing them.

Never copy the SQLite database to a public location.

------------------------------------------------------------------------

# LDAP Authentication

LDAP is configured through:

Settings → Authentication → LDAP

Configuration includes:

-   Enable LDAP
-   Server URI
-   Base DN
-   Bind DN
-   Bind password
-   User search filter
-   Username attribute
-   Display name attribute
-   Email attribute

------------------------------------------------------------------------

# LDAP Test

Use the built-in LDAP test before enabling LDAP.

Verify:

-   Server connectivity
-   Bind account
-   Search base
-   User lookup

Correct any reported errors before saving the configuration.

------------------------------------------------------------------------

# Login Flow

When LDAP is enabled:

1.  User enters username and password.
2.  ProxPilot performs LDAP authentication.
3.  If authentication succeeds, the user is synchronized into the local
    database if required.
4.  A signed HttpOnly session cookie is created.

------------------------------------------------------------------------

# Local Fallback

Depending on the configured authentication mode, local users can
continue to log in even when LDAP is unavailable.

This allows emergency administrator access.

------------------------------------------------------------------------

# Session Cookies

Successful logins create an HttpOnly session cookie.

When HTTPS is used:

``` dotenv
PROXPILOT_COOKIE_SECURE=true
```

For local HTTP testing only:

``` dotenv
PROXPILOT_COOKIE_SECURE=false
```

Browsers will not send Secure cookies over plain HTTP.

------------------------------------------------------------------------

# Logout

Logout invalidates the current browser session.

The browser must authenticate again to continue.

------------------------------------------------------------------------

# Security Recommendations

-   Use HTTPS
-   Use Secure cookies
-   Use strong administrator passwords
-   Restrict access to trusted networks
-   Protect the SQLite database
-   Protect SSH keys
-   Use a dedicated Proxmox API user

------------------------------------------------------------------------

# Common LDAP Problems

## Invalid credentials

Verify:

-   Bind DN
-   Bind password

------------------------------------------------------------------------

## User not found

Verify:

-   Base DN
-   User search filter
-   Username attribute

------------------------------------------------------------------------

## Cannot connect

Verify:

-   Firewall
-   DNS
-   LDAP server URI
-   TCP port (389 or 636)

------------------------------------------------------------------------

## LDAP works but login fails

Verify:

-   LDAP test succeeds
-   User synchronization
-   Role assignment

------------------------------------------------------------------------

# Related Documentation

-   INSTALLATION.md
-   CONFIGURATION.md
-   API-PERMISSIONS.md
-   HTTPS_AND_REVERSE_PROXY.md
-   TROUBLESHOOTING.md
