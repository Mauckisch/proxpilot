import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArchive,
  IconCheck,
  IconDatabase,
  IconHistory,
} from '@tabler/icons-react';

import {
  type BackupJob,
  type Guest,
  useDashboard,
} from '../hooks/useDashboard';

import { OperatorButton } from './OperatorButton';


type GuestBackupButtonProps = {
  guest: Guest;
};


type GuestBackupResponse = {
  ok: boolean;
  job_id: string;
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  storage?: string;
  mode?: string;
  compress?: string;
};


type GuestBackupArchive = {
  storage: string;
  volid: string;
  vmid: number;
  guest_type: 'qemu' | 'lxc';
  format?: string;
  size?: number;
  ctime?: number;
  notes?: string | null;
  protected?: boolean;
  encrypted?: boolean;
  verification?: unknown;
};


type GuestBackupArchiveResponse = {
  infrastructure_id: number;
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  count: number;
  archives: GuestBackupArchive[];
};


type GuestRestoreResponse = {
  ok: boolean;
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  archive: string;
  target_storage?: string | null;
  task?: {
    id?: string;
    state?: string;
  };
};


function retentionText(
  prune?: BackupJob['prune-backups'],
): string {
  if (!prune) {
    return 'Not configured';
  }

  const labels: Record<string, string> = {
    'keep-last': 'last',
    'keep-daily': 'daily',
    'keep-weekly': 'weekly',
    'keep-monthly': 'monthly',
    'keep-yearly': 'yearly',
  };

  const values = Object.entries(prune)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      return `${labels[key] ?? key}: ${value}`;
    });

  return values.length > 0
    ? values.join(', ')
    : 'Not configured';
}


function formatBytes(
  value?: number,
): string {
  if (
    value === undefined
    || value === null
    || !Number.isFinite(value)
    || value < 0
  ) {
    return 'Unknown';
  }

  if (value === 0) {
    return '0 B';
  }

  const units = [
    'B',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
  ];

  let size = value;
  let unit = 0;

  while (
    size >= 1024
    && unit < units.length - 1
  ) {
    size /= 1024;
    unit += 1;
  }

  return `${
    size >= 100
      ? size.toFixed(0)
      : size >= 10
        ? size.toFixed(1)
        : size.toFixed(2)
  } ${units[unit]}`;
}


function formatBackupDate(
  timestamp?: number,
): string {
  if (
    timestamp === undefined
    || timestamp === null
    || !Number.isFinite(timestamp)
    || timestamp <= 0
  ) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'medium',
    },
  ).format(
    new Date(timestamp * 1000),
  );
}


