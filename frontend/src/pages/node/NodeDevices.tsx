import {
  Alert,
  Badge,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconDeviceUsb,
  IconCpu,
} from '@tabler/icons-react';

import type { HostDetails } from '../../hooks/useHostDetails';

export function NodeDevices({
  details,
}: {
  details: HostDetails;
}) {
  const pciDevices = details.pci.devices ?? [];
  const usbDevices = details.usb.devices ?? [];

  return (
    <Stack gap="lg">
      <Paper withBorder radius="md" p="lg">
        <Stack>
          <Group justify="space-between">
            <div>
              <Group gap="xs">
                <IconCpu size={20} />

                <Title order={4}>
                  PCI devices
                </Title>
              </Group>

              <Text
                size="sm"
                c="dimmed"
                mt={4}
              >
                PCI, PCI Express and integrated
                hardware detected by the node.
              </Text>
            </div>

            <Badge variant="light">
              {details.pci.count} devices
            </Badge>
          </Group>

          {pciDevices.length === 0 ? (
            <Alert
              color="yellow"
              icon={
                <IconAlertCircle size={18} />
              }
              title="No PCI devices found"
            >
              The node did not return any PCI
              device information.
            </Alert>
          ) : (
            <ScrollArea>
              <Table
                striped
                highlightOnHover
                withTableBorder
                miw={1000}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Slot</Table.Th>
                    <Table.Th>Class</Table.Th>
                    <Table.Th>Device</Table.Th>
                    <Table.Th>Revision</Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {pciDevices.map(
                    (device, index) => (
                      <Table.Tr
                        key={[
                          device.slot,
                          index,
                        ].join('-')}
                      >
                        <Table.Td>
                          <Text
                            ff="monospace"
                            size="sm"
                          >
                            {device.slot ?? '—'}
                          </Text>
                        </Table.Td>

                        <Table.Td>
                          {device.class ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.device ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.revision ?? '—'}
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

      <Paper withBorder radius="md" p="lg">
        <Stack>
          <Group justify="space-between">
            <div>
              <Group gap="xs">
                <IconDeviceUsb size={20} />

                <Title order={4}>
                  USB devices
                </Title>
              </Group>

              <Text
                size="sm"
                c="dimmed"
                mt={4}
              >
                USB controllers and attached USB
                devices detected by the host.
              </Text>
            </div>

            <Badge variant="light">
              {details.usb.count} devices
            </Badge>
          </Group>

          {usbDevices.length === 0 ? (
            <Alert
              color="yellow"
              icon={
                <IconAlertCircle size={18} />
              }
              title="No USB devices found"
            >
              The node did not return any USB
              device information.
            </Alert>
          ) : (
            <ScrollArea>
              <Table
                striped
                highlightOnHover
                withTableBorder
                miw={850}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Bus</Table.Th>
                    <Table.Th>Device</Table.Th>
                    <Table.Th>USB ID</Table.Th>
                    <Table.Th>Description</Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {usbDevices.map(
                    (device, index) => (
                      <Table.Tr
                        key={[
                          device.bus,
                          device.device_number,
                          index,
                        ].join('-')}
                      >
                        <Table.Td>
                          {device.bus ?? '—'}
                        </Table.Td>

                        <Table.Td>
                          {device.device_number ??
                            '—'}
                        </Table.Td>

                        <Table.Td>
                          <Text
                            ff="monospace"
                            size="sm"
                          >
                            {device.usb_id ?? '—'}
                          </Text>
                        </Table.Td>

                        <Table.Td>
                          {device.description ??
                            '—'}
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
