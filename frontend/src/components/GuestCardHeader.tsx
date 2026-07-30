import {
  Badge,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';

import {
  IconCamera,
  IconServer,
} from '@tabler/icons-react';

import type { Guest } from '../hooks/useDashboard';

type GuestCardHeaderProps = {
  guest: Guest;
};

export function GuestCardHeader({
  guest,
}: GuestCardHeaderProps) {
  const running =
    guest.status?.toLowerCase() === 'running';

  const guestType =
    guest.type === 'qemu' ? 'VM' : 'LXC';

  return (
    <Group
      justify="space-between"
      align="flex-start"
      wrap="nowrap"
    >
      <div style={{ minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap">
          <IconServer size={22} />

          <Text
            fw={700}
            size="lg"
            truncate
            title={guest.name || `Guest ${guest.vmid}`}
          >
            {guest.name || `Guest ${guest.vmid}`}
          </Text>
        </Group>

        <Group gap={6} mt={6}>
          <Badge
            size="sm"
            variant="light"
            color={
              guest.type === 'qemu'
                ? 'blue'
                : 'violet'
            }
          >
            {guestType} {guest.vmid}
          </Badge>

          <Badge
            size="sm"
            variant="outline"
            color="gray"
          >
            {guest.node || 'Unknown node'}
          </Badge>

          {guest.hastate && (
            <Badge
              size="sm"
              variant="outline"
              color="teal"
            >
              HA: {guest.hastate}
            </Badge>
          )}
        </Group>
      </div>

      <Stack gap={6} align="flex-end">
        <Badge
          color={running ? 'green' : 'gray'}
          variant="light"
        >
          {running ? 'Running' : guest.status || 'Unknown'}
        </Badge>

        {(guest.snapshot_count ?? 0) > 0 && (
          <Tooltip
            label={
              guest.latest_snapshot
                ? `Latest snapshot: ${guest.latest_snapshot}`
                : `${guest.snapshot_count} snapshot${
                    guest.snapshot_count === 1 ? '' : 's'
                  }`
            }
          >
            <Badge
              color="cyan"
              variant="light"
              leftSection={<IconCamera size={13} />}
            >
              {guest.snapshot_count}
            </Badge>
          </Tooltip>
        )}
      </Stack>
    </Group>
  );
}
