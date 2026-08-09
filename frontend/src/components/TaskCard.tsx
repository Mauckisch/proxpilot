import {
  Accordion,
  Alert,
  Badge,
  Card,
  Code,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconLoader2,
  IconServer,
} from '@tabler/icons-react';

import type {
  ManagedTask,
  TaskState,
} from '../hooks/useTasks';
import { getTaskType } from '../utils/taskType';

type TaskCardProps = {
  task: ManagedTask;
  infrastructureName?: string;
};

function getStateConfiguration(state: TaskState) {
  switch (state) {
    case 'queued':
      return {
        label: 'Queued',
        color: 'gray',
        icon: <IconClock size={16} />,
      };

    case 'running':
      return {
        label: 'Running',
        color: 'orange',
        icon: <IconLoader2 size={16} />,
      };

    case 'success':
      return {
        label: 'Completed',
        color: 'green',
        icon: <IconCheck size={16} />,
      };

    case 'error':
      return {
        label: 'Failed',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      };
  }
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function TaskCard({
  task,
  infrastructureName,
}: TaskCardProps) {
  const state = getStateConfiguration(task.state);
  const taskType = getTaskType(task);
  const TaskTypeIcon = taskType.icon;
  const output = task.output ?? [];

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
    >
      <Stack gap="md">
        <Group
          justify="space-between"
          align="flex-start"
        >
          <div>
            <Group gap="xs">
              {task.state === 'running' ? (
                <Loader size={18} />
              ) : (
                state.icon
              )}

              <Text fw={700} size="lg">
                {task.title}
              </Text>
            </Group>

            <Group gap="xs" mt={6}>
              {task.infrastructure_id != null && (
                <Badge
                  variant="light"
                  color="grape"
                >
                  {infrastructureName ??
                    `Infrastructure ${task.infrastructure_id}`}
                </Badge>
              )}

              <Badge
                variant="light"
                color={taskType.color}
                leftSection={
                  <TaskTypeIcon size={12} />
                }
              >
                {taskType.label}
              </Badge>

              {task.node && (
                <Badge
                  variant="light"
                  color="blue"
                  leftSection={
                    <IconServer size={12} />
                  }
                >
                  {task.node}
                </Badge>
              )}

              {task.action && (
                <Badge
                  variant="outline"
                  color="gray"
                >
                  {task.action}
                </Badge>
              )}
            </Group>
          </div>

          <Badge
            color={state.color}
            variant="light"
            leftSection={state.icon}
          >
            {state.label}
          </Badge>
        </Group>

        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed">
              Created
            </Text>

            <Text size="sm">
              {formatDate(task.created_at)}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Started
            </Text>

            <Text size="sm">
              {formatDate(task.started_at)}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Finished
            </Text>

            <Text size="sm">
              {formatDate(task.finished_at)}
            </Text>
          </div>
        </Group>

        {task.result?.updates !== undefined && (
          <Alert color="blue">
            <Text fw={600}>
              {task.result.updates} updates available
            </Text>
          </Alert>
        )}

        {task.result?.reboot_required !== undefined && (
          <Alert
            color={
              task.result.reboot_required
                ? 'orange'
                : 'green'
            }
          >
            Reboot required:{' '}
            <strong>
              {task.result.reboot_required
                ? 'Yes'
                : 'No'}
            </strong>
          </Alert>
        )}

        {task.error && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={18} />}
            title="Task failed"
          >
            {task.error}
          </Alert>
        )}

        <Accordion variant="contained">
          <Accordion.Item value="output">
            <Accordion.Control>
              Task output ({output.length} lines)
            </Accordion.Control>

            <Accordion.Panel>
              {output.length > 0 ? (
                <Code
                  block
                  style={{
                    maxHeight: 420,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {output.slice(-200).join('\n')}
                </Code>
              ) : (
                <Text size="sm" c="dimmed">
                  No output available yet.
                </Text>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Card>
  );
}
