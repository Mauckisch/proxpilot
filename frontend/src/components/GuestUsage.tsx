import {
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';

import type { Guest } from '../hooks/useDashboard';
import { useGuestDiskUsage } from '../hooks/useGuestDiskUsage';

type GuestUsageProps = {
  guest: Guest;
};

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) {
    return 'Unknown';
  }

  if (bytes <= 0) {
    return '0 B';
  }

  const units = [
    'B',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
  ];

  const unitIndex = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes / 1024 ** unitIndex;

  return `${value.toFixed(
    unitIndex >= 3 ? 1 : 0,
  )} ${units[unitIndex]}`;
}

function calculatePercent(
  value?: number,
  maximum?: number,
): number {
  if (
    value === undefined ||
    maximum === undefined ||
    maximum <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      (value / maximum) * 100,
    ),
  );
}

function progressColor(
  value: number,
): string {
  if (value >= 90) {
    return 'red';
  }

  if (value >= 75) {
    return 'yellow';
  }

  return 'blue';
}

type UsageItemProps = {
  label: string;
  value: number;
  detail: string;
};

function UsageItem({
  label,
  value,
  detail,
}: UsageItemProps) {
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      h="100%"
    >
      <Stack gap={7}>
        <Group justify="space-between">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
          >
            {label}
          </Text>

          <Text size="sm" fw={700}>
            {value.toFixed(1)}%
          </Text>
        </Group>

        <Progress
          value={value}
          color={progressColor(value)}
          size="sm"
          radius="xl"
        />

        <Text
          size="xs"
          c="dimmed"
          truncate
          title={detail}
        >
          {detail}
        </Text>
      </Stack>
    </Paper>
  );
}

export function GuestUsage({
  guest,
}: GuestUsageProps) {
  const cpuPercent = Math.min(
    100,
    Math.max(
      0,
      (guest.cpu ?? 0) * 100,
    ),
  );

  const memoryPercent =
    calculatePercent(
      guest.mem,
      guest.maxmem,
    );

  const diskUsage =
    useGuestDiskUsage(
      guest.node,
      guest.vmid,
      guest.type === 'qemu' &&
        guest.status?.toLowerCase() ===
          'running',
    );

  const hasGuestDiskUsage =
    diskUsage.data?.available === true &&
    diskUsage.data.total_bytes > 0;

  const diskPercent =
    hasGuestDiskUsage
      ? calculatePercent(
          diskUsage.data?.used_bytes,
          diskUsage.data?.total_bytes,
        )
      : 0;

  return (
    <SimpleGrid
      cols={{
        base: 1,
        sm: guest.maxdisk ? 3 : 2,
      }}
      spacing="sm"
    >
      <UsageItem
        label="CPU"
        value={cpuPercent}
        detail="Current processor usage"
      />

      <UsageItem
        label="Memory"
        value={memoryPercent}
        detail={`${formatBytes(
          guest.mem,
        )} / ${formatBytes(
          guest.maxmem,
        )}`}
      />

      {guest.maxdisk ? (
        hasGuestDiskUsage ? (
          <UsageItem
            label="Disk"
            value={diskPercent}
            detail={`${formatBytes(
              diskUsage.data?.used_bytes,
            )} / ${formatBytes(
              diskUsage.data?.total_bytes,
            )}`}
          />
        ) : (
          <Paper
            withBorder
            radius="md"
            p="sm"
            h="100%"
          >
            <Stack
              gap={7}
              h="100%"
              justify="center"
            >
              <Text
                size="xs"
                c="dimmed"
                fw={600}
              >
                Disk
              </Text>

              <Text
                size="lg"
                fw={700}
              >
                {formatBytes(
                  guest.maxdisk,
                )}
              </Text>

              <Text
                size="xs"
                c="dimmed"
              >
                Configured size
              </Text>
            </Stack>
          </Paper>
        )
      ) : null}
    </SimpleGrid>
  );
}
