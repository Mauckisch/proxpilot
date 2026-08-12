# ProxPilot Proxmox API Permissions

This document describes the Proxmox VE permissions required by ProxPilot.

It explains:

- Why dedicated roles should be used
- Which privileges are required
- Where ACLs must be assigned
- Why permissions must be assigned to both the API user and API token
- How to verify the effective permissions
- Typical permission errors and their solutions

---

## 1. Security model

ProxPilot should use a dedicated Proxmox API user and API token.

The examples in this document use:

```text
API user:  dashboard@pve
Token:     dashboard
Token ID:  dashboard@pve!dashboard
```

Do not use the built-in `root@pam` account for ProxPilot.

A dedicated user makes it possible to:

- Restrict access to the exact required privileges
- Revoke ProxPilot access without affecting other administrators
- Audit permissions more easily
- Separate API permissions from SSH access
- Avoid storing a full Proxmox administrator credential

ProxPilot also uses SSH for selected host-level operations. API permissions and SSH permissions are separate.

---

## 2. Important concept: token privilege separation

When Proxmox token privilege separation is enabled, the effective permissions of the token are limited by both:

- The permissions assigned to the API user
- The permissions assigned to the API token

The result is effectively the intersection of both permission sets.

```text
User permissions
       ∩
Token permissions
       =
Effective token permissions
```

For this reason, the required ACLs must be assigned to both:

```text
dashboard@pve
dashboard@pve!dashboard
```

Assigning a role only to the user or only to the token can result in missing effective permissions.

---

## 3. Create the API user

Run this command on any Proxmox cluster node:

```bash
pveum user add dashboard@pve \
  --comment "ProxPilot API user"
```

Verify that the user exists:

```bash
pveum user list | grep dashboard
```

Expected result:

```text
dashboard@pve
```

---

## 4. Create the API token

Create a token named `dashboard`:

```bash
pveum user token add dashboard@pve dashboard \
  --comment "ProxPilot API token"
```

The resulting token ID is:

```text
dashboard@pve!dashboard
```

The token secret is displayed only once.

Store it securely.

Starting with ProxPilot 1.7.0, the Proxmox API token is no longer configured through global `PVE_*` variables in `.env`.

The token ID and token secret are entered when adding an Infrastructure in the ProxPilot web interface:

```text
Settings
→ Infrastructure
→ Add Infrastructure
```

Enter:

- **API endpoint** — one reachable Proxmox VE API endpoint
- **Token ID** — for example `dashboard@pve!dashboard`
- **Token secret** — the secret generated above

Use **Test & Discover** to verify the credentials and detect whether the target is a Proxmox cluster or a standalone host.

For clustered environments, ProxPilot discovers the available nodes and allows a reachable hostname or IP address to be configured for each node.

API credentials are stored as part of the persistent Infrastructure configuration.

Verify the token:

```bash
pveum user token list dashboard@pve
```

---

## 5. Required custom roles

ProxPilot uses three custom roles:

```text
DashboardManager
ProxPilotBackup
ProxPilotSDN
```

The separation makes the permissions easier to understand and maintain.

---

## 6. DashboardManager role

The `DashboardManager` role provides read access and common guest-management operations.

Required privileges:

```text
Datastore.Audit
Sys.Audit
VM.Audit
VM.Console
VM.Migrate
VM.PowerMgmt
```

### Privilege explanation

| Privilege | Required for |
|---|---|
| `Datastore.Audit` | Reading storage information and availability |
| `Sys.Audit` | Reading node, cluster and system information |
| `VM.Audit` | Reading VM and LXC status and configuration |
| `VM.Console` | Opening the integrated QEMU noVNC console |
| `VM.Migrate` | Live and offline guest migration |
| `VM.PowerMgmt` | Start, shutdown, stop, reboot, suspend and resume |

### Create the role

```bash
pveum role add DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"
```

