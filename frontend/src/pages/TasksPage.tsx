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

import {
  InfrastructureSelectOption,
} from '../components/InfrastructureSelectOption';
import { TaskCard } from '../components/TaskCard';
import { useDashboard } from '../hooks/useDashboard';
import { useTasks } from '../hooks/useTasks';
import {
  getInfrastructureHealth,
  getInfrastructureHealthLabel,
} from '../utils/infrastructureHealth';
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
  const dashboard = useDashboard();

  const [
    selectedInfrastructureId,
    setSelectedInfrastructureId,
  ] = useState<number | null>(() => {
    const stored = localStorage.getItem(
      'proxpilot-tasks-infrastructure',
    );

    if (!stored) {
      return null;
    }

    const parsed = Number(stored);

    return Number.isInteger(parsed) &&
      parsed > 0
      ? parsed
      : null;
  });

  const [search, setSearch] = useState('');

  const [stateFilter, setStateFilter] =
    useState<string | null>('all');

  const [typeFilter, setTypeFilter] =
    useState<string | null>('all');

  const allTasks =
    tasksQuery.data?.tasks ?? [];

  const dashboardNodes =
    dashboard.data?.nodes ?? [];

  const infrastructures = Array.from(
    dashboardNodes.reduce(
      (
        result,
        node,
      ) => {
        if (
          !result.has(
            node.infrastructure_id,
          )
        ) {
          result.set(
            node.infrastructure_id,
            {
              id:
                node.infrastructure_id,
              name:
                node.infrastructure_name,
              type:
                node.infrastructure_type,
            },
          );
        }

        return result;
      },
      new Map<
        number,
        {
          id: number;
          name: string;
          type:
            | 'cluster'
            | 'standalone';
        }
      >(),
    ).values(),
  ).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const effectiveInfrastructureId =
    infrastructures.some(
      (infrastructure) =>
        infrastructure.id ===
        selectedInfrastructureId,
    )
      ? selectedInfrastructureId
      : infrastructures[0]?.id ??
        null;

  const infrastructureNames =
    new Map(
      infrastructures.map(
        (infrastructure) => [
          infrastructure.id,
          infrastructure.name,
        ],
      ),
    );

  const infrastructureOptions =
    infrastructures.map(
      (infrastructure) => {
        const health =
          getInfrastructureHealth(
            dashboardNodes.filter(
              (node) =>
                node.infrastructure_id ===
                infrastructure.id,
            ),
          );

        return {
          value: String(
            infrastructure.id,
          ),
          label: `${
            infrastructure.name
          } · ${
            infrastructure.type ===
            'cluster'
              ? 'Cluster'
              : 'Standalone'
          } · ${
            getInfrastructureHealthLabel(
              health,
            )
          }`,
          health,
        };
      },
    );

  const tasks =
    effectiveInfrastructureId === null
      ? []
      : allTasks.filter(
          (task) =>
            task.infrastructure_id ===
            effectiveInfrastructureId,
        );

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    setSearch('');
    setStateFilter('all');
    setTypeFilter('all');

    const selectedTask =
      allTasks.find(
        (task) =>
          task.id === selectedTaskId,
      );

    if (
      selectedTask?.infrastructure_id != null
    ) {
      setSelectedInfrastructureId(
        selectedTask.infrastructure_id,
      );

      localStorage.setItem(
        'proxpilot-tasks-infrastructure',
        String(
          selectedTask.infrastructure_id,
        ),
      );
    }

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
  }, [
    allTasks,
    selectedTaskId,
  ]);

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
          } ${
            task.infrastructure_id != null
              ? infrastructureNames.get(
                  task.infrastructure_id,
                ) ?? ''
              : ''
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
    infrastructureNames,
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

        <Group gap="xs" align="flex-end">
          <Select
            label="Infrastructure"
            data={infrastructureOptions}
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
              effectiveInfrastructureId !==
              null
                ? String(
                    effectiveInfrastructureId,
                  )
                : null
            }
            onChange={(value) => {
              if (!value) {
                return;
              }

              const id = Number(value);

              if (
                !Number.isInteger(id) ||
                id <= 0
              ) {
                return;
              }

              setSelectedInfrastructureId(
                id,
              );

              localStorage.setItem(
                'proxpilot-tasks-infrastructure',
                String(id),
              );
            }}
            allowDeselect={false}
            w={300}
          />

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
        {tasks.length} tasks in{' '}
        {effectiveInfrastructureId !== null
          ? infrastructureNames.get(
              effectiveInfrastructureId,
            ) ?? 'selected infrastructure'
          : 'selected infrastructure'}
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
              <TaskCard
                task={task}
                infrastructureName={
                  task.infrastructure_id != null
                    ? infrastructureNames.get(
                        task.infrastructure_id,
                      )
                    : undefined
                }
              />
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
