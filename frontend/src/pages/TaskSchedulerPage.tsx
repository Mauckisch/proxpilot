import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  DateTimePicker,
  DatesProvider,
} from '@mantine/dates';
import {
  IconAlertCircle,
  IconCalendarTime,
  IconEdit,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../api';
import {
  InfrastructureSelectOption,
} from '../components/InfrastructureSelectOption';
import { ACTIONS } from '../constants/schedulerActions';
import { useAuth } from '../auth';
import { useDashboard } from '../hooks/useDashboard';
import {
  getInfrastructureHealth,
  getInfrastructureHealthLabel,
} from '../utils/infrastructureHealth';

import {
  type ScheduledTask,
  type ScheduledTaskInput,
  type SchedulerIntervalUnit,
  useCreateScheduledTask,
  useDeleteScheduledTask,
  useRunScheduledTask,
  useScheduledTasks,
  useSetScheduledTaskEnabled,
  useUpdateScheduledTask,
} from '../hooks/useScheduledTasks';

type Snapshot = {
  name: string;
};

type SnapshotResponse = {
  snapshots: Snapshot[];
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
};


type GuestBackupArchiveResponse = {
  infrastructure_id: number;
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  count: number;
  archives: GuestBackupArchive[];
};


const INTERVAL_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

function formatDate(
  value: string | null | undefined,
  timeFormat: '12h' | '24h',
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12:
          timeFormat === '12h',
      },
    ).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  return (
    `${values.year}-${values.month}-${values.day} ` +
    `${values.hour}:${values.minute}`
  );
}

function formatBackupBytes(
  value?: number,
): string {
  if (
    value === undefined
    || value === null
    || !Number.isFinite(value)
    || value < 0
  ) {
    return 'Unknown size';
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


function formatBackupArchiveDate(
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
      timeStyle: 'short',
    },
  ).format(
    new Date(timestamp * 1000),
  );
}


