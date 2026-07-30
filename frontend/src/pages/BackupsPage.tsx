import { useMemo, useState } from 'react';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconArchive,
  IconCalendarClock,
  IconCheck,
  IconClock,
  IconDatabase,
  IconFileDescription,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconServer,
  IconX,
} from '@tabler/icons-react';

import {
  type BackupTask,
  useDashboard,
} from '../hooks/useDashboard';

import {
  BackupTaskDrawer,
} from '../components/BackupTaskDrawer';

function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return '—';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp * 1000));
}

function formatDuration(task: BackupTask): string {
  if (!task.endtime) {
    return 'Running';
  }

  const duration = Math.max(
    0,
    task.endtime - task.starttime,
  );

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  if (minutes === 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min ${seconds} sec`;
}

function statusColor(status?: string): string {
  if (!status) {
    return 'blue';
  }

  return status.toUpperCase() === 'OK'
    ? 'green'
    : 'red';
}

function retentionText(
  prune?: Record<string, string | undefined>,
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

export function BackupsPage() {
  const dashboard = useDashboard();

  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] =
    useState<string | null>('all');
  const [statusFilter, setStatusFilter] =
    useState<string | null>('all');

  const [selectedTask, setSelectedTask] =
    useState<BackupTask | null>(null);

  const [runningJobId, setRunningJobId] =
    useState<string | null>(null);

  const [backupMessage, setBackupMessage] =
    useState<string | null>(null);

  const [backupError, setBackupError] =
    useState<string | null>(null);

  const jobs = dashboard.data?.backup_jobs ?? [];
  const tasks = dashboard.data?.backup_tasks ?? [];
  const guests = dashboard.data?.guests ?? [];
  const nodes = dashboard.data?.nodes ?? [];

  const guestNames = useMemo(() => {
    const result = new Map<number, string>();

    for (const guest of guests) {
      result.set(
        guest.vmid,
        guest.name || `Guest ${guest.vmid}`,
      );
    }

    return result;
  }, [guests]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const vmid = Number(task.id);
      const guestName = Number.isFinite(vmid)
        ? guestNames.get(vmid)
        : undefined;

      const searchable = [
        task.node,
        task.id,
        guestName,
        task.status,
        task.user,
        task.upid,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !query || searchable.includes(query);

      const matchesNode =
        nodeFilter === 'all'
        || task.node === nodeFilter;

      const matchesStatus =
        statusFilter === 'all'
        || (
          statusFilter === 'ok'
          && task.status?.toUpperCase() === 'OK'
        )
        || (
          statusFilter === 'error'
          && task.status?.toUpperCase() !== 'OK'
        );

      return (
        matchesSearch
        && matchesNode
        && matchesStatus
      );
    });
  }, [
    guestNames,
    nodeFilter,
    search,
    statusFilter,
    tasks,
  ]);

  const successfulTasks = tasks.filter(
    (task) => task.status?.toUpperCase() === 'OK',
  ).length;

  const failedTasks = tasks.filter(
    (task) =>
      task.status
      && task.status.toUpperCase() !== 'OK',
  ).length;

  const latestTask = tasks[0];

  async function startBackup(
    jobId: string,
    storage?: string,
  ): Promise<void> {
    const confirmed = window.confirm(
      `Start backup job "${jobId}" now?\n\n`
      + `Storage: ${storage || 'Proxmox default'}\n\n`
      + 'The configured backup job will be started immediately.',
    );

    if (!confirmed) {
      return;
    }

    setRunningJobId(jobId);
    setBackupMessage(null);
    setBackupError(null);

    try {
      const response = await fetch('/api/backup/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          confirmed: true,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          result &&
          typeof result === 'object' &&
          'detail' in result
            ? String(result.detail)
            : `Backup start failed with HTTP ${response.status}.`;

        throw new Error(detail);
      }

      const startedNodes =
        result &&
        typeof result === 'object' &&
        'nodes' in result &&
        Array.isArray(result.nodes)
          ? result.nodes.join(', ')
          : '';

      setBackupMessage(
        startedNodes
          ? `Backup job "${jobId}" started on: ${startedNodes}.`
          : `Backup job "${jobId}" started successfully.`,
      );

      await dashboard.refetch();
    } catch (error) {
      setBackupError(
        error instanceof Error
          ? error.message
          : 'The backup job could not be started.',
      );
    } finally {
      setRunningJobId(null);
    }
  }

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading backup information...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'Backup information could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load backups"
      >
        {message}
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Backups</Title>

          <Text c="dimmed" mt={4}>
            Proxmox backup jobs and recent backup tasks
          </Text>
        </div>

        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={dashboard.isFetching}
          onClick={() => dashboard.refetch()}
        >
          Refresh
        </Button>
      </Group>

      {backupMessage && (
        <Alert
          color="green"
          icon={<IconCheck size={20} />}
          title="Backup started"
          withCloseButton
          onClose={() => setBackupMessage(null)}
        >
          {backupMessage}
        </Alert>
      )}

      {backupError && (
        <Alert
          color="red"
          icon={<IconAlertCircle size={20} />}
          title="Unable to start backup"
          withCloseButton
          onClose={() => setBackupError(null)}
        >
          {backupError}
        </Alert>
      )}

      <SimpleGrid
        cols={{
          base: 1,
          sm: 2,
          xl: 4,
        }}
      >
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">
                Backup jobs
              </Text>

              <Text size="xl" fw={700}>
                {jobs.length}
              </Text>
            </div>

            <IconCalendarClock size={28} />
          </Group>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">
                Successful tasks
              </Text>

              <Text size="xl" fw={700}>
                {successfulTasks}
              </Text>
            </div>

            <IconCheck size={28} />
          </Group>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">
                Failed tasks
              </Text>

              <Text size="xl" fw={700}>
                {failedTasks}
              </Text>
            </div>

            <IconX size={28} />
          </Group>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">
                Latest run
              </Text>

              <Text size="sm" fw={700}>
                {latestTask
                  ? formatDate(latestTask.starttime)
                  : '—'}
              </Text>
            </div>

            <IconClock size={28} />
          </Group>
        </Paper>
      </SimpleGrid>

      <Stack gap="md">
        <Group>
          <IconArchive size={22} />

          <Title order={3}>Configured jobs</Title>
        </Group>

        {jobs.length === 0 ? (
          <Alert
            color="blue"
            icon={<IconAlertCircle size={20} />}
            title="No backup jobs found"
          >
            No Proxmox backup jobs are currently
            available.
          </Alert>
        ) : (
          <SimpleGrid
            cols={{
              base: 1,
              lg: 2,
            }}
          >
            {jobs.map((job) => (
              <Card
                key={job.id}
                withBorder
                radius="md"
                padding="lg"
              >
                <Stack gap="md">
                  <Group justify="space-between">
                    <Group gap="sm">
                      <IconDatabase size={22} />

                      <div>
                        <Text fw={700}>
                          {job.id}
                        </Text>

                        <Text size="sm" c="dimmed">
                          {job.storage || 'Unknown storage'}
                        </Text>
                      </div>
                    </Group>

                    <Badge
                      color={job.enabled ? 'green' : 'gray'}
                      variant="light"
                    >
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <div>
                      <Text size="xs" c="dimmed">
                        Schedule
                      </Text>

                      <Text fw={600}>
                        {job.schedule || '—'}
                      </Text>
                    </div>

                    <div>
                      <Text size="xs" c="dimmed">
                        Next run
                      </Text>

                      <Text fw={600}>
                        {formatDate(job['next-run'])}
                      </Text>
                    </div>

                    <div>
                      <Text size="xs" c="dimmed">
                        Mode
                      </Text>

                      <Text fw={600}>
                        {job.mode || '—'}
                      </Text>
                    </div>

                    <div>
                      <Text size="xs" c="dimmed">
                        Compression
                      </Text>

                      <Text fw={600}>
                        {job.compress || '—'}
                      </Text>
                    </div>
                  </SimpleGrid>

                  <div>
                    <Text size="xs" c="dimmed">
                      Guests
                    </Text>

                    <Text fw={600}>
                      {job.all
                        ? 'All guests'
                        : 'Selected guests'}
                    </Text>
                  </div>

                  <div>
                    <Text size="xs" c="dimmed">
                      Retention
                    </Text>

                    <Text fw={600}>
                      {retentionText(
                        job['prune-backups'],
                      )}
                    </Text>
                  </div>

                  <Button
                    variant="light"
                    color="blue"
                    leftSection={
                      <IconPlayerPlay size={16} />
                    }
                    loading={runningJobId === job.id}
                    disabled={
                      !job.enabled ||
                      (
                        runningJobId !== null &&
                        runningJobId !== job.id
                      )
                    }
                    onClick={() =>
                      void startBackup(
                        job.id,
                        job.storage,
                      )
                    }
                  >
                    {job.enabled
                      ? 'Run backup now'
                      : 'Backup job disabled'}
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <Stack gap="md">
        <Group>
          <IconServer size={22} />

          <Title order={3}>Recent backup tasks</Title>
        </Group>

        <Group align="flex-end">
          <TextInput
            label="Search"
            placeholder="Guest, VMID, node or user"
            value={search}
            onChange={(event) =>
              setSearch(event.currentTarget.value)
            }
            leftSection={<IconSearch size={16} />}
            style={{ flex: 1 }}
          />

          <Select
            label="Node"
            value={nodeFilter}
            onChange={setNodeFilter}
            allowDeselect={false}
            data={[
              {
                value: 'all',
                label: 'All nodes',
              },
              ...nodes.map((node) => ({
                value: node.node,
                label: node.node,
              })),
            ]}
            w={180}
          />

          <Select
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            allowDeselect={false}
            data={[
              {
                value: 'all',
                label: 'All statuses',
              },
              {
                value: 'ok',
                label: 'Successful',
              },
              {
                value: 'error',
                label: 'Failed',
              },
            ]}
            w={180}
          />
        </Group>

        <Text size="sm" c="dimmed">
          Showing {filteredTasks.length} of {tasks.length}{' '}
          backup tasks
        </Text>

        {filteredTasks.length === 0 ? (
          <Alert
            color="blue"
            icon={<IconAlertCircle size={20} />}
            title="No backup tasks found"
          >
            No backup tasks match the selected filters.
          </Alert>
        ) : (
          <Paper withBorder radius="md">
            <Table.ScrollContainer minWidth={900}>
              <Table
                striped
                highlightOnHover
                verticalSpacing="md"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Guest</Table.Th>
                    <Table.Th>Node</Table.Th>
                    <Table.Th>Started</Table.Th>
                    <Table.Th>Duration</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th ta="right">Details</Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {filteredTasks.map((task) => {
                    const vmid = Number(task.id);

                    const guestName =
                      Number.isFinite(vmid)
                        ? guestNames.get(vmid)
                        : undefined;

                    return (
                      <Table.Tr key={task.upid}>
                        <Table.Td>
                          <Badge
                            color={statusColor(task.status)}
                            variant="light"
                          >
                            {task.status || 'Running'}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          <Text fw={600}>
                            {task.id
                              ? guestName || `VMID ${task.id}`
                              : 'Node backup job'}
                          </Text>

                          {task.id && guestName && (
                            <Text size="xs" c="dimmed">
                              VMID {task.id}
                            </Text>
                          )}
                        </Table.Td>

                        <Table.Td>
                          {task.node}
                        </Table.Td>

                        <Table.Td>
                          {formatDate(task.starttime)}
                        </Table.Td>

                        <Table.Td>
                          {formatDuration(task)}
                        </Table.Td>

                        <Table.Td>
                          {task.user || '—'}
                        </Table.Td>

                        <Table.Td ta="right">
                          <Tooltip label="Open task log">
                            <ActionIcon
                              variant="subtle"
                              onClick={() =>
                                setSelectedTask(task)
                              }
                              aria-label="Open backup task log"
                            >
                              <IconFileDescription size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>
      <BackupTaskDrawer
        task={selectedTask}
        opened={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
      />
    </Stack>
  );
}
