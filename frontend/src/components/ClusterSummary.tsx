import {
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconPackage,
  IconServer,
} from '@tabler/icons-react';

import type { DashboardData } from '../hooks/useDashboard';
import type { NodeUpdateStatus } from '../hooks/useUpdates';

function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / 1024 ** unit).toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  progress,
}: {
  icon: typeof IconServer;
  label: string;
  value: string;
  subtext?: string;
  progress?: number;
}) {
  return (
    <Card
      withBorder
      radius="md"
      p="md"
      h="100%"
    >
      <Stack gap="xs" h="100%">
        <Group
          justify="space-between"
          align="center"
          wrap="nowrap"
          gap="sm"
        >
          <ThemeIcon
            variant="light"
            color="blue"
            size="lg"
            radius="md"
            style={{ flexShrink: 0 }}
          >
            <Icon size={20} />
          </ThemeIcon>

          <Text
            fw={700}
            size="xl"
            ta="right"
            style={{
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {value}
          </Text>
        </Group>

        <Stack gap={2}>
          <Text
            size="sm"
            fw={600}
            style={{ whiteSpace: 'nowrap' }}
          >
            {label}
          </Text>

          {subtext && (
            <Text
              size="xs"
              c="dimmed"
              style={{ whiteSpace: 'nowrap' }}
            >
              {subtext}
            </Text>
          )}
        </Stack>

        {progress !== undefined && (
          <Progress
            value={progress}
            radius="xl"
            mt="auto"
          />
        )}
      </Stack>
    </Card>
  );
}

type Props = {
  data: DashboardData;
  updates?: NodeUpdateStatus[];
};

export function ClusterSummary({
  data,
  updates,
}: Props) {
  const nodes = data.nodes;

  const online = nodes.filter(
    (node) =>
      node.status?.toLowerCase() === 'online',
  ).length;

  const totalCores = nodes.reduce(
    (sum, node) => sum + (node.maxcpu ?? 0),
    0,
  );

  const cpuUsage =
    totalCores > 0
      ? (
          nodes.reduce(
            (sum, node) =>
              sum +
              (node.cpu ?? 0) *
                (node.maxcpu ?? 0),
            0,
          ) / totalCores
        ) * 100
      : 0;

  const usedMemory = nodes.reduce(
    (sum, node) => sum + (node.mem ?? 0),
    0,
  );

  const totalMemory = nodes.reduce(
    (sum, node) => sum + (node.maxmem ?? 0),
    0,
  );

  const usedStorage = nodes.reduce(
    (sum, node) => sum + (node.disk ?? 0),
    0,
  );

  const totalStorage = nodes.reduce(
    (sum, node) => sum + (node.maxdisk ?? 0),
    0,
  );

  const updateCount =
    updates?.reduce(
      (sum, node) => sum + node.updates,
      0,
    ) ?? 0;

  const memoryPercent =
    totalMemory > 0
      ? (usedMemory / totalMemory) * 100
      : 0;

  const storagePercent =
    totalStorage > 0
      ? (usedStorage / totalStorage) * 100
      : 0;

  return (
    <SimpleGrid
      cols={{
        base: 1,
        sm: 2,
        lg: 5,
      }}
      spacing="md"
    >
      <SummaryCard
        icon={IconServer}
        label="Nodes"
        value={`${online}/${nodes.length}`}
      />

      <SummaryCard
        icon={IconCpu}
        label="CPU Usage"
        value={`${cpuUsage.toFixed(1)}%`}
        subtext={`of ${totalCores} cores`}
        progress={cpuUsage}
      />

      <SummaryCard
        icon={IconDeviceDesktop}
        label="Memory"
        value={formatBytes(usedMemory)}
        subtext={`of ${formatBytes(totalMemory)}`}
        progress={memoryPercent}
      />

      <SummaryCard
        icon={IconDatabase}
        label="Storage"
        value={formatBytes(usedStorage)}
        subtext={`of ${formatBytes(totalStorage)}`}
        progress={storagePercent}
      />

      <SummaryCard
        icon={IconPackage}
        label="Updates"
        value={String(updateCount)}
      />
    </SimpleGrid>
  );
}