### Update an existing role

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"
```

### Verify the role

```bash
pveum role list | grep DashboardManager
```

The output should include:

```text
Datastore.Audit
Sys.Audit
VM.Audit
VM.Console
VM.Migrate
VM.PowerMgmt
```

---

## 7. ProxPilotBackup role

The `ProxPilotBackup` role provides backup and snapshot permissions.

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

### Privilege explanation

| Privilege | Required for |
|---|---|
| `Datastore.Allocate` | Allocating resources on the target storage |
| `Datastore.AllocateSpace` | Writing backup data to the target storage |
| `Datastore.Audit` | Reading target storage information |
| `VM.Audit` | Reading guest information before backup or snapshot operations |
| `VM.Backup` | Starting Proxmox backup operations |
| `VM.Snapshot` | Creating and deleting snapshots |
| `VM.Snapshot.Rollback` | Rolling a guest back to a snapshot |

### Create the role

```bash
pveum role add ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"

pveum role add ProxPilotSDN \
  --privs "SDN.Use"
```

### Update an existing role

```bash
pveum role modify ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

### Verify the role

```bash
pveum role list | grep ProxPilotBackup
```

---

## 8. ProxPilotSDN role

The `ProxPilotSDN` role provides permission to use SDN-managed network resources required by ProxPilot.

Required privilege:

```text
SDN.Use
```

### Privilege explanation

| Privilege | Required for |
|---|---|
| `SDN.Use` | Using an SDN-managed network resource required by a guest operation |

### Create the role

```bash
pveum role add ProxPilotSDN \
  --privs "SDN.Use"
```

### Update an existing role

```bash
pveum role modify ProxPilotSDN \
  --privs "SDN.Use"
```

### Verify the role

```bash
pveum role list | grep ProxPilotSDN
```

Assign this role only to the SDN paths that ProxPilot actually needs.

---

## 8. Required ACL layout

A typical ProxPilot configuration uses these ACL paths:

```text
/
├── DashboardManager
│
├── /vms
│   ├── DashboardManager
│   └── ProxPilotBackup
│
└── /storage/YOUR-BACKUP-STORAGE
    └── ProxPilotBackup
```

The ACLs must be assigned to both:

- `dashboard@pve`
- `dashboard@pve!dashboard`

### SDN ACLs

When ProxPilot needs an SDN-managed network resource, `ProxPilotSDN` must be assigned to the exact required SDN ACL path for both the API user and API token.

A tested example path is:

```text
/sdn/zones/localnetwork/vmbr2
```

Replace that path with the actual SDN zone and network/bridge path in your environment.

```bash
pveum acl modify /sdn/zones/localnetwork/vmbr2 \
  --users dashboard@pve \
  --roles ProxPilotSDN \
  --propagate 1

pveum acl modify /sdn/zones/localnetwork/vmbr2 \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotSDN \
  --propagate 1
```

Verify:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /sdn/zones/localnetwork/vmbr2
```

The effective permissions must include `SDN.Use`.


---

## 9. Assign DashboardManager on the root path

Assign the role to the API user:

```bash
pveum acl modify / \
  --users dashboard@pve \
  --roles DashboardManager \
  --propagate 1
```

Assign the role to the API token:

```bash
pveum acl modify / \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager \
  --propagate 1
```

The root assignment provides cluster-wide read access and common management permissions.

---

## 10. Assign both roles on `/vms`

Assign both roles to the API user:

```bash
pveum acl modify /vms \
  --users dashboard@pve \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

Assign both roles to the API token:

```bash
pveum acl modify /vms \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager,ProxPilotBackup \
  --propagate 1
```

### Why both roles are required on `/vms`

The `ProxPilotBackup` role alone does not contain:

```text
VM.PowerMgmt
VM.Migrate
VM.Console
```

The `DashboardManager` role alone does not contain:

```text
VM.Backup
VM.Snapshot
VM.Snapshot.Rollback
```

Both roles are therefore required on `/vms`.

A missing `DashboardManager` role on `/vms` can cause errors such as:

```text
Permission check failed (/vms/100, VM.PowerMgmt)
```

A missing `ProxPilotBackup` role can cause backup or snapshot operations to fail.

---

## 11. Assign the backup role to the target storage

Replace:

```text
YOUR-BACKUP-STORAGE
```

with the actual Proxmox storage ID.

Example storage IDs:

```text
backup-nfs
pbs
Synology-NAS_NFS
```

Assign the role to the API user:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1
```

Assign the role to the API token:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotBackup \
  --propagate 1
```

Example:

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

### Restore target storage

The same `ProxPilotBackup` role is also required on every storage that ProxPilot is allowed to use as a restore target.

