import {
  Alert,
  Badge,
  Center,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconLoader2,
  IconServer,
  IconX,
} from '@tabler/icons-react';

import {
  type ManagedTask,
  useTasks,
} from '../hooks/useTasks';
import { getTaskType } from '../utils/taskType';

function formatTaskTime(task: ManagedTask): string {
  const value =
    task.finished_at ??
    task.started_at ??
    task.created_at;

  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const difference =
    Date.now() - date.getTime();

  if (difference < 60_000) {
    return 'Just now';
  }

  const minutes = Math.floor(
    difference / 60_000,
  );

  if (minutes < 60) {
    return `${minutes} minute${
      minutes === 1 ? '' : 's'
    } ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${
      hours === 1 ? '' : 's'
    } ago`;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getTaskDescription(
  task: ManagedTask,
): string {
  const parts: string[] = [];

  if (task.node) {
    parts.push(task.node);
  }

  if (task.action) {
    parts.push(task.action);
  }

  if (task.state === 'queued') {
    parts.push('Waiting to start');
  }

  if (task.state === 'running') {
    parts.push('In progress');
  }

  if (task.state === 'success') {
    parts.push('Completed successfully');
  }

  if (task.state === 'error') {
    parts.push(
      task.error ?? 'Task failed',
    );
  }

  return parts.join(' · ');
}

function getTaskAppearance(
  task: ManagedTask,
) {
  switch (task.state) {
    case 'queued':
      return {
        color: 'gray',
        icon: <IconClock size={16} />,
      };

    case 'running':
      return {
        color: 'orange',
        icon: (
          <IconLoader2
            size={16}
            className="activity-task-spinner"
          />
        ),
      };

    case 'success':
      return {
        color: 'green',
        icon: <IconCheck size={16} />,
      };

    case 'error':
      return {
        color: 'red',
        icon: <IconX size={16} />,
      };
  }
}

type ActivityPanelProps = {
  onOpenTask?: (
    taskId: string,
  ) => void;
};

export function ActivityPanel({
  onOpenTask,
}: ActivityPanelProps) {
  const tasksQuery = useTasks();

  const tasks = [
    ...(tasksQuery.data?.tasks ?? []),
  ]
    .sort((first, second) => {
      const firstTime = new Date(
        first.created_at ?? 0,
      ).getTime();

      const secondTime = new Date(
        second.created_at ?? 0,
      ).getTime();

      return secondTime - firstTime;
    })
    .slice(0, 10);

  const activeTasks = tasks.filter(
    (task) =>
      task.state === 'queued' ||
      task.state === 'running',
  ).length;

  return (
    <Stack h="100%">
      <Group justify="space-between">
        <div>
          <Title order={4}>
            Activity
          </Title>

          <Text
            size="xs"
            c="dimmed"
          >
            Tasks and recent actions
          </Text>
        </div>

        <Badge
          variant="light"
          color={
            activeTasks > 0
              ? 'orange'
              : 'gray'
          }
        >
          {activeTasks} active
        </Badge>
      </Group>

      <Divider />

      <ScrollArea flex={1}>
        {tasksQuery.isLoading ? (
          <Center mih={180}>
            <Stack
              align="center"
              gap="xs"
            >
              <Loader size="sm" />

              <Text
                size="xs"
                c="dimmed"
              >
                Loading activity...
              </Text>
            </Stack>
          </Center>
        ) : tasksQuery.isError ? (
          <Alert
            color="red"
            icon={
              <IconAlertCircle
                size={16}
              />
            }
            title="Unable to load activity"
          >
            <Text size="xs">
              {tasksQuery.error instanceof
              Error
                ? tasksQuery.error.message
                : 'The task list could not be loaded.'}
            </Text>
          </Alert>
        ) : tasks.length === 0 ? (
          <Center mih={180}>
            <Stack
              align="center"
              gap="xs"
            >
              <ThemeIcon
                variant="light"
                color="gray"
                radius="xl"
              >
                <IconClock size={16} />
              </ThemeIcon>

              <Text
                size="sm"
                fw={600}
              >
                No activity yet
              </Text>

              <Text
                size="xs"
                c="dimmed"
                ta="center"
              >
                Actions started from the
                dashboard or Task Scheduler
                will appear here.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Stack gap="lg">
            {tasks.map((task) => {
              const appearance =
                getTaskAppearance(task);

              const taskType =
                getTaskType(task);

              const TaskTypeIcon =
                taskType.icon;

              const scheduled =
                task.source ===
                'scheduler';

              return (
                <Group
                  key={task.id}
                  align="flex-start"
                  wrap="nowrap"
                  onClick={() =>
                    onOpenTask?.(
                      task.id,
                    )
                  }
                  role={
                    onOpenTask
                      ? 'button'
                      : undefined
                  }
                  tabIndex={
                    onOpenTask
                      ? 0
                      : undefined
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      onOpenTask &&
                      (
                        event.key ===
                          'Enter' ||
                        event.key ===
                          ' '
                      )
                    ) {
                      event.preventDefault();

                      onOpenTask(
                        task.id,
                      );
                    }
                  }}
                  style={{
                    cursor:
                      onOpenTask
                        ? 'pointer'
                        : 'default',
                    borderRadius:
                      'var(--mantine-radius-md)',
                    padding: '8px',
                    margin: '-8px',
                  }}
                >
                  <ThemeIcon
                    variant="light"
                    color={
                      taskType.color
                    }
                    radius="xl"
                  >
                    <TaskTypeIcon
                      size={16}
                    />
                  </ThemeIcon>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Group
                      gap="xs"
                      justify="space-between"
                      wrap="nowrap"
                    >
                      <Text
                        size="sm"
                        fw={600}
                        lineClamp={1}
                      >
                        {task.title}
                      </Text>

                      <Badge
                        variant="light"
                        color={
                          taskType.color
                        }
                        size="xs"
                      >
                        {taskType.label}
                      </Badge>
                    </Group>

                    {scheduled && (
                      <Badge
                        mt={5}
                        size="xs"
                        variant="light"
                        color="violet"
                        leftSection={
                          <IconCalendarTime
                            size={11}
                          />
                        }
                      >
                        Scheduled
                      </Badge>
                    )}

                    <Text
                      mt={scheduled ? 4 : 0}
                      size="xs"
                      c={
                        task.state ===
                        'error'
                          ? 'red'
                          : 'dimmed'
                      }
                      lineClamp={2}
                    >
                      {getTaskDescription(
                        task,
                      )}
                    </Text>

                    <Group
                      gap="xs"
                      mt={6}
                      justify="space-between"
                    >
                      <Group gap={5}>
                        <IconClock
                          size={12}
                        />

                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          {formatTaskTime(
                            task,
                          )}
                        </Text>
                      </Group>

                      <ThemeIcon
                        variant="subtle"
                        color={
                          appearance.color
                        }
                        size="sm"
                        radius="xl"
                      >
                        {
                          appearance.icon
                        }
                      </ThemeIcon>
                    </Group>
                  </div>
                </Group>
              );
            })}
          </Stack>
        )}
      </ScrollArea>

      <Divider />

      <Group gap="xs">
        <IconServer size={15} />

        <Text
          size="xs"
          c="dimmed"
        >
          {tasksQuery.isFetching
            ? 'Updating activity...'
            : 'Connected to backend task service'}
        </Text>
      </Group>

      <style>
        {`
          .activity-task-spinner {
            animation: activity-task-spin 1s linear infinite;
          }

          @keyframes activity-task-spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </Stack>
  );
}
