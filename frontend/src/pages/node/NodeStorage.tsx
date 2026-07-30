import {
  Alert,
  Badge,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
} from '@tabler/icons-react';

import type {
  HostBlockDevice,
  HostDetails,
} from '../../hooks/useHostDetails';
import { NodeFilesystemCard } from './NodeInfoComponents';
import { formatBytes } from './format';

type FlattenedBlockDevice =
  HostBlockDevice & {
    depth: number;
  };

function flattenBlockDevices(
  devices: HostBlockDevice[],
  depth = 0,
): FlattenedBlockDevice[] {
  return devices.flatMap((device) => [
    {
      ...device,
      depth,
    },
    ...flattenBlockDevices(
      device.children ?? [],
      depth + 1,
    ),
  ]);
}

function getDeviceKind(
  device: HostBlockDevice,
): string {
  if (device.type === 'disk') {
    if (device.rota === true || device.rota === 1) {
      return 'HDD';
    }

    if (
      device.tran === 'nvme' ||
      device.name?.startsWith('nvme')
    ) {
      return 'NVMe SSD';
    }

    return 'SSD';
  }

  return device.type ?? 'Unknown';
}

function getMountpoints(
  device: HostBlockDevice,
): string {
  return (device.mountpoints ?? [])
    .filter(
      (mountpoint): mountpoint is string =>
        Boolean(mountpoint),
    )
    .join(', ') || '—';
}

export function NodeStorage({
  details,
}: {
  details: HostDetails;
}) {
  const filesystems =
    details.storage.filesystems ?? [];

  const blockDevices = flattenBlockDevices(
    details.storage.block_devices ?? [],
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>
          Mounted filesystems
        </Title>

        <Text size="sm" c="dimmed" mt={4}>
          Filesystems currently mounted on this
          Proxmox node.
        </Text>
      </div>

      {filesystems.length === 0 ? (
        <Alert
          color="yellow"
          icon={<IconAlertCircle size={18} />}
          title="No filesystems found"
        >
          The node did not return any mounted
          filesystems.
        </Alert>
      ) : (
        <SimpleGrid
          cols={{
            base: 1,
            md: 2,
            xl: 3,
          }}
        >
          {filesystems.map(
            (filesystem, index) => (
              <NodeFilesystemCard
                key={[
                  filesystem.filesystem,
                  filesystem.mountpoint,
                  index,
                ].join('-')}
                filesystem={filesystem}
              />
            ),
          )}
        </SimpleGrid>
      )}

      <Paper withBorder radius="md" p="lg">
        <Stack>
          <div>
            <Title order={4}>
              Block devices
            </Title>

            <Text size="sm" c="dimmed" mt={4}>
              Physical disks, partitions and
              logical block devices.
            </Text>
          </div>

          {blockDevices.length === 0 ? (
            <Alert
              color="yellow"
              icon={
                <IconAlertCircle size={18} />
              }
              title="No block devices found"
            >
              No block-device information was
              returned by the node.
            </Alert>
          ) : (
            <ScrollArea>
              <Table
                striped
                highlightOnHover
                withTableBorder
                miw={1200}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Device</Table.Th>
                    <Table.Th>Kind</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>Vendor / Model</Table.Th>
                    <Table.Th>Serial</Table.Th>
                    <Table.Th>Transport</Table.Th>
                    <Table.Th>Filesystem</Table.Th>
                    <Table.Th>Mountpoints</Table.Th>
                    <Table.Th>State</Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {blockDevices.map(
                    (device, index) => (
                      <Table.Tr
                        key={[
                          device.path,
                          device.name,
                          index,
                        ].join('-')}
                      >
                        <Table.Td>
                          <Text
                            size="sm"
                            fw={600}
                            pl={
                              device.depth * 18
                            }
                          >
                            {device.depth > 0
                              ? '↳ '
                              : ''}
                            {device.path ??
                              device.name ??
                              'Unknown'}
                          </Text>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            variant="light"
                            color={
                              device.type ===
                              'disk'
                                ? 'blue'
                                : 'gray'
                            }
                          >
                            {getDeviceKind(
                              device,
                            )}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          {formatBytes(
                            device.size,
                          )}
                        </Table.Td>

                        <Table.Td>
                          {[
                            device.vendor,
                            device.model,
                          ]
                            .filter(Boolean)
                            .join(' ') || '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.serial ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.tran ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.fstype ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {getMountpoints(device)}
                        </Table.Td>

                        <Table.Td>
                          {device.state ?? '—'}
                        </Table.Td>
                      </Table.Tr>
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
