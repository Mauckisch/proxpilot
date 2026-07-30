import { useMemo, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowsExchange,
  IconNetwork,
  IconListDetails,
  IconTopologyStar,
  IconRefresh,
  IconRouter,
  IconServer,
  IconTopologyStar3,
} from '@tabler/icons-react';

import {
  type NetworkAddress,
  type NetworkInterface,
  useNetwork,
} from '../hooks/useNetwork';
import { NetworkGraph } from '../network/NetworkGraph';

const nodeOptions = [
  {
    value: 'pve',
    label: 'pve · 192.168.123.254',
  },
  {
    value: 'pve2',
    label: 'pve2 · 192.168.123.253',
  },
  {
    value: 'pve3',
    label: 'pve3 · 192.168.123.252',
  },
];

function formatBytes(value?: number): string {
  if (value === undefined || value === null) {
    return '—';
  }

  if (value === 0) {
    return '0 B';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
  ];

  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );

  const amount = value / 1024 ** index;

  return `${amount.toFixed(
    amount >= 100 || index === 0 ? 0 : 1,
  )} ${units[index]}`;
}

function formatSpeed(speed?: number | null): string {
  if (!speed || speed <= 0) {
    return '—';
  }

  if (speed >= 1000) {
    return `${speed / 1000} Gbit/s`;
  }

  return `${speed} Mbit/s`;
}

function formatAddress(
  address: NetworkAddress,
): string {
  if (!address.local) {
    return '—';
  }

  if (address.prefixlen === undefined) {
    return address.local;
  }

  return `${address.local}/${address.prefixlen}`;
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'physical':
      return 'blue';

    case 'bridge':
      return 'violet';

    case 'vlan':
      return 'orange';

    case 'bond':
      return 'cyan';

    case 'tun':
      return 'gray';

    case 'loopback':
      return 'dark';

    default:
      return 'gray';
  }
}

function getState(
  networkInterface: NetworkInterface,
): string {
  if (networkInterface.guest) {
    return networkInterface.guest.status === 'running'
      ? 'up'
      : 'down';
  }

  return (
    networkInterface.state ??
    networkInterface.operstate ??
    'unknown'
  ).toLowerCase();
}

function getStateColor(state: string): string {
  switch (state) {
    case 'up':
      return 'green';

    case 'down':
      return 'red';

    default:
      return 'gray';
  }
}

