import { useQuery } from '@tanstack/react-query';

import {
  Alert,
  Badge,
  Code,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconClock,
  IconFileText,
  IconServer,
  IconUser,
} from '@tabler/icons-react';

import { api } from '../api';
import type { BackupTask } from '../hooks/useDashboard';

type BackupLogEntry = {
  n?: number;
  t?: string;
};

type BackupTaskStatus = {
  status?: string;
  exitstatus?: string;
  type?: string;
  id?: string;
  node?: string;
  user?: string;
  starttime?: number;
  endtime?: number;
  pid?: number;
  pstart?: number;
  upid?: string;
};

type BackupTaskDetails = {
  status: BackupTaskStatus;
  log: BackupLogEntry[];
};

type BackupTaskDrawerProps = {
  task: BackupTask | null;
  opened: boolean;
  onClose: () => void;
};

function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return '—';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp * 1000));
}

function formatDuration(
  starttime?: number,
  endtime?: number,
): string {
  if (!starttime) {
    return '—';
  }

  if (!endtime) {
    return 'Running';
  }

  const duration = Math.max(0, endtime - starttime);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} h`);
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes} min`);
  }

  parts.push(`${seconds} sec`);

  return parts.join(' ');
}

function statusColor(status?: string): string {
  if (!status) {
    return 'blue';
  }

  const normalized = status.toUpperCase();

  if (normalized === 'OK' || normalized === 'STOPPED') {
    return 'green';
  }

  if (
    normalized === 'RUNNING'
    || normalized === 'ACTIVE'
  ) {
    return 'blue';
  }

  return 'red';
}

function logLineColor(line?: string): string | undefined {
  const normalized = line?.toLowerCase() ?? '';

  if (
    normalized.includes('error')
    || normalized.includes('failed')
    || normalized.includes('failure')
  ) {
    return 'red';
  }

  if (
    normalized.includes('warning')
    || normalized.includes('warn')
  ) {
    return 'yellow';
  }

  return undefined;
}

export function BackupTaskDrawer({
  task,
  opened,
  onClose,
}: BackupTaskDrawerProps) {
  const details = useQuery({
    queryKey: [
      'backup-task-log',
      task?.node,
      task?.upid,
    ],
    queryFn: async (): Promise<BackupTaskDetails> => {
      if (!task) {
        throw new Error('No backup task selected.');
      }

      const response = await api.get<BackupTaskDetails>(
        '/backup/task-log',
        {
          params: {
            node: task.node,
            upid: task.upid,
          },
        },
      );

      return response.data;
    },
    enabled: opened && task !== null,
    refetchInterval: (query) => {
      const status =
        query.state.data?.status.status?.toLowerCase();

      return status === 'running' ? 3000 : false;
    },
  });

  const status = details.data?.status;
  const log = details.data?.log ?? [];

  const visibleStatus =
    status?.exitstatus
    || status?.status
    || task?.status
    || 'Running';

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title="Backup task details"
      padding="lg"
    >
      {!task ? null : (
        <Stack gap="lg">
          <Group justify="space-between">
            <div>
              <Title order={3}>
                {task.id
                  ? `Backup VMID ${task.id}`
                  : 'Backup job'}
              </Title>

              <Text size="sm" c="dimmed">
                {task.node}
              </Text>
            </div>

            <Badge
              color={statusColor(visibleStatus)}
              variant="light"
              size="lg"
            >
              {visibleStatus}
            </Badge>
          </Group>

          {details.isLoading && (
            <Group justify="center" py="xl">
              <Loader />

              <Text c="dimmed">
                Loading Proxmox task log...
              </Text>
            </Group>
          )}

          {details.isError && (
            <Alert
              color="red"
              icon={<IconAlertCircle size={20} />}
              title="Task log could not be loaded"
            >
              {details.error instanceof Error
                ? details.error.message
                : 'Unknown backend error'}
            </Alert>
          )}

          {details.data && (
            <>
              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 2,
                }}
              >
                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <IconServer size={20} />

                    <div>
                      <Text size="xs" c="dimmed">
                        Node
                      </Text>

                      <Text fw={600}>
                        {status?.node || task.node}
                      </Text>
                    </div>
                  </Group>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <IconUser size={20} />

                    <div>
                      <Text size="xs" c="dimmed">
                        User
                      </Text>

                      <Text fw={600}>
                        {status?.user || task.user || '—'}
                      </Text>
                    </div>
                  </Group>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <IconClock size={20} />

                    <div>
                      <Text size="xs" c="dimmed">
                        Started
                      </Text>

                      <Text fw={600}>
                        {formatDate(
                          status?.starttime
                          || task.starttime,
                        )}
                      </Text>
                    </div>
                  </Group>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <IconClock size={20} />

                    <div>
                      <Text size="xs" c="dimmed">
                        Duration
                      </Text>

                      <Text fw={600}>
                        {formatDuration(
                          status?.starttime
                          || task.starttime,
                          status?.endtime
                          || task.endtime,
                        )}
                      </Text>
                    </div>
                  </Group>
                </Paper>
              </SimpleGrid>

              <div>
                <Text size="xs" c="dimmed" mb={4}>
                  UPID
                </Text>

                <Code block>
                  {task.upid}
                </Code>
              </div>

              <Divider />

              <Group gap="sm">
                <IconFileText size={20} />

                <Title order={4}>Task log</Title>
              </Group>

              {log.length === 0 ? (
                <Alert
                  color="blue"
                  icon={<IconAlertCircle size={20} />}
                  title="No log entries"
                >
                  Proxmox returned no log lines for this task.
                </Alert>
              ) : (
                <Paper
                  withBorder
                  radius="md"
                  bg="dark.9"
                >
                  <ScrollArea h={500}>
                    <Stack
                      gap={0}
                      p="md"
                      style={{
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      }}
                    >
                      {log.map((entry, index) => (
                        <Text
                          key={`${entry.n ?? index}-${index}`}
                          size="xs"
                          c={logLineColor(entry.t) || 'gray.3'}
                          style={{
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          <Text
                            component="span"
                            inherit
                            c="dimmed"
                          >
                            {String(
                              entry.n ?? index + 1,
                            ).padStart(4, ' ')}
                            {'  '}
                          </Text>

                          {entry.t || ''}
                        </Text>
                      ))}
                    </Stack>
                  </ScrollArea>
                </Paper>
              )}
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
