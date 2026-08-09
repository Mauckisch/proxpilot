import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
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
import { ACTIONS } from '../constants/schedulerActions';
import { useAuth } from '../auth';
import { useDashboard } from '../hooks/useDashboard';
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
    action.startsWith('snapshot.')
  );
}

function actionIsNode(action: string) {
  return action.startsWith('node.');
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
  const [node, setNode] =
    useState<string | null>(null);
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
      const seen =
        new Map<
          number,
          {
            value: string;
            label: string;
          }
        >();

      for (
        const entry
        of dashboard.data?.nodes ?? []
      ) {
        if (
          seen.has(
            entry.infrastructure_id,
          )
        ) {
          continue;
        }

        seen.set(
          entry.infrastructure_id,
          {
            value: String(
              entry.infrastructure_id,
            ),
            label:
              entry.infrastructure_type ===
              'cluster'
                ? `${entry.infrastructure_name} · Cluster`
                : `${entry.infrastructure_name} · Standalone`,
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

  useEffect(() => {
    setSnapshots([]);
    setSnapshotName(null);

    if (
      action !== 'snapshot.delete' ||
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

  function resetForm() {
    setEditingTask(null);
    setInfrastructureId(null);
    setName('');
    setDescription('');
    setAction('');
    setNode(null);
    setGuestKey(null);
    setStartAt(toLocalInputValue());
    setRepeatEnabled(false);
    setIntervalValue(1);
    setIntervalUnit('days');
    setSnapshotName(null);
    setSnapshotCreateName('');
    setBackupJobId(null);
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
    setNode(task.node ?? null);

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
      if (!node) {
        setFormError(
          'Select a node.',
        );
        return;
      }

      targetType = 'node';
      targetNode = node;
    }

    const payload:
      Record<string, unknown> = {};

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

    if (action === 'snapshot.delete') {
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

      <Paper
        withBorder
        radius="md"
        p="lg"
      >
        {tasks.isLoading ? (
          <Text c="dimmed">
            Loading scheduled tasks...
          </Text>
        ) : tasks.isError ? (
          <Alert
            color="red"
            icon={
              <IconAlertCircle size={18} />
            }
            title="Unable to load Task Scheduler"
          >
            Scheduled tasks could not be loaded.
          </Alert>
        ) : (tasks.data ?? []).length === 0 ? (
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
        ) : (
          <Table
            striped
            highlightOnHover
            withTableBorder
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Infrastructure</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th>Next run</Table.Th>
                <Table.Th>Last result</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created by</Table.Th>
                {canOperate && (
                  <Table.Th>Actions</Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {(tasks.data ?? []).map(
                (task) => (
                  <Table.Tr key={task.id}>
                    <Table.Td>
                      <Text fw={600}>
                        {task.name}
                      </Text>

                      {task.description && (
                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          {task.description}
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      {
                        dashboard.data?.nodes
                          .find(
                            (entry) =>
                              entry.infrastructure_id ===
                              task.infrastructure_id,
                          )
                          ?.infrastructure_name ??
                        `Infrastructure ${task.infrastructure_id}`
                      }
                    </Table.Td>

                    <Table.Td>
                      {
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
                        task.action
                      }
                    </Table.Td>

                    <Table.Td>
                      {task.target_type ===
                      'guest'
                        ? `${task.guest_type?.toUpperCase()} ${task.vmid} · ${task.node}`
                        : task.node ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      {task.repeat_enabled
                        ? `Every ${task.interval_value} ${task.interval_unit}`
                        : 'Once'}
                    </Table.Td>

                    <Table.Td>
                      {formatDate(
                        task.next_run,
                        timeFormat,
                      )}
                    </Table.Td>

                    <Table.Td>
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
                        '—'
                      )}
                    </Table.Td>

                    <Table.Td>
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
                    </Table.Td>

                    <Table.Td>
                      {task.created_by_username}
                    </Table.Td>

                    {canOperate && (
                      <Table.Td>
                        <Group
                          gap="xs"
                          wrap="nowrap"
                        >
                          <Switch
                            checked={task.enabled}
                            onChange={(event) =>
                              void setEnabled.mutateAsync(
                                {
                                  id: task.id,
                                  enabled:
                                    event.currentTarget
                                      .checked,
                                },
                              )
                            }
                          />

                          <Button
                            size="xs"
                            variant="light"
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
                                void runTask.mutateAsync(
                                  task.id,
                                );
                              }
                            }}
                          >
                            Run now
                          </Button>

                          <Button
                            size="xs"
                            variant="subtle"
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
                            variant="subtle"
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
                                void deleteTask.mutateAsync(
                                  task.id,
                                );
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ),
              )}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

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

              setNode(null);
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
              setNode(null);
              setGuestKey(null);
              setSnapshotName(null);
              setSnapshotCreateName('');
              setBackupJobId(null);
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
            actionIsNode(action) && (
              <Select
                label="Node"
                required
                data={nodeOptions}
                value={node}
                onChange={setNode}
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

          {action ===
            'snapshot.delete' &&
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
