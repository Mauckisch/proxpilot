import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';

import { TaskCard } from '../components/TaskCard';
import { useTasks } from '../hooks/useTasks';
import {
  getTaskType,
  type TaskType,
} from '../utils/taskType';

type TasksPageProps = {
  selectedTaskId?: string | null;
};

export function TasksPage({
  selectedTaskId,
}: TasksPageProps) {
  const tasksQuery = useTasks();

  const [search, setSearch] = useState('');

  const [stateFilter, setStateFilter] =
    useState<string | null>('all');

  const [typeFilter, setTypeFilter] =
    useState<string | null>('all');

  const tasks = tasksQuery.data?.tasks ?? [];

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    setSearch('');
    setStateFilter('all');
    setTypeFilter('all');

    const timeout = window.setTimeout(() => {
      const element = document.getElementById(
        `task-${selectedTaskId}`,
      );

      element?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [selectedTaskId]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks
      .filter((task) => {
        const taskType =
          getTaskType(task).type;

        const matchesSearch =
          !query ||
          `${task.title} ${task.node ?? ''} ${
            task.action ?? ''
          }`
            .toLowerCase()
            .includes(query);

        const matchesState =
          stateFilter === 'all' ||
          task.state === stateFilter;

        const matchesType =
          typeFilter === 'all' ||
          taskType === typeFilter;

        return (
          matchesSearch &&
          matchesState &&
          matchesType
        );
      })
      .sort((a, b) => {
        const firstDate = new Date(
          a.created_at ?? 0,
        ).getTime();

        const secondDate = new Date(
          b.created_at ?? 0,
        ).getTime();

        return secondDate - firstDate;
      });
  }, [
    search,
    stateFilter,
    typeFilter,
    tasks,
  ]);

  if (tasksQuery.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading task history...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (tasksQuery.isError) {
    const message =
      tasksQuery.error instanceof Error
        ? tasksQuery.error.message
        : 'The task history could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load tasks"
      >
        {message}
      </Alert>
    );
  }

  const runningTasks = tasks.filter(
    (task) =>
      task.state === 'running' ||
      task.state === 'queued',
  ).length;

  const failedTasks = tasks.filter(
    (task) => task.state === 'error',
  ).length;

  const typeOptions: Array<{
    value: TaskType | 'all';
    label: string;
  }> = [
    {
      value: 'all',
      label: 'All task types',
    },
    {
      value: 'backup',
      label: 'Backup',
    },
    {
      value: 'snapshot',
      label: 'Snapshot',
    },
    {
      value: 'migration',
      label: 'Migration',
    },
    {
      value: 'update',
      label: 'Update',
    },
    {
      value: 'cleanup',
      label: 'Cleanup',
    },
    {
      value: 'power',
      label: 'Power',
    },
    {
      value: 'maintenance',
      label: 'Maintenance',
    },
    {
      value: 'console',
      label: 'Console',
    },
    {
      value: 'other',
      label: 'Other',
    },
  ];

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Tasks</Title>

          <Text c="dimmed" mt={4}>
            Live output and history of dashboard actions
          </Text>
        </div>

        <Group gap="xs">
          <Badge
            color={
              runningTasks > 0
                ? 'orange'
                : 'gray'
            }
            variant="light"
            size="lg"
          >
            {runningTasks} active
          </Badge>

          {failedTasks > 0 && (
            <Badge
              color="red"
              variant="light"
              size="lg"
            >
              {failedTasks} failed
            </Badge>
          )}

          <Button
            variant="light"
            leftSection={
              <IconRefresh size={16} />
            }
            loading={tasksQuery.isFetching}
            onClick={() =>
              tasksQuery.refetch()
            }
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <Group align="flex-end">
        <TextInput
          label="Search"
          placeholder="Title, node or action"
          value={search}
          onChange={(event) =>
            setSearch(
              event.currentTarget.value,
            )
          }
          leftSection={
            <IconSearch size={16} />
          }
          style={{ flex: 1 }}
        />

        <Select
          label="Status"
          value={stateFilter}
          onChange={setStateFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All statuses',
            },
            {
              value: 'queued',
              label: 'Queued',
            },
            {
              value: 'running',
              label: 'Running',
            },
            {
              value: 'success',
              label: 'Completed',
            },
            {
              value: 'error',
              label: 'Failed',
            },
          ]}
          w={220}
        />

        <Select
          label="Task type"
          value={typeFilter}
          onChange={setTypeFilter}
          allowDeselect={false}
          data={typeOptions}
          w={220}
        />

        {(
          search ||
          stateFilter !== 'all' ||
          typeFilter !== 'all'
        ) && (
          <Button
            variant="subtle"
            onClick={() => {
              setSearch('');
              setStateFilter('all');
              setTypeFilter('all');
            }}
          >
            Reset
          </Button>
        )}
      </Group>

      <Text size="sm" c="dimmed">
        Showing {filteredTasks.length} of{' '}
        {tasks.length} tasks
      </Text>

      {filteredTasks.length === 0 ? (
        <Alert
          color="blue"
          icon={
            <IconAlertCircle size={20} />
          }
          title="No tasks found"
        >
          No tasks match the selected filters.
        </Alert>
      ) : (
        <Stack gap="md">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              id={`task-${task.id}`}
              style={{
                borderRadius:
                  'var(--mantine-radius-md)',
                outline:
                  selectedTaskId === task.id
                    ? '2px solid var(--mantine-color-blue-6)'
                    : undefined,
                outlineOffset:
                  selectedTaskId === task.id
                    ? '4px'
                    : undefined,
                transition:
                  'outline 150ms ease',
              }}
            >
              <TaskCard task={task} />
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
