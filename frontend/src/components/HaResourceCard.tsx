import {
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconServer,
  IconShieldCheck,
} from '@tabler/icons-react';

import type {
  Guest,
  HaStatusEntry,
} from '../hooks/useDashboard';

type HaResourceCardProps = {
  resource: HaStatusEntry;
  guest?: Guest;
};

function getStateColor(state?: string): string {
  switch (state?.toLowerCase()) {
    case 'started':
    case 'running':
      return 'green';

    case 'stopped':
      return 'gray';

    case 'error':
    case 'freeze':
      return 'red';

    case 'request_stop':
    case 'request_start':
    case 'migrate':
      return 'orange';

    default:
      return 'blue';
  }
}

function enabledLabel(value?: number): string {
  return value === 1 ? 'Enabled' : 'Disabled';
}

export function HaResourceCard({
  resource,
  guest,
}: HaResourceCardProps) {
  const vmid =
    resource.sid?.match(/(?:vm|ct):(\d+)/)?.[1] ??
    guest?.vmid;

  const displayName =
    guest?.name ??
    (vmid ? `Guest ${vmid}` : resource.sid ?? 'HA resource');

  const guestType =
    guest?.type === 'lxc' ? 'LXC' : 'VM';

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
              <IconShieldCheck size={22} />

              <Text fw={700} size="lg">
                {displayName}
              </Text>
            </Group>

            <Text size="sm" c="dimmed" mt={4}>
              {guestType} {vmid ?? '—'}
            </Text>
          </div>

          <Badge
            color={getStateColor(
              resource.crm_state ?? resource.state,
            )}
            variant="light"
          >
            {resource.crm_state ??
              resource.state ??
              'Unknown'}
          </Badge>
        </Group>

        <Group gap="xs">
          <Badge
            variant="light"
            color="blue"
            leftSection={<IconServer size={12} />}
          >
            {resource.node ?? 'Unknown node'}
          </Badge>

          <Badge variant="outline">
            Requested: {resource.request_state ?? '—'}
          </Badge>
        </Group>

        <SimpleGrid cols={2} spacing="sm">
          <div>
            <Text size="xs" c="dimmed">
              Maximum restarts
            </Text>

            <Text fw={600}>
              {resource.max_restart ?? '—'}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Maximum relocations
            </Text>

            <Text fw={600}>
              {resource.max_relocate ?? '—'}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Failback
            </Text>

            <Text fw={600}>
              {enabledLabel(resource.failback)}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Auto rebalance
            </Text>

            <Text fw={600}>
              {enabledLabel(resource['auto-rebalance'])}
            </Text>
          </div>
        </SimpleGrid>

        {resource.status && (
          <Text size="xs" c="dimmed">
            {resource.status}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
