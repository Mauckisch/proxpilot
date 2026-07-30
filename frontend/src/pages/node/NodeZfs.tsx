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
      {details.zfs.pools.map((pool) => (
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
                  {pool.scan}
                </Text>
              </div>

              <Badge
                color={
                  pool.health === 'ONLINE'
                    ? 'green'
                    : 'red'
                }
                variant="light"
              >
                {pool.health ??
                  pool.state}
              </Badge>
            </Group>

            <Progress
              value={
                pool.capacity_percent ?? 0
              }
              color={usageColor(
                pool.capacity_percent ?? 0,
              )}
            />

            <SimpleGrid cols={4}>
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

            {pool.errors &&
              pool.errors !==
                'No known data errors' && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle size={
                      18
                    } />
                  }
                >
                  {pool.errors}
                </Alert>
              )}
          </Stack>
        </Paper>
      ))}

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
                  <Table.Th>Available</Table.Th>
                  <Table.Th>Referenced</Table.Th>
                  <Table.Th>Mountpoint</Table.Th>
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
