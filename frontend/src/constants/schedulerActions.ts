export const ACTIONS = [
  {
    group: 'Guest',
    items: [
      { value: 'guest.start', label: 'Start' },
      { value: 'guest.shutdown', label: 'Shutdown (Graceful)' },
      { value: 'guest.stop', label: 'Stop (Force)' },
      { value: 'guest.reboot', label: 'Reboot' },
      { value: 'guest.suspend', label: 'Suspend' },
      { value: 'guest.resume', label: 'Resume' },
      { value: 'guest.migrate', label: 'Migrate' },
    ],
  },

  {
    group: 'Snapshot',
    items: [
      { value: 'snapshot.create', label: 'Create' },
      { value: 'snapshot.delete', label: 'Delete' },
      { value: 'snapshot.rollback', label: 'Rollback' },
    ],
  },

  {
    group: 'Backup',
    items: [
      { value: 'backup.guest', label: 'Run Guest Backup' },
      {
        value: 'backup.guest_restore',
        label: 'Restore Guest Backup',
      },
    ],
  },

  {
    group: 'Node',
    items: [
      {
        value: 'node.check_updates',
        label: 'Check for Updates',
      },
      {
        value: 'node.install_updates',
        label: 'Install Updates',
      },
      {
        value: 'node.package_cleanup',
        label: 'Package Cleanup',
      },
      {
        value: 'node.maintenance.enable',
        label: 'Enable Maintenance Mode',
      },
      {
        value: 'node.maintenance.disable',
        label: 'Disable Maintenance Mode',
      },
      {
        value: 'node.reboot',
        label: 'Reboot',
      },
      {
        value: 'node.shutdown',
        label: 'Shutdown',
      },
    ],
  },
];
