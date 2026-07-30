import {
  Badge,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconDatabase,
  IconServer,
} from '@tabler/icons-react';

import type {
  StorageResource,
} from '../hooks/useDashboard';

type StorageCardProps = {
  storage: StorageResource;
};

function formatBytes(value?: number): string {
  if (
    value === undefined
    || value === null
    || !Number.isFinite(value)
  ) {
    return '—';
  }

  const units = [
    'B',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
  ];

  let current = Math.max(value, 0);
  let unitIndex = 0;

  while (
    current >= 1024
    && unitIndex < units.length - 1
  ) {
    current /= 1024;
    unitIndex += 1;
  }

  const decimals =
    current >= 100 || unitIndex === 0
      ? 0
      : current >= 10
        ? 1
        : 2;

  return `${current.toFixed(decimals)} ${
    units[unitIndex]
  }`;
}

function calculateUsage(
  used?: number,
  total?: number,
): number {
  if (
    used === undefined
    || total === undefined
    || total <= 0
  ) {
    return 0;
  }

  return Math.min(
    Math.max((used / total) * 100, 0),
    100,
  );
}

function usageColor(percent: number): string {
  if (percent >= 90) {
    return 'red';
  }

  if (percent >= 75) {
    return 'orange';
  }

  return 'blue';
}

export function StorageCard({
  storage,
}: StorageCardProps) {
  const used = storage.disk ?? 0;
  const total = storage.maxdisk ?? 0;
  const free = Math.max(total - used, 0);

  const usage = calculateUsage(used, total);

  const normalizedStatus =
    storage.status?.toLowerCase();

  const online =
    normalizedStatus === 'available'
    || normalizedStatus === 'online';

  const storageName =
    storage.storage
    ?? storage.id?.split('/').at(-1)
    ?? 'Unknown storage';

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      h="100%"
    >
      <Stack
        gap="lg"
        h="100%"
        justify="space-between"
      >
        <Stack gap="md">
          <Group
            justify="space-between"
            align="flex-start"
            wrap="nowrap"
          >
            <Group
              gap="xs"
              wrap="nowrap"
              style={{
                minWidth: 0,
                flex: 1,
              }}
            >
              <IconDatabase
                size={22}
                style={{
                  flexShrink: 0,
                }}
              />

              <Text
                fw={700}
                size="lg"
                truncate
                title={storageName}
              >
                {storageName}
              </Text>
            </Group>

            <Badge
              color={online ? 'green' : 'red'}
              variant="light"
              style={{
                flexShrink: 0,
              }}
            >
              {storage.status ?? 'Unknown'}
            </Badge>
          </Group>

          <Group
            gap="xs"
            align="flex-start"
            mih={50}
          >
            <Badge
              variant="light"
              color="blue"
              leftSection={
                <IconServer size={12} />
              }
            >
              {storage.node ?? 'Cluster'}
            </Badge>

            {storage.plugintype && (
              <Badge
                variant="outline"
                color="gray"
              >
                {storage.plugintype}
              </Badge>
            )}

            <Badge
              variant="light"
              color={
                storage.shared === 1
                  ? 'violet'
                  : 'gray'
              }
            >
              {storage.shared === 1
                ? 'Shared'
                : 'Local'}
            </Badge>
          </Group>

          <Stack gap={6}>
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Usage
              </Text>

              <Text size="sm" c="dimmed">
                {usage.toFixed(1)}%
              </Text>
            </Group>

            <Progress
              value={usage}
              color={usageColor(usage)}
              size="lg"
              radius="xl"
            />
          </Stack>

          <SimpleGrid cols={3} spacing="sm">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Used
              </Text>

              <Text fw={700}>
                {formatBytes(used)}
              </Text>
            </Stack>

            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Free
              </Text>

              <Text fw={700}>
                {formatBytes(free)}
              </Text>
            </Stack>

            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Total
              </Text>

              <Text fw={700}>
                {formatBytes(total)}
              </Text>
            </Stack>
          </SimpleGrid>
        </Stack>

        <Stack gap={2} mih={42}>
          <Text size="xs" c="dimmed">
            Content
          </Text>

          <Text
            size="sm"
            c={storage.content ? undefined : 'dimmed'}
            lineClamp={2}
            title={storage.content ?? undefined}
          >
            {storage.content || 'No content types reported'}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