`ProxPilotBackup` already contains `Datastore.AllocateSpace`. However, the privilege is only effective on storage paths where the role is assigned. A restore can therefore fail with a `403 Permission check failed` response when the selected restore target storage does not have the required ACL.

Replace `YOUR-RESTORE-TARGET-STORAGE` with the actual Proxmox storage ID:

```bash
pveum acl modify /storage/YOUR-RESTORE-TARGET-STORAGE \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1

pveum acl modify /storage/YOUR-RESTORE-TARGET-STORAGE \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotBackup \
  --propagate 1
```

Verify the effective token permissions:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /storage/YOUR-RESTORE-TARGET-STORAGE
```

For restore targets, the effective permissions must include `Datastore.AllocateSpace`.


---

## 12. Verify the ACL entries

List all ACLs related to the ProxPilot user:

```bash
pveum acl list | grep -E 'dashboard@pve|/vms'
```

A typical result contains entries similar to:

```text
/                           DashboardManager  user   dashboard@pve
/                           DashboardManager  token  dashboard@pve!dashboard

/vms                        DashboardManager  user   dashboard@pve
/vms                        ProxPilotBackup    user   dashboard@pve
/vms                        DashboardManager  token  dashboard@pve!dashboard
/vms                        ProxPilotBackup    token  dashboard@pve!dashboard

/storage/backup-nfs         ProxPilotBackup    user   dashboard@pve
/storage/backup-nfs         ProxPilotBackup    token  dashboard@pve!dashboard
```

---

## 13. Verify effective token permissions

Check the effective permissions on `/vms`:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms
```

Expected privileges include:

```text
Datastore.Allocate
Datastore.AllocateSpace
Datastore.Audit
Sys.Audit
VM.Audit
VM.Backup
VM.Console
VM.Migrate
VM.PowerMgmt
VM.Snapshot
VM.Snapshot.Rollback
```

Check a specific guest:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/100
```

Replace `100` with an existing VM or container ID.

Check the backup storage:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /storage/YOUR-BACKUP-STORAGE
```

---

## 14. Verify user permissions separately

Check the API user:

```bash
pveum user permissions dashboard@pve
```

Check the API token:

```bash
pveum user token permissions dashboard@pve dashboard
```

When privilege separation is enabled, both results matter.

---

## 15. Console permission

The integrated noVNC console requires:

```text
VM.Console
```

Verify that `DashboardManager` contains it:

```bash
pveum role list | grep DashboardManager
```

If it is missing, update the role:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"
```

Then verify:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms
```

The output must contain:

```text
VM.Console
```

---

## 16. Typical permission errors

### `VM.PowerMgmt`

Error:

```text
Permission check failed (/vms/100, VM.PowerMgmt)
```

Cause:

- `DashboardManager` is missing on `/vms`
- The role was assigned only to the user or only to the token
- Propagation is disabled

Check:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/100
```

Fix:

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

---

### `VM.Migrate`

Error:

```text
Permission check failed (..., VM.Migrate)
```

Cause:

- `VM.Migrate` is missing from `DashboardManager`
- `DashboardManager` is not effective on `/vms`

Fix:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"
```

---

### `VM.Console`

Symptoms:

- Console button fails
- Proxmox API returns a permission error
- VNC proxy creation fails

Check:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms
```

Fix:

```bash
pveum role modify DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"
```

---

### `VM.Backup`

Error:

```text
Permission check failed (..., VM.Backup)
```

Cause:

- `ProxPilotBackup` is missing on `/vms`
- The role is assigned only to the user or token

Fix:

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

---

### `VM.Snapshot`

Error:

```text
Permission check failed (..., VM.Snapshot)
```

Cause:

- `ProxPilotBackup` is missing
- The target VM path does not inherit the role

Check:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /vms/100
```

---

### `VM.Snapshot.Rollback`

Error:

```text
Permission check failed (..., VM.Snapshot.Rollback)
```

Cause:

- The rollback privilege is missing from the role

Fix:

```bash
pveum role modify ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

---

### `Datastore.AllocateSpace`

Symptoms:

- Backup starts but cannot write to the target storage
- Guest restore cannot allocate disk space on the selected target storage
- A restore can fail with `403 Permission check failed` when `Datastore.AllocateSpace` is not effective on that storage
- Proxmox reports a storage permission error

Check:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /storage/YOUR-BACKUP-STORAGE
```

