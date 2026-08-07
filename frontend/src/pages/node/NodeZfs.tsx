import {
  Alert,
  Badge,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconCheck,
  IconDatabase,
} from '@tabler/icons-react';

import type { HostDetails } from '../../hooks/useHostDetails';

import { NodeInfoCard } from './NodeInfoComponents';
import { formatBytes } from './format';

function usageColor(value: number) {
  if (value >= 90) {
    return 'red';
  }

  if (value >= 75) {
    return 'yellow';
  }

  return 'blue';
}

function healthColor(
  health?: string,
): string {
  switch (health?.toUpperCase()) {
    case 'ONLINE':
      return 'green';

    case 'DEGRADED':
      return 'orange';

    case 'FAULTED':
    case 'UNAVAIL':
    case 'REMOVED':
      return 'red';

    default:
      return 'gray';
  }
}

function hasPoolErrors(
  readErrors: number,
  writeErrors: number,
  checksumErrors: number,
): boolean {
  return (
    readErrors > 0 ||
    writeErrors > 0 ||
    checksumErrors > 0
  );
}

export function NodeZfs({
  details,
}: {
  details: HostDetails;
}) {
  if (!details.zfs.available) {
    return (
      <Alert
        color="yellow"
        icon={<IconAlertCircle size={18} />}
        title="ZFS not available"
      >
        No ZFS pools were detected on this node.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {details.zfs.pools.map((pool) => {
        const health =
          pool.health ??
          pool.state ??
          'UNKNOWN';

        const readErrors =
          pool.read_errors ?? 0;

        const writeErrors =
          pool.write_errors ?? 0;

        const checksumErrors =
          pool.checksum_errors ?? 0;

        const unhealthy =
          health.toUpperCase() !== 'ONLINE';

        const poolHasErrors =
          hasPoolErrors(
            readErrors,
            writeErrors,
            checksumErrors,
          );

        return (
          <Paper
            key={pool.name}
            withBorder
            radius="md"
            p="lg"
          >
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={4}>
                    {pool.name}
                  </Title>

                  <Text
                    size="sm"
                    c="dimmed"
                  >
                    {pool.scan ??
                      'No scan information available'}
                  </Text>
                </div>

                <Badge
                  color={healthColor(health)}
                  variant="light"
                  size="lg"
                >
                  {health}
                </Badge>
              </Group>

              {unhealthy && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle size={18} />
                  }
                  title="ZFS pool health warning"
                >
                  Pool {pool.name} is currently{' '}
                  <strong>{health}</strong>.
                </Alert>
              )}

              {!unhealthy &&
                !poolHasErrors && (
                  <Alert
                    color="green"
                    icon={
                      <IconCheck size={18} />
                    }
                    title="ZFS pool healthy"
                  >
                    The pool is ONLINE and no
                    read, write or checksum
                    errors are reported.
                  </Alert>
                )}

              <Progress
                value={
                  pool.capacity_percent ?? 0
                }
                color={usageColor(
                  pool.capacity_percent ?? 0,
                )}
              />

              <SimpleGrid
                cols={{
                  base: 2,
                  sm: 4,
                }}
              >
                <NodeInfoCard
                  label="Size"
                  value={formatBytes(
                    pool.size,
                  )}
                  icon={
                    <IconDatabase size={18} />
                  }
                />

                <NodeInfoCard
                  label="Allocated"
                  value={formatBytes(
                    pool.allocated,
                  )}
                  icon={
                    <IconDatabase size={18} />
                  }
                />

                <NodeInfoCard
                  label="Free"
                  value={formatBytes(
                    pool.free,
                  )}
                  icon={
                    <IconDatabase size={18} />
                  }
                />

                <NodeInfoCard
                  label="Fragmentation"
                  value={`${
                    pool.fragmentation_percent ??
                    0
                  }%`}
                  icon={
                    <IconDatabase size={18} />
                  }
                />
              </SimpleGrid>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 3,
                }}
              >
                <NodeInfoCard
                  label="Read errors"
                  value={String(readErrors)}
                  icon={
                    <IconDatabase size={18} />
                  }
                />

                <NodeInfoCard
                  label="Write errors"
                  value={String(writeErrors)}
                  icon={
                    <IconDatabase size={18} />
                  }
                />

                <NodeInfoCard
                  label="Checksum errors"
                  value={String(
                    checksumErrors,
                  )}
                  icon={
                    <IconDatabase size={18} />
                  }
                />
              </SimpleGrid>

              {poolHasErrors && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle size={18} />
                  }
                  title="ZFS I/O errors detected"
                >
                  Read: {readErrors} · Write:{' '}
                  {writeErrors} · Checksum:{' '}
                  {checksumErrors}
                </Alert>
              )}

              {pool.errors &&
                pool.errors !==
                  'No known data errors' && (
                  <Alert
                    color="red"
                    icon={
                      <IconAlertCircle
                        size={18}
                      />
                    }
                    title="ZFS data errors"
                  >
                    {pool.errors}
                  </Alert>
                )}
            </Stack>
          </Paper>
        );
      })}

      <Paper
        withBorder
        radius="md"
        p="lg"
      >
        <Stack>
          <Title order={4}>
            Datasets
          </Title>

          <ScrollArea>
            <Table
              striped
              withTableBorder
              miw={900}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Used</Table.Th>
                  <Table.Th>
                    Available
                  </Table.Th>
                  <Table.Th>
                    Referenced
                  </Table.Th>
                  <Table.Th>
                    Mountpoint
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {details.zfs.datasets.map(
                  (dataset) => (
                    <Table.Tr
                      key={dataset.name}
                    >
                      <Table.Td>
                        {dataset.name}
                      </Table.Td>

                      <Table.Td>
                        {dataset.type}
                      </Table.Td>

                      <Table.Td>
                        {formatBytes(
                          dataset.used,
                        )}
                      </Table.Td>

                      <Table.Td>
                        {formatBytes(
                          dataset.available,
                        )}
                      </Table.Td>

                      <Table.Td>
                        {formatBytes(
                          dataset.referenced,
                        )}
                      </Table.Td>

                      <Table.Td>
                        {dataset.mountpoint}
                      </Table.Td>
                    </Table.Tr>
                  ),
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Paper>
    </Stack>
  );
}
