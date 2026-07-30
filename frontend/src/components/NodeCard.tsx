import {
  Badge,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPackage,
  IconPower,
  IconRefresh,
  IconServer,
  IconTool,
} from '@tabler/icons-react';

import type { ClusterNode } from '../hooks/useDashboard';
import type { NodeUpdateStatus } from '../hooks/useUpdates';

export type NodeAction =
  | 'check-updates'
  | 'install-updates'
  | 'reboot'
  | 'shutdown';

export type MaintenanceAction = 'enable' | 'disable';

type NodeCardProps = {
  node: ClusterNode;
  updateStatus?: NodeUpdateStatus;
  actionRunning: boolean;
  onOpenDetails?: (node: ClusterNode) => void;
  onOpenUpdates?: (node: ClusterNode) => void;
  onMaintenanceAction: (
    node: ClusterNode,
    action: MaintenanceAction,
  ) => void;
  onNodeAction: (
    node: ClusterNode,
    action: NodeAction,
  ) => void;
};

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(unitIndex >= 3 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) {
    return '0 minutes';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function percent(value?: number, maximum?: number): number {
  if (!value || !maximum || maximum <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (value / maximum) * 100),
  );
}

function getMetricColor(
  value: number,
  warningThreshold: number,
): string {
  if (value >= 90) {
    return 'red';
  }

  if (value >= warningThreshold) {
    return 'yellow';
  }

  return 'blue';
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Stack gap={5}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {label}
        </Text>

        <Text size="xs" fw={600}>
          {value.toFixed(1)}%
        </Text>
      </Group>

      <Progress
        value={value}
        color={color}
        size="sm"
        radius="xl"
      />
    </Stack>
  );
}

