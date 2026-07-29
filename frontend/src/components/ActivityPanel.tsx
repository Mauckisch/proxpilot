import {
  Badge,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconCheck,
  IconClock,
  IconLoader2,
  IconServer,
} from '@tabler/icons-react';

const activities = [
  {
    title: 'Cluster data refreshed',
    description: '3 nodes successfully queried',
    time: 'Just now',
    status: 'success',
  },
  {
    title: 'Updates checked',
    description: 'pve2 · 4 packages available',
    time: '3 minutes ago',
    status: 'success',
  },
  {
    title: 'VM 104 started',
    description: 'Docker · pve',
    time: '18 minutes ago',
    status: 'success',
  },
  {
    title: 'Update installation',
    description: 'pve3 · waiting for confirmation',
    time: 'Pending',
    status: 'pending',
  },
];

export function ActivityPanel() {
  return (
    <Stack h="100%">
      <Group justify="space-between">
        <div>
          <Title order={4}>Activity</Title>
          <Text size="xs" c="dimmed">
            Tasks and recent actions
          </Text>
        </div>

        <Badge variant="light">1 pending</Badge>
      </Group>

      <Divider />

      <ScrollArea flex={1}>
        <Stack gap="lg">
          {activities.map((activity) => {
            const pending = activity.status === 'pending';

            return (
              <Group key={activity.title} align="flex-start" wrap="nowrap">
                <ThemeIcon
                  variant="light"
                  color={pending ? 'orange' : 'green'}
                  radius="xl"
                >
                  {pending ? (
                    <IconLoader2 size={16} />
                  ) : (
                    <IconCheck size={16} />
                  )}
                </ThemeIcon>

                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={600}>
                    {activity.title}
                  </Text>

                  <Text size="xs" c="dimmed">
                    {activity.description}
                  </Text>

                  <Group gap={5} mt={6}>
                    <IconClock size={12} />
                    <Text size="xs" c="dimmed">
                      {activity.time}
                    </Text>
                  </Group>
                </div>
              </Group>
            );
          })}
        </Stack>
      </ScrollArea>

      <Divider />

      <Group gap="xs">
        <IconServer size={15} />
        <Text size="xs" c="dimmed">
          Backend connection will be added next.
        </Text>
      </Group>
    </Stack>
  );
}
