import {
  Badge,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconArrowsExchange,
  IconCloud,
  IconDeviceDesktop,
  IconLink,
  IconNetwork,
  IconRouter,
  IconTopologyStar3,
} from '@tabler/icons-react';
import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';

import type {
  NetworkFlowNode,
} from './NetworkTypes';

function getIcon(type: string) {
  switch (type) {
    case 'gateway':
      return IconCloud;

    case 'physical':
      return IconDeviceDesktop;

    case 'bridge':
      return IconTopologyStar3;

    case 'vlan':
      return IconArrowsExchange;

    case 'tun':
      return IconLink;

    case 'bond':
      return IconNetwork;

    default:
      return IconRouter;
  }
}

function getColor(type: string): string {
  switch (type) {
    case 'gateway':
      return 'cyan';

    case 'physical':
      return 'blue';

    case 'bridge':
      return 'violet';

    case 'vlan':
      return 'orange';

    case 'bond':
      return 'teal';

    case 'tun':
      return 'gray';

    default:
      return 'gray';
  }
}

function formatSpeed(speed?: number | null): string {
  if (!speed || speed <= 0) {
    return '';
  }

  if (speed >= 1000) {
    return `${speed / 1000} Gbit/s`;
  }

  return `${speed} Mbit/s`;
}

export function NetworkNode({
  data,
  selected,
}: NodeProps<NetworkFlowNode>) {
  const Icon = getIcon(data.interfaceType);
  const color = getColor(data.interfaceType);

  const state =
    data.state?.toLowerCase() ?? 'unknown';

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      <Paper
        withBorder
        radius="md"
        p="sm"
        shadow={selected ? 'md' : 'xs'}
        style={{
          width: 220,
          borderColor: selected
            ? `var(--mantine-color-${color}-6)`
            : undefined,
        }}
      >
        <Stack gap={7}>
          <Group
            justify="space-between"
            wrap="nowrap"
          >
            <Group gap="xs" wrap="nowrap">
              <Icon
                size={19}
                color={`var(--mantine-color-${color}-6)`}
              />

              <Text fw={700} truncate>
                {data.label}
              </Text>
            </Group>

            {data.interfaceType !== 'gateway' && (
              <Badge
                size="xs"
                variant="dot"
                color={
                  state === 'up'
                    ? 'green'
                    : state === 'down'
                      ? 'red'
                      : 'gray'
                }
              >
                {state}
              </Badge>
            )}
          </Group>

          <Group gap={5}>
            <Badge
              size="sm"
              color={color}
              variant="light"
            >
              {data.interfaceType}
            </Badge>

            {data.vlanId && (
              <Badge
                size="sm"
                color="orange"
                variant="outline"
              >
                VLAN {data.vlanId}
              </Badge>
            )}
          </Group>

          {data.subtitle && (
            <Text
              size="xs"
              c="dimmed"
              ff="monospace"
              truncate
            >
              {data.subtitle}
            </Text>
          )}

          {data.address && (
            <Text
              size="xs"
              ff="monospace"
              truncate
            >
              {data.address}
            </Text>
          )}

          {formatSpeed(data.speed) && (
            <Text size="xs" c="dimmed">
              {formatSpeed(data.speed)}
            </Text>
          )}
        </Stack>
      </Paper>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
