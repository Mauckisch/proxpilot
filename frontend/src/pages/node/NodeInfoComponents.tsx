import type { ReactNode } from 'react';

import {
  Card,
  Group,
  Progress,
  Table,
  Text,
  ThemeIcon,
  Badge,
  Stack,
} from '@mantine/core';

import type { HostFilesystem } from '../../hooks/useHostDetails';

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) {
    return 'Unknown';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

export function NodeInfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <Card withBorder radius="md" p="md">
      <Group wrap="nowrap">
        <ThemeIcon variant="light">
          {icon}
        </ThemeIcon>

        <div>
          <Text size="xs" c="dimmed">
            {label}
          </Text>

          <Text fw={700}>
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

export function NodeKeyValueTable({
  values,
}: {
  values: Array<[string, unknown]>;
}) {
  return (
    <Table striped withTableBorder>
      <Table.Tbody>
        {values.map(([k, v]) => (
          <Table.Tr key={k}>
            <Table.Td w="35%">
              <Text fw={600}>{k}</Text>
            </Table.Td>

            <Table.Td>
              {v === null || v === undefined || v === ''
                ? 'Unknown'
                : String(v)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function NodeFilesystemCard({
  filesystem,
}: {
  filesystem: HostFilesystem;
}) {
  const usage = filesystem.usage_percent ?? 0;

  return (
    <Card withBorder radius="md">
      <Stack>
        <Group justify="space-between">
          <div>
            <Text fw={700}>
              {filesystem.mountpoint}
            </Text>

            <Text size="xs" c="dimmed">
              {filesystem.filesystem}
            </Text>
          </div>

          <Badge variant="light">
            {usage}%
          </Badge>
        </Group>

        <Progress value={usage} />

        <Group justify="space-between">
          <Text size="xs">
            {formatBytes(filesystem.used)}
          </Text>

          <Text size="xs">
            {formatBytes(filesystem.total)}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
