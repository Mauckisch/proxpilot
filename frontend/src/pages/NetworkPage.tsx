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
import { useDashboard } from '../hooks/useDashboard';


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
  if (!address.address) {
    return '—';
  }

  if (address.prefix_length === undefined) {
    return address.address;
  }

  return `${address.address}/${address.prefix_length}`;
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
  const dashboard = useDashboard();

  const [
    selectedInfrastructureId,
    setSelectedInfrastructureId,
  ] = useState<number | null>(() => {
    const stored = localStorage.getItem(
      'proxpilot-network-infrastructure',
    );

    if (!stored) {
      return null;
    }

    const parsed = Number(stored);

    return Number.isInteger(parsed) &&
      parsed > 0
      ? parsed
      : null;
  });

  const [selectedNode, setSelectedNode] =
    useState<string | null>(null);

  const allNodes =
    dashboard.data?.nodes ?? [];

  const infrastructures = Array.from(
    allNodes.reduce(
      (
        result,
        node,
      ) => {
        if (
          !result.has(
            node.infrastructure_id,
          )
        ) {
          result.set(
            node.infrastructure_id,
            {
              id:
                node.infrastructure_id,
              name:
                node.infrastructure_name,
              type:
                node.infrastructure_type,
            },
          );
        }

        return result;
      },
      new Map<
        number,
        {
          id: number;
          name: string;
          type:
            | 'cluster'
            | 'standalone';
        }
      >(),
    ).values(),
  ).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const effectiveInfrastructureId =
    infrastructures.some(
      (infrastructure) =>
        infrastructure.id ===
        selectedInfrastructureId,
    )
      ? selectedInfrastructureId
      : infrastructures[0]?.id ??
        null;

  const infrastructureNodes =
    effectiveInfrastructureId === null
      ? []
      : allNodes
          .filter(
            (node) =>
              node.infrastructure_id ===
              effectiveInfrastructureId,
          )
          .sort((a, b) =>
            a.node.localeCompare(
              b.node,
              undefined,
              {
                numeric: true,
              },
            ),
          );

  const effectiveNode =
    infrastructureNodes.some(
      (node) =>
        node.node === selectedNode,
    )
      ? selectedNode
      : infrastructureNodes[0]?.node ??
        null;

  const infrastructureOptions =
    infrastructures.map(
      (infrastructure) => ({
        value: String(
          infrastructure.id,
        ),
        label:
          infrastructure.type ===
          'cluster'
            ? `${infrastructure.name} · Cluster`
            : `${infrastructure.name} · Standalone`,
      }),
    );

  const nodeOptions =
    infrastructureNodes.map(
      (node) => ({
        value: node.node,
        label:
          node.status
            ? `${node.node} · ${node.status}`
            : node.node,
      }),
    );

  const network = useNetwork(
    effectiveInfrastructureId ?? 0,
    effectiveNode ?? '',
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

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading Proxmox nodes...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (
    !dashboard.isLoading &&
    nodeOptions.length === 0
  ) {
    return (
      <Alert
        color="yellow"
        icon={<IconAlertCircle size={20} />}
        title="No nodes found"
      >
        No Proxmox nodes are available.
      </Alert>
    );
  }

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

          <Group align="flex-end">
            <Select
              label="Infrastructure"
              data={infrastructureOptions}
              value={
                effectiveInfrastructureId !==
                null
                  ? String(
                      effectiveInfrastructureId,
                    )
                  : null
              }
              onChange={(value) => {
                if (!value) {
                  return;
                }

                const id = Number(value);

                if (
                  !Number.isInteger(id) ||
                  id <= 0
                ) {
                  return;
                }

                setSelectedInfrastructureId(
                  id,
                );

                setSelectedNode(null);

                localStorage.setItem(
                  'proxpilot-network-infrastructure',
                  String(id),
                );
              }}
              allowDeselect={false}
              w={300}
            />

            <Select
              label="Node"
              data={nodeOptions}
              value={effectiveNode}
              onChange={setSelectedNode}
              allowDeselect={false}
              w={220}
            />
          </Group>
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
            label="Infrastructure"
            data={infrastructureOptions}
            value={
              effectiveInfrastructureId !==
              null
                ? String(
                    effectiveInfrastructureId,
                  )
                : null
            }
            onChange={(value) => {
              if (!value) {
                return;
              }

              const id = Number(value);

              if (
                !Number.isInteger(id) ||
                id <= 0
              ) {
                return;
              }

              setSelectedInfrastructureId(
                id,
              );

              setSelectedNode(null);

              localStorage.setItem(
                'proxpilot-network-infrastructure',
                String(id),
              );
            }}
            allowDeselect={false}
            w={300}
          />

          <Select
            label="Node"
            data={nodeOptions}
            value={effectiveNode}
            onChange={setSelectedNode}
            allowDeselect={false}
            w={220}
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
                                key={`${networkInterface.name}-${address.family}-${address.address}-${index}`}
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