export function NetworkPage() {
  const [selectedNode, setSelectedNode] =
    useState<string | null>('pve');

  const network = useNetwork(
    selectedNode ?? 'pve',
  );

  const interfaces = useMemo(() => {
    return [...(network.data?.interfaces ?? [])].sort(
      (first, second) => {
        const typeOrder: Record<string, number> = {
          physical: 1,
          bridge: 2,
          vlan: 3,
          bond: 4,
          tun: 5,
          loopback: 6,
        };

        const firstOrder =
          typeOrder[first.type] ?? 99;

        const secondOrder =
          typeOrder[second.type] ?? 99;

        if (firstOrder !== secondOrder) {
          return firstOrder - secondOrder;
        }

        return first.name.localeCompare(
          second.name,
          undefined,
          {
            numeric: true,
          },
        );
      },
    );
  }, [network.data?.interfaces]);

  if (network.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading network information...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (network.isError) {
    const message =
      network.error instanceof Error
        ? network.error.message
        : 'The network information could not be loaded.';

    return (
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Network</Title>

            <Text c="dimmed" mt={4}>
              Physical interfaces, bridges and VLANs
            </Text>
          </div>

          <Select
            data={nodeOptions}
            value={selectedNode}
            onChange={setSelectedNode}
            allowDeselect={false}
            w={260}
          />
        </Group>

        <Alert
          color="red"
          icon={<IconAlertCircle size={20} />}
          title="Unable to load network information"
        >
          {message}
        </Alert>
      </Stack>
    );
  }

  const data = network.data;

  if (!data) {
    return null;
  }

  const defaultRoute = data.default_routes?.[0];

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Network</Title>

          <Text c="dimmed" mt={4}>
            Physical interfaces, Linux bridges and VLAN
            topology
          </Text>
        </div>

        <Group align="flex-end">
          <Select
            label="Node"
            data={nodeOptions}
            value={selectedNode}
            onChange={setSelectedNode}
            allowDeselect={false}
            w={260}
          />

          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={network.isFetching}
            onClick={() => network.refetch()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab
            value="overview"
            leftSection={
              <IconListDetails size={16} />
            }
          >
            Overview
          </Tabs.Tab>

          <Tabs.Tab
            value="topology"
            leftSection={
              <IconTopologyStar size={16} />
            }
          >
            Topology
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="xl">
          <Stack gap="xl">
      <SimpleGrid
        cols={{
          base: 1,
          sm: 2,
          xl: 4,
        }}
      >
        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>Interfaces</Text>

              <IconNetwork size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {data.summary.interface_count}
            </Text>

            <Text size="sm" c="dimmed">
              {data.summary.up_count} active interfaces
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>Physical</Text>

              <IconServer size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {data.summary.physical_count}
            </Text>

            <Text size="sm" c="dimmed">
              Physical network adapters
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>Bridges</Text>

              <IconTopologyStar3 size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {data.summary.bridge_count}
            </Text>

            <Text size="sm" c="dimmed">
              Linux bridge interfaces
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>VLANs</Text>

              <IconArrowsExchange size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {data.summary.vlan_count}
            </Text>

            <Text size="sm" c="dimmed">
              VLAN subinterfaces
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      <Paper withBorder radius="md" p="lg">
        <SimpleGrid
          cols={{
            base: 1,
            md: 3,
          }}
        >
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Hostname
            </Text>

            <Text fw={600} mt={4}>
              {data.hostname}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Default route
            </Text>

            <Group gap="xs" mt={4}>
              <IconRouter size={16} />

              <Text fw={600}>
                {defaultRoute?.gateway ?? '—'}
              </Text>

              {defaultRoute?.dev && (
                <Badge variant="light">
                  {defaultRoute.dev}
                </Badge>
              )}
            </Group>
          </div>

          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              DNS servers
            </Text>

            <Group gap="xs" mt={4}>
              {data.dns_servers.length > 0 ? (
                data.dns_servers.map((server) => (
                  <Badge
                    key={server}
                    variant="light"
                    color="gray"
                  >
                    {server}
                  </Badge>
                ))
              ) : (
                <Text fw={600}>—</Text>
              )}
            </Group>
          </div>
        </SimpleGrid>
      </Paper>

      <Paper withBorder radius="md">
        <Group
          justify="space-between"
          px="lg"
          py="md"
        >
          <div>
            <Text fw={700}>Network interfaces</Text>

            <Text size="sm" c="dimmed">
              Interface state, assignment and traffic
            </Text>
          </div>

          <Badge variant="light" size="lg">
            {interfaces.length} interfaces
          </Badge>
        </Group>

        <ScrollArea>
          <Table
            striped
            highlightOnHover
            verticalSpacing="sm"
            horizontalSpacing="lg"
            miw={1200}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Interface</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Master</Table.Th>
                <Table.Th>VLAN</Table.Th>
                <Table.Th>IP addresses</Table.Th>
                <Table.Th>Speed</Table.Th>
                <Table.Th>MTU</Table.Th>
                <Table.Th>Received</Table.Th>
                <Table.Th>Transmitted</Table.Th>
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {interfaces.map((networkInterface) => {
                const state = getState(
                  networkInterface,
                );

                const addresses =
                  networkInterface.addresses?.filter(
                    (address) =>
                      address.family === 'inet' ||
                      address.family === 'inet6',
                  ) ?? [];

                return (
                  <Table.Tr key={networkInterface.guest?.name ?? networkInterface.name}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={700}>
                          {networkInterface.guest?.name ??
                            networkInterface.name}
                        </Text>

                        {networkInterface.guest && (
                          <Text
                            size="xs"
                            c="dimmed"
                            ff="monospace"
                          >
                            {networkInterface.name}
                          </Text>
                        )}

                        {networkInterface.mac_address && (
                          <Text
                            size="xs"
                            c="dimmed"
                            ff="monospace"
                          >
                            {
                              networkInterface.mac_address
                            }
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>

                    <Table.Td>
                      <Badge
                        color={getTypeColor(
                          networkInterface.type,
                        )}
                        variant="light"
                      >
                        {networkInterface.type}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      <Badge
                        color={getStateColor(state)}
                        variant="dot"
                      >
                        {state}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      {networkInterface.master ? (
                        <Badge
                          variant="outline"
                          color="gray"
                        >
                          {networkInterface.master}
                        </Badge>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      {networkInterface.vlan_id ? (
                        <Badge
                          color="orange"
                          variant="light"
                        >
                          VLAN {
                            networkInterface.vlan_id
                          }
                        </Badge>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      {addresses.length > 0 ? (
                        <Stack gap={3}>
                          {addresses.map(
                            (address, index) => (
                              <Text
                                key={`${networkInterface.name}-${address.family}-${address.local}-${index}`}
                                size="sm"
                                ff="monospace"
                              >
                                {formatAddress(address)}
                              </Text>
                            ),
                          )}
                        </Stack>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      {formatSpeed(
                        networkInterface.speed,
                      )}
                    </Table.Td>

                    <Table.Td>
                      {networkInterface.mtu ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      {formatBytes(
                        networkInterface.statistics
                          ?.rx_bytes,
                      )}
                    </Table.Td>

                    <Table.Td>
                      {formatBytes(
                        networkInterface.statistics
                          ?.tx_bytes,
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="topology" pt="xl">
          <NetworkGraph
            interfaces={data.interfaces}
            defaultRoutes={data.default_routes}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