Fix:

```bash
pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1

pveum acl modify /storage/YOUR-BACKUP-STORAGE \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotBackup \
  --propagate 1
```

---


### `SDN.Use`

Symptoms:

- An operation involving an SDN-managed network resource fails with a permission error
- `SDN.Use` is not effective for the API token on the required SDN path

Check:

```bash
pveum user token permissions dashboard@pve dashboard \
  --path /sdn/zones/YOUR-ZONE/YOUR-NETWORK
```

Fix:

```bash
pveum acl modify /sdn/zones/YOUR-ZONE/YOUR-NETWORK \
  --users dashboard@pve \
  --roles ProxPilotSDN \
  --propagate 1

pveum acl modify /sdn/zones/YOUR-ZONE/YOUR-NETWORK \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotSDN \
  --propagate 1
```

The effective permissions must include `SDN.Use`.

---

## 17. Complete example

This example uses:

```text
API user:       dashboard@pve
Token name:     dashboard
Backup storage: backup-nfs
```

### Create user and token

```bash
pveum user add dashboard@pve \
  --comment "ProxPilot API user"

pveum user token add dashboard@pve dashboard \
  --comment "ProxPilot API token"
```

### Create roles

```bash
pveum role add DashboardManager \
  --privs "Datastore.Audit Sys.Audit VM.Audit VM.Console VM.Migrate VM.PowerMgmt"

pveum role add ProxPilotBackup \
  --privs "Datastore.Allocate Datastore.AllocateSpace Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"
```

### Assign root ACLs

```bash
pveum acl modify / \
  --users dashboard@pve \
  --roles DashboardManager \
  --propagate 1

pveum acl modify / \
  --tokens 'dashboard@pve!dashboard' \
  --roles DashboardManager \
  --propagate 1
```

### Assign VM ACLs

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

### Assign backup storage ACLs

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

### Assign restore target storage ACLs

If `local-lvm` is an allowed restore target:

```bash
pveum acl modify /storage/local-lvm \
  --users dashboard@pve \
  --roles ProxPilotBackup \
  --propagate 1

pveum acl modify /storage/local-lvm \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotBackup \
  --propagate 1
```

### Assign SDN ACLs

Only when the SDN resource is required:

```bash
pveum acl modify /sdn/zones/localnetwork/vmbr2 \
  --users dashboard@pve \
  --roles ProxPilotSDN \
  --propagate 1

pveum acl modify /sdn/zones/localnetwork/vmbr2 \
  --tokens 'dashboard@pve!dashboard' \
  --roles ProxPilotSDN \
  --propagate 1
```

### Verify

```bash
pveum role list | grep -E "DashboardManager|ProxPilotBackup"

pveum acl list | grep dashboard

pveum user token permissions dashboard@pve dashboard \
  --path /vms

pveum user token permissions dashboard@pve dashboard \
  --path /storage/backup-nfs
```

---

## 18. Permission checklist

Before starting ProxPilot, confirm:

- [ ] API user exists
- [ ] API token exists
- [ ] Token secret is stored securely
- [ ] `DashboardManager` exists
- [ ] `DashboardManager` contains `VM.Console`
- [ ] `ProxPilotBackup` exists
- [ ] `ProxPilotBackup` contains `Datastore.AllocateSpace`
- [ ] `ProxPilotSDN` exists and contains `SDN.Use` if SDN-managed resources are required
- [ ] Root ACL is assigned to user and token
- [ ] `/vms` ACLs are assigned to user and token
- [ ] Backup storage ACL is assigned to user and token
- [ ] Every allowed restore target storage has `ProxPilotBackup` assigned to user and token
- [ ] Every required SDN ACL path has `ProxPilotSDN` assigned to user and token
- [ ] Propagation is enabled
- [ ] Effective permissions were verified
- [ ] The token ID and secret were entered in the ProxPilot Infrastructure configuration

---

## 19. Related documentation

- [Installation](INSTALLATION.md)
- [Configuration](CONFIGURATION.md)
- [Authentication and LDAP](AUTHENTICATION.md)
- [HTTPS and reverse proxy](HTTPS_AND_REVERSE_PROXY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