export function NodeCard({
  node,
  updateStatus,
  actionRunning,
  onOpenDetails,
  onOpenUpdates,
  onMaintenanceAction,
  onNodeAction,
}: NodeCardProps) {
  const cpuPercent = Math.min(
    100,
    Math.max(0, (node.cpu ?? 0) * 100),
  );

  const memoryPercent = percent(node.mem, node.maxmem);
  const storagePercent = percent(node.disk, node.maxdisk);
  const online = node.status?.toLowerCase() === 'online';

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      style={{
        cursor: 'pointer',
        height: '100%',
        transition:
          'transform 120ms ease, box-shadow 120ms ease',
      }}
      onClick={() => onOpenDetails?.(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onOpenDetails?.(node);
        }
      }}
      tabIndex={0}
      role="button"
    >
      <Stack gap="md" h="100%">
        <Stack gap="sm">
          <Text
            fw={700}
            size="lg"
            ta="center"
            style={{
              width: '100%',
              lineHeight: 1.25,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {node.node}
          </Text>

          <Group
            justify="space-between"
            align="flex-start"
            wrap="nowrap"
          >
            <Group
              gap="xs"
              wrap="nowrap"
              align="center"
              style={{
                minWidth: 0,
                paddingTop: 2,
              }}
            >
              <IconServer
                size={22}
                style={{ flexShrink: 0 }}
              />

              <Text
                size="sm"
                c="dimmed"
                style={{
                  whiteSpace: 'nowrap',
                }}
              >
                Uptime: {formatUptime(node.uptime)}
              </Text>
            </Group>

            <Stack
              gap={6}
              align="flex-end"
              style={{ flexShrink: 0 }}
            >
              <Badge color={online ? 'green' : 'red'}>
                {online
                  ? 'Online'
                  : node.status ?? 'Unknown'}
              </Badge>

              <Badge
                color={
                  node.maintenance ? 'yellow' : 'gray'
                }
                leftSection={<IconTool size={12} />}
              >
                {node.maintenance
                  ? 'Maintenance'
                  : 'Normal'}
              </Badge>

              <Badge
                color={
                  !updateStatus
                    ? 'gray'
                    : updateStatus.updates > 0
                      ? 'yellow'
                      : 'green'
                }
                variant="light"
                leftSection={
                  !updateStatus ||
                  updateStatus.updates > 0 ? (
                    <IconPackage size={12} />
                  ) : (
                    <IconCircleCheck size={12} />
                  )
                }
                style={{ cursor: 'pointer' }}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenUpdates?.(node);
                }}
              >
                {!updateStatus
                  ? 'Updates not checked'
                  : updateStatus.updates > 0
                    ? `${updateStatus.updates} updates`
                    : 'Up to date'}
              </Badge>

              {updateStatus?.reboot_required && (
                <Badge
                  color="red"
                  variant="light"
                  leftSection={
                    <IconAlertTriangle size={12} />
                  }
                  style={{ cursor: 'pointer' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenUpdates?.(node);
                  }}
                >
                  Reboot required
                </Badge>
              )}
            </Stack>
          </Group>
        </Stack>

        <SimpleGrid cols={1}>
          <Metric
            label="CPU usage"
            value={cpuPercent}
            color={getMetricColor(cpuPercent, 70)}
          />

          <Metric
            label="Memory usage"
            value={memoryPercent}
            color={getMetricColor(memoryPercent, 75)}
          />

          {node.maxdisk ? (
            <Metric
              label="Storage usage"
              value={storagePercent}
              color={getMetricColor(storagePercent, 80)}
            />
          ) : null}
        </SimpleGrid>

        <Group justify="space-between">
          <div>
            <Text size="xs" c="dimmed">
              Memory
            </Text>

            <Text size="sm" fw={600}>
              {formatBytes(node.mem)} of{' '}
              {formatBytes(node.maxmem)}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              CPU cores
            </Text>

            <Text size="sm" fw={600}>
              {node.maxcpu ?? 'Unknown'}
            </Text>
          </div>
        </Group>

        {node.maxdisk ? (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Storage
            </Text>

            <Text size="sm" fw={600}>
              {formatBytes(node.disk)} of{' '}
              {formatBytes(node.maxdisk)}
            </Text>
          </Group>
        ) : null}

        <Stack
          gap="md"
          mt="auto"
          onClick={(event) => event.stopPropagation()}
        >
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Maintenance
            </Text>

            <Group grow>
              <Button
                variant="light"
                color="yellow"
                leftSection={<IconTool size={16} />}
                disabled={
                  actionRunning ||
                  node.maintenance ||
                  !online
                }
                onClick={() =>
                  onMaintenanceAction(node, 'enable')
                }
              >
                Enable
              </Button>

              <Button
                variant="light"
                color="green"
                leftSection={<IconTool size={16} />}
                disabled={
                  actionRunning ||
                  !node.maintenance ||
                  !online
                }
                onClick={() =>
                  onMaintenanceAction(node, 'disable')
                }
              >
                Disable
              </Button>
            </Group>
          </Stack>

          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Updates
            </Text>

            <Group grow>
              <Button
                variant="light"
                leftSection={<IconPackage size={16} />}
                disabled={actionRunning || !online}
                onClick={() =>
                  onNodeAction(node, 'check-updates')
                }
              >
                Check
              </Button>

              <Button
                variant="light"
                color="yellow"
                leftSection={<IconPackage size={16} />}
                disabled={actionRunning || !online}
                onClick={() =>
                  onNodeAction(node, 'install-updates')
                }
              >
                Install
              </Button>
            </Group>
          </Stack>

          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Power
            </Text>

            <Group grow>
              <Button
                variant="light"
                color="orange"
                leftSection={<IconRefresh size={16} />}
                disabled={actionRunning || !online}
                onClick={() =>
                  onNodeAction(node, 'reboot')
                }
              >
                Reboot
              </Button>

              <Button
                variant="light"
                color="red"
                leftSection={<IconPower size={16} />}
                disabled={actionRunning || !online}
                onClick={() =>
                  onNodeAction(node, 'shutdown')
                }
              >
                Shutdown
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}