export function GuestBackupButton({
  guest,
}: GuestBackupButtonProps) {
  const dashboard = useDashboard();

  const [opened, setOpened] =
    useState(false);

  const [selectedJobId, setSelectedJobId] =
    useState<string | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);


  const [archives, setArchives] =
    useState<GuestBackupArchive[]>([]);

  const [loadingArchives, setLoadingArchives] =
    useState(false);

  const [archiveError, setArchiveError] =
    useState<string | null>(null);


  const [restoreOpened, setRestoreOpened] =
    useState(false);

  const [restoreArchive, setRestoreArchive] =
    useState<GuestBackupArchive | null>(
      null,
    );

  const [targetStorage, setTargetStorage] =
    useState<string | null>(null);

  const [startAfterRestore, setStartAfterRestore] =
    useState(
      guest.status?.toLowerCase() === 'running',
    );

  const [confirmation, setConfirmation] =
    useState('');

  const [restoreSubmitting, setRestoreSubmitting] =
    useState(false);

  const [restoreSuccess, setRestoreSuccess] =
    useState<string | null>(null);

  const [restoreError, setRestoreError] =
    useState<string | null>(null);


  const guestType =
    guest.type === 'qemu'
    || guest.type === 'lxc'
      ? guest.type
      : null;


  const enabledJobs = useMemo(() => {
    return (
      dashboard.data?.backup_jobs
      ?? []
    ).filter(
      (job) =>
        Boolean(job.enabled)
        && job.infrastructure_id
          === guest.infrastructure_id,
    );
  }, [
    dashboard.data?.backup_jobs,
    guest.infrastructure_id,
  ]);


  const selectedJob =
    useMemo(() => {
      return enabledJobs.find(
        (job) =>
          job.id === selectedJobId,
      );
    }, [
      enabledJobs,
      selectedJobId,
    ]);


  const targetStorageOptions =
    useMemo(() => {
      if (!guestType) {
        return [];
      }

      const requiredContent =
        guestType === 'qemu'
          ? 'images'
          : 'rootdir';

      const names =
        new Set<string>();

      for (
        const storage
        of dashboard.data?.storages ?? []
      ) {
        if (
          storage.infrastructure_id
          !== guest.infrastructure_id
        ) {
          continue;
        }

        if (
          storage.node
          && guest.node
          && storage.node !== guest.node
          && !Boolean(storage.shared)
        ) {
          continue;
        }

        const storageName =
          storage.storage?.trim();

        if (!storageName) {
          continue;
        }

        const contentTypes =
          String(
            storage.content ?? '',
          )
            .split(',')
            .map((value) =>
              value.trim(),
            )
            .filter(Boolean);

        if (
          !contentTypes.includes(
            requiredContent,
          )
        ) {
          continue;
        }

        names.add(storageName);
      }

      return Array.from(names)
        .sort((a, b) =>
          a.localeCompare(b),
        )
        .map((storage) => ({
          value: storage,
          label: storage,
        }));
    }, [
      dashboard.data?.storages,
      guest.infrastructure_id,
      guest.node,
      guestType,
    ]);


  useEffect(() => {
    if (!opened) {
      return;
    }

    if (
      selectedJobId
      && enabledJobs.some(
        (job) =>
          job.id === selectedJobId,
      )
    ) {
      return;
    }

    setSelectedJobId(
      enabledJobs.length === 1
        ? enabledJobs[0].id
        : null,
    );
  }, [
    enabledJobs,
    opened,
    selectedJobId,
  ]);


  async function loadArchives():
    Promise<void> {
    if (
      !guest.node
      || !guestType
    ) {
      return;
    }

    setLoadingArchives(true);
    setArchiveError(null);

    try {
      const params =
        new URLSearchParams({
          infrastructure_id:
            String(
              guest.infrastructure_id,
            ),
          node:
            guest.node,
          guest_type:
            guestType,
          vmid:
            String(
              guest.vmid,
            ),
        });

      const response =
        await fetch(
          `/api/backup/guest-archives?${params.toString()}`,
        );

      const result =
        await response
          .json()
          .catch(() => null) as
            | GuestBackupArchiveResponse
            | { detail?: string }
            | null;

      if (!response.ok) {
        const detail =
          result
          && typeof result === 'object'
          && 'detail' in result
          && result.detail
            ? result.detail
            : (
              'Backup archives could not '
              + `be loaded (HTTP ${response.status}).`
            );

        throw new Error(
          String(detail),
        );
      }

      if (
        !result
        || typeof result !== 'object'
        || !('archives' in result)
        || !Array.isArray(
          result.archives,
        )
      ) {
        throw new Error(
          'The server returned an invalid backup archive response.',
        );
      }

      setArchives(
        [...result.archives].sort(
          (a, b) =>
            Number(
              b.ctime ?? 0,
            )
            - Number(
              a.ctime ?? 0,
            ),
        ),
      );
    } catch (error) {
      setArchives([]);

      setArchiveError(
        error instanceof Error
          ? error.message
          : (
            'Backup archives could '
            + 'not be loaded.'
          ),
      );
    } finally {
      setLoadingArchives(false);
    }
  }


  async function openModal():
    Promise<void> {
    setOpened(true);

    setSuccessMessage(null);
    setErrorMessage(null);

    await loadArchives();
  }


  function closeModal(): void {
    if (
      submitting
      || restoreSubmitting
    ) {
      return;
    }

    setOpened(false);
    setSuccessMessage(null);
    setErrorMessage(null);
    setArchiveError(null);
  }


  async function startBackup():
    Promise<void> {
    if (
      !selectedJob
      || !guest.node
    ) {
      return;
    }

    setSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response =
        await fetch(
          '/api/backup/guest',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                infrastructure_id:
                  guest.infrastructure_id,
                job_id:
                  selectedJob.id,
                node:
                  guest.node,
                guest_type:
                  guest.type,
                vmid:
                  guest.vmid,
                confirmed:
                  true,
              }),
          },
        );

      const result =
        await response
          .json()
          .catch(() => null) as
            | GuestBackupResponse
            | { detail?: string }
            | null;

      if (!response.ok) {
        const detail =
          result
          && typeof result === 'object'
          && 'detail' in result
          && result.detail
            ? result.detail
            : (
              'Backup start failed with '
              + `HTTP ${response.status}.`
            );

        throw new Error(
          String(detail),
        );
      }

      setSuccessMessage(
        `Backup for ${
          guest.name
          || `VMID ${guest.vmid}`
        } was started on ${
          guest.node
        }.`,
      );

      await dashboard.refetch();

      window.setTimeout(
        () => {
          void dashboard.refetch();
          void loadArchives();
        },
        2500,
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : (
            'The backup could '
            + 'not be started.'
          ),
      );
    } finally {
      setSubmitting(false);
    }
  }


  function openRestore(
    archive: GuestBackupArchive,
  ): void {
    setRestoreArchive(archive);
    setTargetStorage(null);
    setStartAfterRestore(
      guest.status?.toLowerCase() === 'running',
    );
    setConfirmation('');
    setRestoreSuccess(null);
    setRestoreError(null);
    setRestoreOpened(true);
  }


  function closeRestore(): void {
    if (restoreSubmitting) {
      return;
    }

    setRestoreOpened(false);
    setRestoreArchive(null);
    setTargetStorage(null);
    setStartAfterRestore(false);
    setConfirmation('');
    setRestoreSuccess(null);
    setRestoreError(null);
  }


  async function startRestore():
    Promise<void> {
    if (
      !guest.node
      || !guestType
      || !restoreArchive
      || confirmation !== 'RESTORE'
    ) {
      return;
    }

    setRestoreSubmitting(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const response =
        await fetch(
          '/api/backup/guest-restore',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                infrastructure_id:
                  guest.infrastructure_id,
                node:
                  guest.node,
                guest_type:
                  guestType,
                vmid:
                  guest.vmid,
                archive:
                  restoreArchive.volid,
                target_storage:
                  targetStorage || null,
                start_after_restore:
                  startAfterRestore,
                confirmed:
                  true,
              }),
          },
        );

      const result =
        await response
          .json()
          .catch(() => null) as
            | GuestRestoreResponse
            | { detail?: string }
            | null;

      if (!response.ok) {
        const detail =
          result
          && typeof result === 'object'
          && 'detail' in result
          && result.detail
            ? result.detail
            : (
              'Restore could not be '
              + `started (HTTP ${response.status}).`
            );

        throw new Error(
          String(detail),
        );
      }

      setRestoreSuccess(
        `Restore for ${
          guest.name
          || `VMID ${guest.vmid}`
        } was started.`,
      );

      setConfirmation('');

      await dashboard.refetch();

    } catch (error) {
      setRestoreError(
        error instanceof Error
          ? error.message
          : (
            'The guest restore could '
            + 'not be started.'
          ),
      );
    } finally {
      setRestoreSubmitting(false);
    }
  }


  const guestTypeLabel =
    guestType === 'qemu'
      ? 'Virtual machine'
      : guestType === 'lxc'
        ? 'LXC container'
        : 'Unsupported guest';


  return (
    <>
      <OperatorButton
        variant="light"
        color="indigo"
        leftSection={
          <IconArchive size={16} />
        }
        disabled={
          !guest.node
          || !guestType
        }
        permissionTooltip="Operator or administrator permissions required to manage guest backups."
        onClick={() =>
          void openModal()
        }
      >
        Backup
      </OperatorButton>


      <Modal
        opened={opened}
        onClose={closeModal}
        title={`Backups — ${
          guest.name
          || `Guest ${guest.vmid}`
        }`}
        centered
        size="lg"
        closeOnClickOutside={
          !submitting
          && !restoreSubmitting
        }
        closeOnEscape={
          !submitting
          && !restoreSubmitting
        }
      >
        <Stack gap="lg">
          <Paper
            withBorder
            p="md"
            radius="md"
          >
            <Group
              justify="space-between"
              align="flex-start"
            >
              <div>
                <Text fw={700}>
                  {
                    guest.name
                    || `Guest ${guest.vmid}`
                  }
                </Text>

                <Text
                  size="sm"
                  c="dimmed"
                >
                  {guestTypeLabel}
                  {' · '}
                  VMID {guest.vmid}
                </Text>

                <Text
                  size="sm"
                  c="dimmed"
                >
                  Node:{' '}
                  {
                    guest.node
                    || 'Unknown'
                  }
                </Text>
              </div>

              <Badge
                color={
                  guest.status
                    ?.toLowerCase()
                    === 'running'
                    ? 'green'
                    : 'gray'
                }
                variant="light"
              >
                {
                  guest.status
                  || 'Unknown'
                }
              </Badge>
            </Group>
          </Paper>


          <Stack gap="md">
            <Text fw={700}>
              Create backup
            </Text>

            {
              dashboard.isLoading
                ? (
                  <Text
                    size="sm"
                    c="dimmed"
                  >
                    Loading backup jobs…
                  </Text>
                )
                : enabledJobs.length === 0
                  ? (
                    <Alert
                      color="yellow"
                      icon={
                        <IconAlertCircle
                          size={20}
                        />
                      }
                      title="No enabled backup job"
                    >
                      At least one enabled
                      Proxmox backup job is
                      required before an
                      individual guest backup
                      can be started.
                    </Alert>
                  )
                  : (
                    <Select
                      label="Backup job"
                      description={
                        enabledJobs.length > 1
                          ? 'Select the configuration that should be used.'
                          : 'The available backup job has been selected automatically.'
                      }
                      placeholder="Select backup job"
                      value={selectedJobId}
                      onChange={setSelectedJobId}
                      allowDeselect={
                        enabledJobs.length > 1
                      }
                      data={
                        enabledJobs.map(
                          (job) => ({
                            value:
                              job.id,
                            label:
                              `${job.id} · ${
                                job.storage
                                || 'Unknown storage'
                              }`,
                          }),
                        )
                      }
                      leftSection={
                        <IconDatabase
                          size={16}
                        />
                      }
                      disabled={submitting}
                    />
                  )
            }


            {
              selectedJob
              && (
                <SimpleGrid
                  cols={{
                    base: 1,
                    sm: 2,
                  }}
                >
                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      Storage
                    </Text>

                    <Text fw={600}>
                      {
                        selectedJob.storage
                        || 'Unknown'
                      }
                    </Text>
                  </Paper>

                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      Mode
                    </Text>

                    <Text fw={600}>
                      {
                        selectedJob.mode
                        || 'snapshot'
                      }
                    </Text>
                  </Paper>

                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      Compression
                    </Text>

                    <Text fw={600}>
                      {
                        selectedJob.compress
                        || 'zstd'
                      }
                    </Text>
                  </Paper>

                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      Retention
                    </Text>

                    <Text fw={600}>
                      {
                        retentionText(
                          selectedJob[
                            'prune-backups'
                          ],
                        )
                      }
                    </Text>
                  </Paper>
                </SimpleGrid>
              )
            }


            {
              successMessage
              && (
                <Alert
                  color="green"
                  icon={
                    <IconCheck
                      size={20}
                    />
                  }
                  title="Backup started"
                >
                  {successMessage}
                </Alert>
              )
            }

            {
              errorMessage
              && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle
                      size={20}
                    />
                  }
                  title="Unable to start backup"
                >
                  {errorMessage}
                </Alert>
              )
            }


            <Group justify="flex-end">
              <OperatorButton
                color="indigo"
                leftSection={
                  <IconArchive
                    size={16}
                  />
                }
                loading={submitting}
                disabled={
                  !selectedJob
                  || !guest.node
                  || enabledJobs.length === 0
                }
                permissionTooltip="Operator or administrator permissions required to start guest backups."
                onClick={() =>
                  void startBackup()
                }
              >
                Start backup
              </OperatorButton>
            </Group>
          </Stack>


          <Divider />


          <Stack gap="md">
            <Group
              justify="space-between"
              align="center"
            >
              <div>
                <Text fw={700}>
                  Available backups
                </Text>

                <Text
                  size="sm"
                  c="dimmed"
                >
                  Restore this guest from
                  an existing Proxmox
                  backup archive.
                </Text>
              </div>

              <Button
                variant="default"
                loading={loadingArchives}
                disabled={
                  submitting
                  || restoreSubmitting
                }
                onClick={() =>
                  void loadArchives()
                }
              >
                Refresh
              </Button>
            </Group>


            {
              archiveError
              && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle
                      size={20}
                    />
                  }
                  title="Unable to load backups"
                >
                  {archiveError}
                </Alert>
              )
            }


            {
              loadingArchives
              && archives.length === 0
                ? (
                  <Group
                    justify="center"
                    py="xl"
                  >
                    <Loader />
                  </Group>
                )
                : archives.length === 0
                  ? (
                    <Paper
                      withBorder
                      p="lg"
                      radius="md"
                    >
                      <Text
                        size="sm"
                        c="dimmed"
                        ta="center"
                      >
                        No backup archives
                        were found for this
                        guest.
                      </Text>
                    </Paper>
                  )
                  : (
                    <Stack gap="sm">
                      {
                        archives.map(
                          (archive) => (
                            <Paper
                              key={
                                archive.volid
                              }
                              withBorder
                              radius="md"
                              p="md"
                            >
                              <Group
                                justify="space-between"
                                align="center"
                                wrap="nowrap"
                              >
                                <div>
                                  <Text fw={600}>
                                    {
                                      formatBackupDate(
                                        archive.ctime,
                                      )
                                    }
                                  </Text>

                                  <Text
                                    size="sm"
                                    c="dimmed"
                                  >
                                    {
                                      archive.storage
                                    }
                                    {' · '}
                                    {
                                      formatBytes(
                                        archive.size,
                                      )
                                    }
                                    {' · '}
                                    {
                                      archive.format
                                      || 'Unknown format'
                                    }
                                  </Text>

                                  {
                                    archive.notes
                                    && (
                                      <Text
                                        size="xs"
                                        c="dimmed"
                                        mt={4}
                                      >
                                        {
                                          archive.notes
                                        }
                                      </Text>
                                    )
                                  }
                                </div>

                                <OperatorButton
                                  variant="light"
                                  color="orange"
                                  leftSection={
                                    <IconHistory
                                      size={16}
                                    />
                                  }
                                  disabled={
                                    submitting
                                    || restoreSubmitting
                                  }
                                  permissionTooltip="Operator or administrator permissions required to restore guests from backup."
                                  onClick={() =>
                                    openRestore(
                                      archive,
                                    )
                                  }
                                >
                                  Restore
                                </OperatorButton>
                              </Group>
                            </Paper>
                          ),
                        )
                      }
                    </Stack>
                  )
            }
          </Stack>


          <Divider />


          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={closeModal}
              disabled={
                submitting
                || restoreSubmitting
              }
            >
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>


      <Modal
        opened={restoreOpened}
        onClose={closeRestore}
        title="Restore backup"
        centered
        size="lg"
        closeOnClickOutside={
          !restoreSubmitting
        }
        closeOnEscape={
          !restoreSubmitting
        }
      >
        <Stack gap="md">
          {
            restoreArchive
            && (
              <>
                <Alert
                  color="red"
                  icon={
                    <IconAlertTriangle
                      size={20}
                    />
                  }
                  title="Destructive restore operation"
                >
                  Restoring this backup
                  replaces the current
                  guest state. The guest
                  may be stopped during
                  the restore.
                </Alert>


                <Paper
                  withBorder
                  p="md"
                  radius="md"
                >
                  <Stack gap="xs">
                    <Group
                      justify="space-between"
                    >
                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        Backup date
                      </Text>

                      <Text
                        size="sm"
                        fw={600}
                      >
                        {
                          formatBackupDate(
                            restoreArchive.ctime,
                          )
                        }
                      </Text>
                    </Group>

                    <Group
                      justify="space-between"
                    >
                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        Source storage
                      </Text>

                      <Text
                        size="sm"
                        fw={600}
                      >
                        {
                          restoreArchive.storage
                        }
                      </Text>
                    </Group>

                    <Group
                      justify="space-between"
                    >
                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        Size
                      </Text>

                      <Text
                        size="sm"
                        fw={600}
                      >
                        {
                          formatBytes(
                            restoreArchive.size,
                          )
                        }
                      </Text>
                    </Group>

                    <Group
                      justify="space-between"
                    >
                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        Format
                      </Text>

                      <Text
                        size="sm"
                        fw={600}
                      >
                        {
                          restoreArchive.format
                          || 'Unknown'
                        }
                      </Text>
                    </Group>
                  </Stack>
                </Paper>


                <Select
                  label="Target storage"
                  description={
                    'Optional. Leave empty '
                    + 'to let Proxmox use '
                    + 'the storage configuration '
                    + 'from the backup.'
                  }
                  placeholder="Use original storage configuration"
                  value={targetStorage}
                  onChange={setTargetStorage}
                  clearable
                  data={
                    targetStorageOptions
                  }
                  leftSection={
                    <IconDatabase
                      size={16}
                    />
                  }
                  disabled={
                    restoreSubmitting
                  }
                />


                <Checkbox
                  label="Start guest after restore"
                  description={
                    startAfterRestore
                      ? (
                        'The guest will be started '
                        + 'after the restore completes successfully.'
                      )
                      : (
                        'The guest will remain stopped '
                        + 'after the restore completes successfully.'
                      )
                  }
                  checked={
                    startAfterRestore
                  }
                  onChange={(event) =>
                    setStartAfterRestore(
                      event.currentTarget.checked,
                    )
                  }
                  disabled={
                    restoreSubmitting
                  }
                />


                <Alert
                  color="orange"
                  icon={
                    <IconAlertTriangle
                      size={20}
                    />
                  }
                  title="Confirmation required"
                >
                  Type{' '}
                  <Text
                    span
                    fw={700}
                  >
                    RESTORE
                  </Text>
                  {' '}
                  to confirm this
                  destructive operation.
                </Alert>


                <TextInput
                  label="Confirmation"
                  placeholder="RESTORE"
                  value={confirmation}
                  onChange={(event) =>
                    setConfirmation(
                      event.currentTarget.value,
                    )
                  }
                  disabled={
                    restoreSubmitting
                  }
                />


                {
                  restoreSuccess
                  && (
                    <Alert
                      color="green"
                      icon={
                        <IconCheck
                          size={20}
                        />
                      }
                      title="Restore started"
                    >
                      {restoreSuccess}
                    </Alert>
                  )
                }


                {
                  restoreError
                  && (
                    <Alert
                      color="red"
                      icon={
                        <IconAlertTriangle
                          size={20}
                        />
                      }
                      title="Unable to restore guest"
                    >
                      {restoreError}
                    </Alert>
                  )
                }


                <Group justify="flex-end">
                  <Button
                    variant="default"
                    onClick={closeRestore}
                    disabled={
                      restoreSubmitting
                    }
                  >
                    {
                      restoreSuccess
                        ? 'Close'
                        : 'Cancel'
                    }
                  </Button>

                  <OperatorButton
                    color="red"
                    leftSection={
                      <IconHistory
                        size={16}
                      />
                    }
                    loading={
                      restoreSubmitting
                    }
                    disabled={
                      confirmation
                        !== 'RESTORE'
                      || Boolean(
                        restoreSuccess,
                      )
                    }
                    permissionTooltip="Operator or administrator permissions required to restore guests from backup."
                    onClick={() =>
                      void startRestore()
                    }
                  >
                    Restore guest
                  </OperatorButton>
                </Group>
              </>
            )
          }
        </Stack>
      </Modal>
    </>
  );
}
