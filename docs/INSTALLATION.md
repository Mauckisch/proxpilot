# ProxPilot Installation Guide

> Work in progress.

## Overview

This guide covers:

-   Requirements
-   Preparing Proxmox VE
-   API user
-   API token
-   Roles
-   ACLs
-   SSH
-   .env
-   Docker
-   Verification
-   Troubleshooting

------------------------------------------------------------------------

# 1. Requirements

-   Proxmox VE 8+
-   Docker Engine
-   Docker Compose

    Port Purpose
  ------ -------------
    8006 Proxmox API
      22 SSH
    8085 ProxPilot

# 2. Clone

``` bash
git clone https://github.com/Mauckisch/proxpilot.git
cd proxpilot
```

# 3. Prepare Proxmox

Do not skip the following chapters.

# 4. Create API user

``` bash
pveum user add dashboard@pve --comment "ProxPilot API User"
pveum user list | grep dashboard
```

# 5. Create API token

``` bash
pveum user token add dashboard@pve dashboard --comment "ProxPilot API Token"
pveum user token list dashboard@pve
```

Token ID:

``` text
dashboard@pve!dashboard
```

# 6. Create Roles

## DashboardManager

Privileges:

``` text
Datastore.Audit
Sys.Audit
VM.Audit
VM.Migrate
VM.PowerMgmt
```

``` bash
pveum role add DashboardManager --privs "Datastore.Audit Sys.Audit VM.Audit VM.Migrate VM.PowerMgmt"
```

## ProxPilotBackup

Privileges:

``` text
Datastore.Allocate
Datastore.AllocateSpace
Datastore.Audit
VM.Audit
VM.Backup
VM.Snapshot
VM.Snapshot.Rollback
```

``` bash
pveum role add ProxPilotBackup --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

Next chapters: - ACLs - SSH - .env - Docker - LDAP - Troubleshooting