function toLocalInputValue(
  value?: string | null,
): string {
  if (!value) {
    const date = new Date(
      Date.now() + 60 * 60 * 1000,
    );

    date.setSeconds(0, 0);

    const offset =
      date.getTimezoneOffset() * 60000;

    return new Date(
      date.getTime() - offset,
    )
      .toISOString()
      .slice(0, 16);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset =
    date.getTimezoneOffset() * 60000;

  return new Date(
    date.getTime() - offset,
  )
    .toISOString()
    .slice(0, 16);
}

function actionIsGuest(action: string) {
  return (
    action.startsWith('guest.') ||
    action === 'backup.guest' ||
    action === 'backup.guest_restore' ||
    action.startsWith('snapshot.')
  );
}

function actionIsNode(action: string) {
  return action.startsWith('node.');
}

function actionAllowsMultipleNodes(
  action: string,
): boolean {
  return [
    'node.check_updates',
    'node.install_updates',
    'node.package_cleanup',
  ].includes(action);
}

type TaskSchedulerPageProps = {
  timeFormat: '12h' | '24h';
};

export function TaskSchedulerPage({
  timeFormat,
}: TaskSchedulerPageProps) {
  const { canOperate } = useAuth();
  const dashboard = useDashboard();
  const tasks = useScheduledTasks();

  const createTask = useCreateScheduledTask();
  const updateTask = useUpdateScheduledTask();
  const setEnabled =
    useSetScheduledTaskEnabled();
  const deleteTask =
    useDeleteScheduledTask();

  const runTask =
    useRunScheduledTask();

  const [
    editorOpened,
    editorModal,
  ] = useDisclosure(false);

  const [
    editingTask,
    setEditingTask,
  ] = useState<ScheduledTask | null>(
    null,
  );

  const [
    infrastructureId,
    setInfrastructureId,
  ] = useState<number | null>(null);

  const [name, setName] =
    useState('');
  const [description, setDescription] =
    useState('');
  const [action, setAction] =
    useState('');

  const [nodes, setNodes] =
    useState<string[]>([]);

  const [guestKey, setGuestKey] =
    useState<string | null>(null);
  const [startAt, setStartAt] =
    useState(toLocalInputValue());
  const [repeatEnabled, setRepeatEnabled] =
    useState(false);
  const [
    intervalValue,
    setIntervalValue,
  ] = useState<number | string>(1);
  const [
    intervalUnit,
    setIntervalUnit,
  ] =
    useState<SchedulerIntervalUnit>('days');

  const [
    snapshotName,
    setSnapshotName,
  ] = useState<string | null>(null);
  const [
    snapshotCreateName,
    setSnapshotCreateName,
  ] = useState('');
  const [
    backupJobId,
    setBackupJobId,
  ] = useState<string | null>(null);

  const [
    restoreArchives,
    setRestoreArchives,
  ] = useState<GuestBackupArchive[]>([]);

  const [
    restoreArchive,
    setRestoreArchive,
  ] = useState<string | null>(null);

  const [
    restoreArchivesLoading,
    setRestoreArchivesLoading,
  ] = useState(false);

  const [
    restoreTargetStorage,
    setRestoreTargetStorage,
  ] = useState<string | null>(null);

  const [
    restoreStartAfter,
    setRestoreStartAfter,
  ] = useState(false);

  const [
    migrationTarget,
    setMigrationTarget,
  ] = useState<string | null>(null);

  const [snapshots, setSnapshots] =
    useState<Snapshot[]>([]);
  const [
    snapshotsLoading,
    setSnapshotsLoading,
  ] = useState(false);

  const [formError, setFormError] =
    useState<string | null>(null);

  const infrastructureOptions =
    useMemo(() => {
      const nodes =
        dashboard.data?.nodes ?? [];

      const seen =
        new Map<
          number,
          {
            value: string;
            label: string;
            health:
              | 'online'
              | 'partial'
              | 'disconnected';
          }
        >();

      for (const entry of nodes) {
        if (
          seen.has(
            entry.infrastructure_id,
          )
        ) {
          continue;
        }

        const infrastructureNodes =
          nodes.filter(
            (node) =>
              node.infrastructure_id ===
              entry.infrastructure_id,
          );

        const health =
          getInfrastructureHealth(
            infrastructureNodes,
          );

        seen.set(
          entry.infrastructure_id,
          {
            value: String(
              entry.infrastructure_id,
            ),
            label: `${
              entry.infrastructure_name
            } · ${
              entry.infrastructure_type ===
              'cluster'
                ? 'Cluster'
                : 'Standalone'
            } · ${
              getInfrastructureHealthLabel(
                health,
              )
            }`,
            health,
          },
        );
      }

      return Array.from(
        seen.values(),
      );
    }, [dashboard.data?.nodes]);

  const nodeOptions = useMemo(
    () =>
      (dashboard.data?.nodes ?? [])
        .filter(
          (entry) =>
            infrastructureId !== null &&
            entry.infrastructure_id ===
              infrastructureId,
        )
        .map(
          (entry) => ({
            value: entry.node,
            label: entry.node,
          }),
        )
        .sort((a, b) =>
          a.label.localeCompare(
            b.label,
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          ),
        ),
    [
      dashboard.data?.nodes,
      infrastructureId,
    ],
  );

  const guestOptions = useMemo(
    () =>
      (dashboard.data?.guests ?? [])
        .filter(
          (guest) =>
            guest.infrastructure_id ===
              infrastructureId &&
            (
              guest.type === 'qemu' ||
              guest.type === 'lxc'
            ),
        )
        .map((guest) => ({
          value: `${guest.node}|${guest.type}|${guest.vmid}`,
          label:
            `${guest.name || `Guest ${guest.vmid}`} ` +
            `(${guest.type?.toUpperCase()} ${guest.vmid} · ${guest.node})`,
        })),
    [
      dashboard.data?.guests,
      infrastructureId,
    ],
  );

  const backupJobOptions = useMemo(
    () =>
      (dashboard.data?.backup_jobs ?? [])
        .filter(
          (job) =>
            job.infrastructure_id ===
              infrastructureId &&
            job.enabled !== 0,
        )
        .map((job) => ({
          value: job.id,
          label:
            `${job.id}` +
            (job.storage
              ? ` · ${job.storage}`
              : ''),
        })),
    [
      dashboard.data?.backup_jobs,
      infrastructureId,
    ],
  );

  const selectedGuest =
    useMemo(() => {
      if (!guestKey) {
        return null;
      }

      const [
        guestNode,
        guestType,
        vmidText,
      ] = guestKey.split('|');

      const vmid = Number(vmidText);

      if (
        !guestNode ||
        !['qemu', 'lxc'].includes(
          guestType,
        ) ||
        !Number.isInteger(vmid)
      ) {
        return null;
      }

      return {
        node: guestNode,
        guest_type:
          guestType as 'qemu' | 'lxc',
        vmid,
      };
    }, [guestKey]);

  const restoreTargetStorageOptions =
    useMemo(() => {
      if (!selectedGuest) {
        return [];
      }

      const requiredContent =
        selectedGuest.guest_type === 'qemu'
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
          !== infrastructureId
        ) {
          continue;
        }

        if (
          storage.node
          && storage.node
            !== selectedGuest.node
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
      infrastructureId,
      selectedGuest,
    ]);

  useEffect(() => {
    setSnapshots([]);
    setSnapshotName(null);

    if (
      ![
        'snapshot.delete',
        'snapshot.rollback',
      ].includes(action) ||
      !selectedGuest
    ) {
      return;
    }

    const guest = selectedGuest;
    let cancelled = false;

    async function loadSnapshots() {
      setSnapshotsLoading(true);

      try {
        const response =
          await api.get<SnapshotResponse>(
            `/snapshots/${encodeURIComponent(
              guest.node,
            )}/${guest.guest_type}/${guest.vmid}`,
            {
              params: {
                infrastructure_id:
                  infrastructureId,
              },
            },
          );

        if (!cancelled) {
          setSnapshots(
            response.data.snapshots ?? [],
          );
        }
      } catch {
        if (!cancelled) {
          setSnapshots([]);
        }
      } finally {
        if (!cancelled) {
          setSnapshotsLoading(false);
        }
      }
    }

    void loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, [
    action,
    selectedGuest?.node,
    selectedGuest?.guest_type,
    selectedGuest?.vmid,
    infrastructureId,
  ]);

  useEffect(() => {
    setRestoreArchives([]);
    setRestoreArchive(null);

    if (
      action !== 'backup.guest_restore'
      || !selectedGuest
      || infrastructureId === null
    ) {
      return;
    }

    const guest = selectedGuest;
    let cancelled = false;

    async function loadRestoreArchives() {
      setRestoreArchivesLoading(true);

      try {
        const response =
          await api.get<GuestBackupArchiveResponse>(
            '/backup/guest-archives',
            {
              params: {
                infrastructure_id:
                  infrastructureId,
                node:
                  guest.node,
                guest_type:
                  guest.guest_type,
                vmid:
                  guest.vmid,
              },
            },
          );

        if (cancelled) {
          return;
        }

        const loadedArchives =
          [
            ...(
              response.data.archives
              ?? []
            ),
          ].sort(
            (a, b) =>
              Number(
                b.ctime ?? 0,
              )
              - Number(
                a.ctime ?? 0,
              ),
          );

        setRestoreArchives(
          loadedArchives,
        );

        setRestoreArchive(
          loadedArchives[0]?.volid
          ?? null,
        );
      } catch {
        if (!cancelled) {
          setRestoreArchives([]);
          setRestoreArchive(null);
        }
      } finally {
        if (!cancelled) {
          setRestoreArchivesLoading(
            false,
          );
        }
      }
    }

    void loadRestoreArchives();

    return () => {
      cancelled = true;
    };
  }, [
    action,
    selectedGuest?.node,
    selectedGuest?.guest_type,
    selectedGuest?.vmid,
    infrastructureId,
  ]);

  function resetForm() {
    setEditingTask(null);
    setInfrastructureId(null);
    setName('');
    setDescription('');
    setAction('');
    setNodes([]);
    setGuestKey(null);
    setStartAt(toLocalInputValue());
    setRepeatEnabled(false);
    setIntervalValue(1);
    setIntervalUnit('days');
    setSnapshotName(null);
    setSnapshotCreateName('');
    setBackupJobId(null);
    setRestoreArchives([]);
    setRestoreArchive(null);
    setRestoreArchivesLoading(false);
    setRestoreTargetStorage(null);
    setRestoreStartAfter(false);
    setMigrationTarget(null);
    setSnapshots([]);
    setFormError(null);
  }

  function openCreate() {
    resetForm();

    const firstInfrastructure =
      infrastructureOptions[0];

    if (firstInfrastructure) {
      setInfrastructureId(
        Number(
          firstInfrastructure.value,
        ),
      );
    }

    editorModal.open();
  }

  function openEdit(task: ScheduledTask) {
    setEditingTask(task);
    setInfrastructureId(
      task.infrastructure_id,
    );
    setName(task.name);
    setDescription(
      task.description ?? '',
    );
    setAction(task.action);

    const storedNodes =
      Array.isArray(
        task.payload?.nodes,
      )
        ? task.payload.nodes.filter(
            (
              value,
            ): value is string =>
              typeof value === 'string',
          )
        : [];

    setNodes(
      storedNodes.length > 0
        ? storedNodes
        : task.node
          ? [task.node]
          : [],
    );

    if (
      task.node &&
      task.guest_type &&
      task.vmid
    ) {
      setGuestKey(
        `${task.node}|${task.guest_type}|${task.vmid}`,
      );
    } else {
      setGuestKey(null);
    }

    setStartAt(
      toLocalInputValue(task.start_at),
    );
    setRepeatEnabled(
      task.repeat_enabled,
    );
    setIntervalValue(
      task.interval_value ?? 1,
    );
    setIntervalUnit(
      task.interval_unit ?? 'days',
    );

    setSnapshotName(
      typeof task.payload.snapshot_name ===
        'string'
        ? task.payload.snapshot_name
        : null,
    );

    setSnapshotCreateName(
      task.action === 'snapshot.create' &&
        typeof task.payload.snapshot_name ===
          'string'
        ? task.payload.snapshot_name
        : '',
    );

    setBackupJobId(
      typeof task.payload.job_id ===
        'string'
        ? task.payload.job_id
        : null,
    );

    setRestoreArchive(
      typeof task.payload.archive ===
        'string'
        ? task.payload.archive
        : null,
    );

    setRestoreTargetStorage(
      typeof task.payload.target_storage ===
        'string'
        ? task.payload.target_storage
        : null,
    );

    setRestoreStartAfter(
      task.payload.start_after_restore ===
        true,
    );

    setMigrationTarget(
      typeof task.payload.target_node ===
        'string'
        ? task.payload.target_node
        : null,
    );

    setFormError(null);
    editorModal.open();
  }

  async function saveTask() {
    setFormError(null);

    if (
      infrastructureId === null ||
      infrastructureId <= 0
    ) {
      setFormError(
        'Select an infrastructure.',
      );
      return;
    }

    if (!name.trim()) {
      setFormError('Enter a task name.');
      return;
    }

    if (!action) {
      setFormError('Select an action.');
      return;
    }

    let targetType = '';
    let targetNode: string | null = null;
    let guestType:
      | 'qemu'
      | 'lxc'
      | null = null;
    let vmid: number | null = null;

    if (actionIsGuest(action)) {
      if (!selectedGuest) {
        setFormError(
          'Select a guest.',
        );
        return;
      }

      targetType = 'guest';
      targetNode = selectedGuest.node;
      guestType =
        selectedGuest.guest_type;
      vmid = selectedGuest.vmid;
    }

    if (actionIsNode(action)) {
      if (nodes.length === 0) {
        setFormError(
          'Select at least one node.',
        );
        return;
      }

      if (
        !actionAllowsMultipleNodes(action) &&
        nodes.length > 1
      ) {
        setFormError(
          'This action can only target one node.',
        );
        return;
      }

      targetType = 'node';

      targetNode =
        actionAllowsMultipleNodes(action)
          ? (
              nodes.length === 1
                ? nodes[0]
                : null
            )
          : nodes[0];
    }

    const payload:
      Record<string, unknown> = {};

    if (
      actionIsNode(action) &&
      actionAllowsMultipleNodes(action)
    ) {
      payload.nodes = nodes;
    }

    if (action === 'snapshot.create') {
      if (!snapshotCreateName.trim()) {
        setFormError(
          'Enter a snapshot name.',
        );
        return;
      }

      payload.snapshot_name =
        snapshotCreateName.trim();
    }

    if (
      action === 'snapshot.delete' ||
      action === 'snapshot.rollback'
    ) {
      if (!snapshotName) {
        setFormError(
          snapshots.length === 0
            ? 'The selected guest has no snapshots.'
            : 'Select a snapshot.',
        );
        return;
      }

      payload.snapshot_name =
        snapshotName;
    }

    if (action === 'backup.guest') {
      if (!backupJobId) {
        setFormError(
          'Select a backup job.',
        );
        return;
      }

      payload.job_id = backupJobId;
    }

    if (
      action === 'backup.guest_restore'
    ) {
      if (!restoreArchive) {
        setFormError(
          restoreArchives.length === 0
            ? (
              'The selected guest has no '
              + 'available backup archives.'
            )
            : 'Select a backup archive.',
        );
        return;
      }

      payload.archive =
        restoreArchive;

      if (restoreTargetStorage) {
        payload.target_storage =
          restoreTargetStorage;
      }

      payload.start_after_restore =
        restoreStartAfter;
    }

    if (action === 'guest.migrate') {
      if (!migrationTarget) {
        setFormError(
          'Select a migration target.',
        );
        return;
      }

      if (
        migrationTarget ===
        selectedGuest?.node
      ) {
        setFormError(
          'Migration target must be different from the current node.',
        );
        return;
      }

      payload.target_node =
        migrationTarget;
    }

    const numericInterval =
      typeof intervalValue === 'number'
        ? intervalValue
        : Number(intervalValue);

    if (
      repeatEnabled &&
      (
        !Number.isFinite(
          numericInterval,
        ) ||
        numericInterval <= 0
      )
    ) {
      setFormError(
        'Enter a valid repeat interval.',
      );
      return;
    }

    const input: ScheduledTaskInput = {
      infrastructure_id:
        infrastructureId,
      name: name.trim(),
      description:
        description.trim() || null,
      action,
      target_type: targetType,
      node: targetNode,
      nodes:
        actionIsNode(action)
          ? nodes
          : [],
      guest_type: guestType,
      vmid,
      payload,
      repeat_enabled: repeatEnabled,
      interval_value:
        repeatEnabled
          ? numericInterval
          : null,
      interval_unit:
        repeatEnabled
          ? intervalUnit
          : null,
      timezone:
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone ||
        'UTC',
      start_at: startAt,
      enabled: true,
    };

    try {
      if (editingTask) {
        input.enabled =
          editingTask.enabled;

        await updateTask.mutateAsync({
          id: editingTask.id,
          input,
        });
      } else {
        await createTask.mutateAsync(
          input,
        );
      }

      editorModal.close();
      resetForm();
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error
          ? (
              error as {
                response?: {
                  data?: {
                    detail?: string;
                  };
                };
              }
            ).response?.data?.detail
          : undefined;

      setFormError(
        message ??
          'The scheduled task could not be saved.',
      );
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>
            Task Scheduler
          </Title>

          <Text c="dimmed">
            Schedule operational Proxmox tasks
            for automatic execution.
          </Text>
        </div>

        {canOperate && (
          <Button
            leftSection={
              <IconPlus size={16} />
            }
            onClick={openCreate}
          >
            New task
          </Button>
        )}
      </Group>

      {!canOperate && (
        <Alert
          color="blue"
          title="Read-only access"
        >
          Viewer accounts can inspect scheduled
          tasks but cannot create, modify, enable,
          disable or delete them.
        </Alert>
      )}

      {tasks.isLoading ? (
        <Paper
          withBorder
          radius="md"
          p="lg"
        >
          <Text c="dimmed">
            Loading scheduled tasks...
          </Text>
        </Paper>
      ) : tasks.isError ? (
        <Paper
          withBorder
          radius="md"
          p="lg"
        >
          <Alert
            color="red"
            icon={
              <IconAlertCircle size={18} />
            }
            title="Unable to load Task Scheduler"
          >
            Scheduled tasks could not be loaded.
          </Alert>
        </Paper>
      ) : (tasks.data ?? []).length === 0 ? (
        <Paper
          withBorder
          radius="md"
          p="lg"
        >
          <Stack
            align="center"
            py="xl"
          >
            <IconCalendarTime
              size={38}
              opacity={0.5}
            />

            <Text fw={600}>
              No scheduled tasks
            </Text>

            <Text
              size="sm"
              c="dimmed"
            >
              No automatic tasks have been
              configured yet.
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          {(tasks.data ?? []).map(
            (task) => {
              const infrastructureName =
                dashboard.data?.nodes
                  .find(
                    (entry) =>
                      entry.infrastructure_id ===
                      task.infrastructure_id,
                  )
                  ?.infrastructure_name ??
                `Infrastructure ${task.infrastructure_id}`;

              const actionLabel =
                ACTIONS
                  .flatMap(
                    (group) =>
                      group.items,
                  )
                  .find(
                    (entry) =>
                      entry.value ===
                      task.action,
                  )
                  ?.label ??
                task.action;

              let targetLabel = '—';

              if (
                task.target_type ===
                'guest'
              ) {
                const targetGuest =
                  (
                    dashboard.data?.guests
                    ?? []
                  ).find(
                    (guest) =>
                      guest.infrastructure_id ===
                        task.infrastructure_id
                      && guest.vmid ===
                        task.vmid,
                  );

                const guestName =
                  targetGuest?.name?.trim();

                targetLabel =
                  guestName
                  || (
                    `${task.guest_type?.toUpperCase()} ` +
                    `${task.vmid}`
                  );
              } else if (
                Array.isArray(
                  task.payload?.nodes,
                ) &&
                task.payload.nodes.length > 0
              ) {
                targetLabel = [
                  ...task.payload.nodes,
                ]
                  .map(
                    (targetNode) =>
                      String(targetNode),
                  )
                  .sort(
                    (a, b) =>
                      a.localeCompare(
                        b,
                        undefined,
                        {
                          numeric: true,
                          sensitivity:
                            'base',
                        },
                      ),
                  )
                  .join(', ');
              } else if (task.node) {
                targetLabel =
                  task.node;
              }

              const scheduleLabel =
                task.repeat_enabled
                  ? (
                      `Every ${task.interval_value} ` +
                      `${task.interval_unit}`
                    )
                  : 'Once';

              return (
                <Paper
                  key={task.id}
                  withBorder
                  radius="md"
                  p="lg"
                >
                  <Stack gap="md">
                    <Group
                      justify="space-between"
                      align="flex-start"
                      wrap="nowrap"
                    >
                      <div>
                        <Text
                          fw={700}
                          size="lg"
                        >
                          {task.name}
                        </Text>

                        {task.description && (
                          <Text
                            size="sm"
                            c="dimmed"
                            mt={2}
                          >
                            {task.description}
                          </Text>
                        )}
                      </div>

                      <Badge
                        color={
                          task.enabled
                            ? 'green'
                            : 'gray'
                        }
                        variant="light"
                      >
                        {task.enabled
                          ? 'Enabled'
                          : 'Disabled'}
                      </Badge>
                    </Group>

                    <Group
                      gap="xl"
                      align="flex-start"
                    >
                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Infrastructure
                        </Text>

                        <Text size="sm">
                          {infrastructureName}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Action
                        </Text>

                        <Text size="sm">
                          {actionLabel}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Target
                        </Text>

                        <Text size="sm">
                          {targetLabel}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Schedule
                        </Text>

                        <Text size="sm">
                          {scheduleLabel}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Next run
                        </Text>

                        <Text size="sm">
                          {formatDate(
                            task.next_run,
                            timeFormat,
                          )}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Last result
                        </Text>

                        {task.last_result ? (
                          <Badge
                            color={
                              task.last_result ===
                              'success'
                                ? 'green'
                                : 'red'
                            }
                            variant="light"
                          >
                            {task.last_result}
                          </Badge>
                        ) : (
                          <Text size="sm">
                            —
                          </Text>
                        )}
                      </Stack>

                      <Stack gap={2}>
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                        >
                          Created by
                        </Text>

                        <Text size="sm">
                          {task.created_by_username}
                        </Text>
                      </Stack>
                    </Group>

                    {canOperate && (
                      <Group
                        justify="space-between"
                        align="center"
                        pt="sm"
                        style={{
                          borderTop:
                            '1px solid var(--proxpilot-blue-border)',
                        }}
                      >
                        <Group
                          gap="sm"
                          align="center"
                        >
                          <Text
                            size="sm"
                            fw={600}
                          >
                            Actions
                          </Text>

                          <Switch
                            checked={
                              task.enabled
                            }
                            label={
                              task.enabled
                                ? 'Enabled'
                                : 'Disabled'
                            }
                            disabled={
                              setEnabled.isPending
                            }
                            onChange={(event) => {
                              const enabled =
                                event.currentTarget
                                  .checked;

                              void setEnabled
                                .mutateAsync({
                                  id: task.id,
                                  enabled,
                                });
                            }}
                          />
                        </Group>

                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="default"
                            leftSection={
                              <IconEdit
                                size={14}
                              />
                            }
                            onClick={() =>
                              openEdit(task)
                            }
                          >
                            Edit
                          </Button>

                          <Button
                            size="xs"
                            variant="outline"
                            color="red"
                            leftSection={
                              <IconTrash
                                size={14}
                              />
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete scheduled task "${task.name}"?`,
                                )
                              ) {
                                void deleteTask
                                  .mutateAsync(
                                    task.id,
                                  );
                              }
                            }}
                          >
                            Delete
                          </Button>

                          <Button
                            size="xs"
                            color="green"
                            leftSection={
                              <IconPlayerPlay
                                size={14}
                              />
                            }
                            loading={
                              runTask.isPending &&
                              runTask.variables ===
                                task.id
                            }
                            disabled={
                              runTask.isPending &&
                              runTask.variables !==
                                task.id
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Run scheduled task "${task.name}" now?\n\nThe configured schedule will not be changed.`,
                                )
                              ) {
                                void runTask
                                  .mutateAsync(
                                    task.id,
                                  );
                              }
                            }}
                          >
                            Run now
                          </Button>
                        </Group>
                      </Group>
                    )}
                  </Stack>
                </Paper>
              );
            },
          )}
        </Stack>
      )}

      <Modal
        opened={editorOpened}
        onClose={() => {
          editorModal.close();
          resetForm();
        }}
        title={
          editingTask
            ? 'Edit scheduled task'
            : 'New scheduled task'
        }
        size="lg"
      >
        <Stack>
          {formError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle
                  size={18}
                />
              }
            >
              {formError}
            </Alert>
          )}

          <TextInput
            label="Task name"
            required
            value={name}
            onChange={(event) =>
              setName(
                event.currentTarget.value,
              )
            }
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(event) =>
              setDescription(
                event.currentTarget.value,
              )
            }
          />

          <Select
            label="Infrastructure"
            required
            data={
              infrastructureOptions
            }
            renderOption={({ option }) => {
              const infrastructure =
                infrastructureOptions.find(
                  (item) =>
                    item.value ===
                    option.value,
                );

              return (
                <InfrastructureSelectOption
                  label={option.label}
                  health={
                    infrastructure?.health ??
                    'disconnected'
                  }
                />
              );
            }}
            value={
              infrastructureId !== null
                ? String(
                    infrastructureId,
                  )
                : null
            }
            onChange={(value) => {
              const parsed =
                value
                  ? Number(value)
                  : null;

              setInfrastructureId(
                parsed &&
                Number.isInteger(parsed)
                  ? parsed
                  : null,
              );

                        setNodes([]);
              setGuestKey(null);
              setSnapshotName(null);
              setSnapshotCreateName('');
              setBackupJobId(null);
              setMigrationTarget(null);
            }}
            allowDeselect={false}
          />

          <Select
            label="Action"
            required
            data={ACTIONS}
            value={action}
            disabled={
              infrastructureId === null
            }
            onChange={(value) => {
              setAction(value ?? '');
              setNodes([]);
              setGuestKey(null);
              setSnapshotName(null);
              setSnapshotCreateName('');
              setBackupJobId(null);
              setRestoreArchives([]);
              setRestoreArchive(null);
              setRestoreTargetStorage(null);
              setRestoreStartAfter(false);
              setMigrationTarget(null);
            }}
            searchable
          />

          {action &&
            actionIsGuest(action) && (
              <Select
                label="Guest"
                required
                searchable
                data={guestOptions}
                value={guestKey}
                onChange={setGuestKey}
              />
            )}

          {action &&
            actionIsNode(action) &&
            actionAllowsMultipleNodes(
              action,
            ) && (
              <MultiSelect
                label="Nodes"
                required
                searchable
                clearable
                data={nodeOptions}
                value={nodes}
                onChange={setNodes}
                placeholder="Select one or more nodes"
                description={
                  nodes.length > 1
                    ? `${nodes.length} nodes will run as one batch task.`
                    : 'Select one or more nodes.'
                }
              />
            )}

          {action &&
            actionIsNode(action) &&
            !actionAllowsMultipleNodes(
              action,
            ) && (
              <Select
                label="Node"
                required
                searchable
                data={nodeOptions}
                value={
                  nodes[0] ?? null
                }
                onChange={(value) =>
                  setNodes(
                    value
                      ? [value]
                      : [],
                  )
                }
                placeholder="Select one node"
                description="This action can only target one node."
              />
            )}

          {action ===
            'snapshot.create' && (
            <TextInput
              label="Snapshot name"
              required
              value={
                snapshotCreateName
              }
              onChange={(event) =>
                setSnapshotCreateName(
                  event.currentTarget
                    .value,
                )
              }
              description="Letters, numbers, dots, underscores and hyphens are recommended."
            />
          )}

          {[
            'snapshot.delete',
            'snapshot.rollback',
          ].includes(action) &&
            selectedGuest && (
              <Select
                label="Snapshot"
                required
                searchable
                disabled={
                  snapshotsLoading ||
                  snapshots.length === 0
                }
                data={snapshots.map(
                  (snapshot) => ({
                    value: snapshot.name,
                    label: snapshot.name,
                  }),
                )}
                value={snapshotName}
                onChange={setSnapshotName}
                description={
                  snapshotsLoading
                    ? 'Loading snapshots...'
                    : snapshots.length === 0
                      ? 'This guest has no snapshots.'
                      : action === 'snapshot.rollback'
                        ? 'Select the snapshot that should be restored when the task runs.'
                        : 'Select the snapshot that should be deleted when the task runs.'
                }
              />
            )}

          {action === 'backup.guest' && (
            <Select
              label="Backup job"
              required
              searchable
              data={backupJobOptions}
              value={backupJobId}
              onChange={setBackupJobId}
            />
          )}

          {action ===
            'backup.guest_restore' &&
            selectedGuest && (
              <Stack gap="sm">
                <Select
                  label="Backup archive"
                  required
                  searchable
                  disabled={
                    restoreArchivesLoading ||
                    restoreArchives.length === 0
                  }
                  data={
                    restoreArchives.map(
                      (archive) => ({
                        value:
                          archive.volid,
                        label: [
                          formatBackupArchiveDate(
                            archive.ctime,
                          ),
                          formatBackupBytes(
                            archive.size,
                          ),
                          archive.storage,
                          archive.format
                            || 'Unknown format',
                        ].join(' · '),
                      }),
                    )
                  }
                  value={
                    restoreArchive
                  }
                  onChange={
                    setRestoreArchive
                  }
                  description={
                    restoreArchivesLoading
                      ? 'Loading available backup archives...'
                      : restoreArchives.length === 0
                        ? 'No backup archives are available for this guest.'
                        : 'The newest backup is selected automatically.'
                  }
                />

                <Select
                  label="Target storage"
                  searchable
                  clearable
                  data={
                    restoreTargetStorageOptions
                  }
                  value={
                    restoreTargetStorage
                  }
                  onChange={
                    setRestoreTargetStorage
                  }
                  placeholder="Use original storage configuration"
                  description="Optional. Leave empty to let Proxmox restore the storage configuration from the backup."
                />

                <Switch
                  label="Start guest after restore"
                  description={
                    restoreStartAfter
                      ? 'The guest will be started after a successful restore.'
                      : 'The guest will remain stopped after a successful restore.'
                  }
                  checked={
                    restoreStartAfter
                  }
                  onChange={(event) =>
                    setRestoreStartAfter(
                      event.currentTarget.checked,
                    )
                  }
                />

                <Alert
                  color="red"
                  title="Destructive restore"
                >
                  This scheduled action overwrites
                  the current guest with the selected
                  backup. A failed restore may
                  intentionally leave the guest
                  stopped for safety.
                </Alert>
              </Stack>
            )}

          {action === 'guest.migrate' && (
            <Select
              label="Target node"
              required
              data={nodeOptions.filter(
                (entry) =>
                  entry.value !==
                  selectedGuest?.node,
              )}
              value={migrationTarget}
              onChange={
                setMigrationTarget
              }
            />
          )}

          <DatesProvider
            settings={{
              locale: 'en',
              firstDayOfWeek: 1,
            }}
          >
            <DateTimePicker
              label="Start date / time"
              required
              value={startAt || null}
              onChange={(value) =>
                setStartAt(
                  value ?? '',
                )
              }
              valueFormat={
                timeFormat === '12h'
                  ? 'YYYY-MM-DD hh:mm A'
                  : 'YYYY-MM-DD HH:mm'
              }
              timePickerProps={{
                withDropdown: true,
                format:
                  timeFormat === '12h'
                    ? '12h'
                    : '24h',
              }}
            />
          </DatesProvider>

          <Switch
            label="Repeat task"
            description="Disabled by default. Enable this only when the task should run repeatedly."
            checked={repeatEnabled}
            onChange={(event) =>
              setRepeatEnabled(
                event.currentTarget
                  .checked,
              )
            }
          />

          <Group grow>
            <NumberInput
              label="Repeat every"
              min={1}
              disabled={!repeatEnabled}
              value={intervalValue}
              onChange={
                setIntervalValue
              }
            />

            <Select
              label="Interval"
              disabled={!repeatEnabled}
              data={INTERVAL_UNITS}
              value={intervalUnit}
              onChange={(value) =>
                setIntervalUnit(
                  (value ??
                    'days') as SchedulerIntervalUnit,
                )
              }
            />
          </Group>

          <Group
            justify="flex-end"
            mt="md"
          >
            <Button
              variant="default"
              onClick={() => {
                editorModal.close();
                resetForm();
              }}
            >
              Cancel
            </Button>

            <Button
              loading={
                createTask.isPending ||
                updateTask.isPending
              }
              onClick={() =>
                void saveTask()
              }
            >
              {editingTask
                ? 'Save changes'
                : 'Create task'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
