import {
  Badge,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowRight,
  IconClock,
  IconCopy,
  IconServer,
} from '@tabler/icons-react';

import type {
  Guest,
  ReplicationJob,
} from '../hooks/useDashboard';

type ReplicationCardProps = {
  replication: ReplicationJob;
  guest?: Guest;
};

export function ReplicationCard({
  replication,
  guest,
}: ReplicationCardProps) {
  const guestName =
    guest?.name?.trim()
    || `Guest ${replication.guest}`;

  const guestType =
    guest?.type === 'lxc'
      ? 'LXC'
      : guest?.type === 'qemu'
        ? 'VM'
        : 'Guest';

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
          <Group gap="sm">
            <ThemeIcon
              variant="light"
              size="lg"
              radius="md"
            >
              <IconCopy size={19} />
            </ThemeIcon>

            <div>
              <Text fw={700} size="lg">
                {guestName}
              </Text>

              <Text size="sm" c="dimmed">
                {guestType} {replication.guest}
              </Text>
            </div>
          </Group>

          <Badge
            color="green"
            variant="light"
          >
            Configured
          </Badge>
        </Group>

        <Group
          gap="sm"
          wrap="nowrap"
          align="center"
        >
          <Badge
            size="lg"
            variant="light"
            color="blue"
            leftSection={
              <IconServer size={13} />
            }
          >
            {replication.source ?? 'Unknown'}
          </Badge>

          <IconArrowRight size={20} />

          <Badge
            size="lg"
            variant="light"
            color="violet"
            leftSection={
              <IconServer size={13} />
            }
          >
            {replication.target ?? 'Unknown'}
          </Badge>
        </Group>

        <Group justify="space-between">
          <Group gap="xs">
            <IconClock size={16} />

            <div>
              <Text size="xs" c="dimmed">
                Schedule
              </Text>

              <Text fw={600}>
                {replication.schedule ?? '—'}
              </Text>
            </div>
          </Group>

          <div>
            <Text
              size="xs"
              c="dimmed"
              ta="right"
            >
              Job
            </Text>

            <Text fw={600} ta="right">
              #{replication.jobnum ?? 0}
            </Text>
          </div>
        </Group>

        <Text size="xs" c="dimmed">
          ID: {replication.id}
        </Text>
      </Stack>
    </Card>
  );
}
