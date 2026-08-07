import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBrandDebian,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDeviceUsb,
  IconGauge,
  IconInfoCircle,
  IconNetwork,
  IconPackage,
  IconRefresh,
  IconServer,
  IconTemperature,
  IconTopologyStar,
} from '@tabler/icons-react';

import {
  type HostBlockDevice,
  type HostFilesystem,
  type HostSmartDevice,
  useHostDetails,
} from '../hooks/useHostDetails';
import { useNetwork } from '../hooks/useNetwork';
import { useUpdates } from '../hooks/useUpdates';

type HostDetailsPageProps = {
  node: string;
  onBack: () => void;
};

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) {
    return 'Unknown';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** index;

  return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function formatUptime(seconds?: number): string {
  if (!seconds) {
    return 'Unknown';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days} days, ${hours} hours`;
  }

  if (hours > 0) {
    return `${hours} hours, ${minutes} minutes`;
  }

  return `${minutes} minutes`;
}

function formatNumber(value?: number, digits = 2): string {
  if (value === undefined || value === null) {
    return 'Unknown';
  }

  return value.toFixed(digits);
}

function percentage(
  used?: number | null,
  total?: number | null,
): number {
  if (!used || !total || total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (used / total) * 100));
}

function getUsageColor(value: number): string {
  if (value >= 90) {
    return 'red';
  }

  if (value >= 75) {
    return 'yellow';
  }

  return 'blue';
}

function getTemperatureColor(value?: number): string {
  if (value === undefined) {
    return 'gray';
  }

  if (value >= 85) {
    return 'red';
  }

  if (value >= 70) {
    return 'yellow';
  }

  return 'green';
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Group align="flex-start" wrap="nowrap">
        <ThemeIcon size="lg" variant="light" radius="md">
          {icon}
        </ThemeIcon>

        <div>
          <Text size="xs" c="dimmed">
            {label}
          </Text>

          <Text fw={700} mt={3}>
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

function KeyValueTable({
  values,
}: {
  values: Array<[string, string | number | null | undefined]>;
}) {
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Tbody>
        {values.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Td w="35%">
              <Text fw={600} size="sm">
                {label}
              </Text>
            </Table.Td>

            <Table.Td>
              <Text size="sm">
                {value === null ||
                value === undefined ||
                value === ''
                  ? 'Unknown'
                  : String(value)}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function FilesystemUsage({
  filesystem,
}: {
  filesystem: HostFilesystem;
}) {
  const usage =
    filesystem.usage_percent ??
    percentage(filesystem.used, filesystem.total);

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Text fw={700}>{filesystem.mountpoint}</Text>
            <Text size="xs" c="dimmed">
              {filesystem.filesystem} · {filesystem.type ?? 'Unknown'}
            </Text>
          </div>

          <Badge color={getUsageColor(usage)} variant="light">
            {usage.toFixed(0)}%
          </Badge>
        </Group>

        <Progress
          value={usage}
          color={getUsageColor(usage)}
          radius="xl"
        />

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Used: {formatBytes(filesystem.used)}
          </Text>

          <Text size="xs" c="dimmed">
            Total: {formatBytes(filesystem.total)}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}

function flattenBlockDevices(
  devices: HostBlockDevice[],
  depth = 0,
): Array<HostBlockDevice & { depth: number }> {
  return devices.flatMap((device) => [
    {
      ...device,
      depth,
    },
    ...flattenBlockDevices(device.children ?? [], depth + 1),
  ]);
}

function smartColor(
  health?: HostSmartDevice['health'],
): string {
  switch (health) {
    case 'healthy':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'critical':
      return 'red';
    default:
      return 'gray';
  }
}

function smartLabel(
  health?: HostSmartDevice['health'],
): string {
  switch (health) {
    case 'healthy':
      return 'Healthy';
    case 'warning':
      return 'Warning';
    case 'critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

export function HostDetailsPage({
  node,
  onBack,
}: HostDetailsPageProps) {
  const details = useHostDetails(node);
  const network = useNetwork(node);
  const updates = useUpdates();

  if (details.isLoading) {
    return (
      <Center mih={500}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Collecting hardware and system data from {node}...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (details.isError || !details.data) {
    const message =
      details.error instanceof Error
        ? details.error.message
        : 'The host details could not be loaded.';

    return (
      <Stack>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={18} />}
          onClick={onBack}
          w="fit-content"
        >
          Back to nodes
        </Button>

        <Alert
          color="red"
          icon={<IconAlertCircle size={20} />}
          title={`Unable to load ${node}`}
        >
          {message}
        </Alert>
      </Stack>
    );
  }

  const data = details.data;
  const memory = data.hardware.memory;
  const cpu = data.hardware.cpu;
  const system = data.hardware.system;
  const rootFilesystem = data.overview.root_filesystem;
  const nodeUpdates = updates.data?.find(
    (entry) => entry.node === node,
  );

  const memoryUsage = percentage(memory?.used, memory?.total);
  const swapUsage = percentage(
    memory?.swap_used,
    memory?.swap_total,
  );

  const blockDevices = flattenBlockDevices(
    data.storage.block_devices ?? [],
  );

  const smartDevices =
    data.storage.smart_devices ?? [];

  const smartByPath = new Map(
    smartDevices.map((device) => [
      device.path,
      device,
    ]),
  );

  const criticalSmartDevices =
    smartDevices.filter(
      (device) =>
        device.health === 'critical',
    );

  const warningSmartDevices =
    smartDevices.filter(
      (device) =>
        device.health === 'warning',
    );

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
            onClick={onBack}
          >
            Nodes
          </Button>

          <Divider orientation="vertical" />

          <div>
            <Group gap="xs">
              <IconServer size={28} />

              <Title order={2}>{data.overview.hostname}</Title>

              <Badge color="green" variant="light">
                Online
              </Badge>
            </Group>

            <Text c="dimmed" mt={4}>
              {data.overview.fqdn ?? node} ·{' '}
              {system?.product_name ?? 'Unknown hardware'}
            </Text>
          </div>
        </Group>

        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={details.isFetching}
          onClick={() => {
            void details.refetch();
            void network.refetch();
            void updates.refetch();
          }}
        >
          Refresh
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
        <InfoCard
          label="Proxmox version"
          value={data.overview.pve_version ?? 'Unknown'}
          icon={<IconTopologyStar size={20} />}
        />

        <InfoCard
          label="Kernel"
          value={data.overview.kernel ?? 'Unknown'}
          icon={<IconBrandDebian size={20} />}
        />

        <InfoCard
          label="Uptime"
          value={formatUptime(data.overview.uptime_seconds)}
          icon={<IconGauge size={20} />}
        />

        <InfoCard
          label="Available updates"
          value={
            nodeUpdates
              ? `${nodeUpdates.updates} package${
                  nodeUpdates.updates === 1 ? '' : 's'
                }`
              : 'Not checked'
          }
          icon={<IconPackage size={20} />}
        />
      </SimpleGrid>

      <Tabs defaultValue="overview" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab
            value="overview"
            leftSection={<IconInfoCircle size={16} />}
          >
            Overview
          </Tabs.Tab>

          <Tabs.Tab
            value="hardware"
            leftSection={<IconCpu size={16} />}
          >
            Hardware
          </Tabs.Tab>

          <Tabs.Tab
            value="storage"
            leftSection={<IconDeviceFloppy size={16} />}
          >
            Storage
          </Tabs.Tab>

          <Tabs.Tab
            value="network"
            leftSection={<IconNetwork size={16} />}
          >
            Network
          </Tabs.Tab>

          <Tabs.Tab
            value="devices"
            leftSection={<IconDeviceUsb size={16} />}
          >
            Devices
          </Tabs.Tab>

          <Tabs.Tab
            value="temperatures"
            leftSection={<IconTemperature size={16} />}
          >
            Temperatures
          </Tabs.Tab>

          <Tabs.Tab
            value="zfs"
            leftSection={<IconDatabase size={16} />}
          >
            ZFS
          </Tabs.Tab>

          <Tabs.Tab
            value="software"
            leftSection={<IconPackage size={16} />}
          >
            Software
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="lg">
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Title order={4}>System</Title>

                <KeyValueTable
                  values={[
                    ['Node', data.node],
                    ['Hostname', data.overview.hostname],
                    ['FQDN', data.overview.fqdn],
                    ['Architecture', data.overview.architecture],
                    [
                      'Operating system',
                      data.overview.os?.pretty_name,
                    ],
                    ['Kernel', data.overview.kernel],
                    ['Boot time', data.overview.boot_time],
                    ['Current time', data.overview.current_time],
                    [
                      'Virtualization',
                      data.overview.virtualization,
                    ],
                  ]}
                />
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Title order={4}>Current load</Title>

                <SimpleGrid cols={3}>
                  <InfoCard
                    label="1 minute"
                    value={formatNumber(
                      data.overview.load?.one_minute,
                    )}
                    icon={<IconGauge size={18} />}
                  />

                  <InfoCard
                    label="5 minutes"
                    value={formatNumber(
                      data.overview.load?.five_minutes,
                    )}
                    icon={<IconGauge size={18} />}
                  />

                  <InfoCard
                    label="15 minutes"
                    value={formatNumber(
                      data.overview.load?.fifteen_minutes,
                    )}
                    icon={<IconGauge size={18} />}
                  />
                </SimpleGrid>

                <Divider />

                <Text fw={600}>Memory usage</Text>

                <Progress
                  value={memoryUsage}
                  color={getUsageColor(memoryUsage)}
                  size="lg"
                  radius="xl"
                />

                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {formatBytes(memory?.used)} used
                  </Text>

                  <Text size="sm" c="dimmed">
                    {formatBytes(memory?.total)} total
                  </Text>
                </Group>

                {rootFilesystem && (
                  <>
                    <Divider />

                    <FilesystemUsage filesystem={rootFilesystem} />
                  </>
                )}
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="hardware" pt="lg">
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Paper withBorder radius="md" p="lg">
                <Stack>
                  <Group>
                    <ThemeIcon variant="light">
                      <IconDeviceDesktop size={18} />
                    </ThemeIcon>

                    <Title order={4}>Platform</Title>
                  </Group>

                  <KeyValueTable
                    values={[
                      ['Manufacturer', system?.manufacturer],
                      ['Model', system?.product_name],
                      ['Product version', system?.product_version],
                      ['Serial number', system?.product_serial],
                      ['UUID', system?.product_uuid],
                      [
                        'Mainboard manufacturer',
                        system?.board_manufacturer,
                      ],
                      ['Mainboard', system?.board_name],
                      ['Mainboard version', system?.board_version],
                      ['Mainboard serial', system?.board_serial],
                      ['BIOS vendor', system?.bios_vendor],
                      ['BIOS version', system?.bios_version],
                      ['BIOS date', system?.bios_date],
                    ]}
                  />
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="lg">
                <Stack>
                  <Group>
                    <ThemeIcon variant="light">
                      <IconCpu size={18} />
                    </ThemeIcon>

                    <Title order={4}>Processor</Title>
                  </Group>

                  <KeyValueTable
                    values={[
                      ['Model', cpu?.model_name],
                      ['Vendor', cpu?.vendor],
                      ['Architecture', cpu?.architecture],
                      ['Sockets', cpu?.sockets],
                      ['Physical cores', cpu?.physical_cores],
                      ['Logical CPUs', cpu?.logical_cpus],
                      [
                        'Cores per socket',
                        cpu?.cores_per_socket,
                      ],
                      [
                        'Threads per core',
                        cpu?.threads_per_core,
                      ],
                      ['NUMA nodes', cpu?.numa_nodes],
                      [
                        'Minimum frequency',
                        cpu?.minimum_mhz
                          ? `${cpu.minimum_mhz.toFixed(0)} MHz`
                          : undefined,
                      ],
                      [
                        'Maximum frequency',
                        cpu?.maximum_mhz
                          ? `${cpu.maximum_mhz.toFixed(0)} MHz`
                          : undefined,
                      ],
                      ['Virtualization', cpu?.virtualization],
                    ]}
                  />
                </Stack>
              </Paper>
            </SimpleGrid>

            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Group>
                  <ThemeIcon variant="light">
                    <IconDeviceDesktop size={18} />
                  </ThemeIcon>

                  <Title order={4}>Memory</Title>
                </Group>

                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <Stack>
                    <Group justify="space-between">
                      <Text fw={600}>RAM</Text>
                      <Text size="sm">
                        {memoryUsage.toFixed(1)}%
                      </Text>
                    </Group>

                    <Progress
                      value={memoryUsage}
                      color={getUsageColor(memoryUsage)}
                      size="lg"
                    />

                    <KeyValueTable
                      values={[
                        ['Total', formatBytes(memory?.total)],
                        ['Used', formatBytes(memory?.used)],
                        [
                          'Available',
                          formatBytes(memory?.available),
                        ],
                        ['Free', formatBytes(memory?.free)],
                        ['Buffers', formatBytes(memory?.buffers)],
                        ['Cached', formatBytes(memory?.cached)],
                      ]}
                    />
                  </Stack>

                  <Stack>
                    <Group justify="space-between">
                      <Text fw={600}>Swap</Text>
                      <Text size="sm">
                        {swapUsage.toFixed(1)}%
                      </Text>
                    </Group>

                    <Progress
                      value={swapUsage}
                      color={getUsageColor(swapUsage)}
                      size="lg"
                    />

                    <KeyValueTable
                      values={[
                        [
                          'Swap total',
                          formatBytes(memory?.swap_total),
                        ],
                        [
                          'Swap used',
                          formatBytes(memory?.swap_used),
                        ],
                        [
                          'Swap free',
                          formatBytes(memory?.swap_free),
                        ],
                      ]}
                    />
                  </Stack>
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="storage" pt="lg">
          <Stack gap="lg">
            <Title order={4}>Mounted filesystems</Title>

            {smartDevices.length > 0 &&
              criticalSmartDevices.length === 0 &&
              warningSmartDevices.length === 0 && (
                <Alert
                  color="green"
                  title="SMART health OK"
                >
                  All {smartDevices.length} physical drive
                  {smartDevices.length === 1 ? '' : 's'} report a healthy SMART status.
                </Alert>
              )}

            {criticalSmartDevices.length > 0 && (
              <Alert
                color="red"
                icon={<IconAlertCircle size={18} />}
                title="Critical SMART warning"
              >
                {criticalSmartDevices.length} physical drive
                {criticalSmartDevices.length === 1 ? '' : 's'} report a critical SMART condition.
              </Alert>
            )}

            {warningSmartDevices.length > 0 && (
              <Alert
                color="yellow"
                icon={<IconAlertCircle size={18} />}
                title="SMART warning detected"
              >
                {warningSmartDevices.length} physical drive
                {warningSmartDevices.length === 1 ? '' : 's'} contain SMART attributes that require attention.
              </Alert>
            )}

            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
              {data.storage.filesystems.map((filesystem) => (
                <FilesystemUsage
                  key={`${filesystem.filesystem}-${filesystem.mountpoint}`}
                  filesystem={filesystem}
                />
              ))}
            </SimpleGrid>

            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Title order={4}>Block devices</Title>

                <ScrollArea>
                  <Table
                    striped
                    highlightOnHover
                    withTableBorder
                    miw={1000}
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Device</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Size</Table.Th>
                        <Table.Th>Model</Table.Th>
                        <Table.Th>SMART</Table.Th>
                        <Table.Th>Transport</Table.Th>
                        <Table.Th>Filesystem</Table.Th>
                        <Table.Th>Mountpoints</Table.Th>
                        <Table.Th>State</Table.Th>
                      </Table.Tr>
                    </Table.Thead>

                    <Table.Tbody>
                      {blockDevices.map((device, index) => (
                        <Table.Tr
                          key={`${device.path ?? device.name}-${index}`}
                        >
                          <Table.Td>
                            <Text
                              size="sm"
                              fw={600}
                              pl={device.depth * 18}
                            >
                              {device.depth > 0 ? '↳ ' : ''}
                              {device.path ?? device.name}
                            </Text>
                          </Table.Td>

                          <Table.Td>{device.type ?? '—'}</Table.Td>
                          <Table.Td>
                            {formatBytes(device.size)}
                          </Table.Td>
                          <Table.Td>
                            {[device.vendor, device.model]
                              .filter(Boolean)
                              .join(' ') || '—'}
                          </Table.Td>

                          <Table.Td>
                            {(() => {
                              const smart =
                                smartByPath.get(
                                  device.path ?? '',
                                );

                              if (!smart) {
                                return '—';
                              }

                              return (
                                <Stack gap={3}>
                                  <Badge
                                    variant="light"
                                    color={smartColor(
                                      smart.health,
                                    )}
                                  >
                                    {smartLabel(
                                      smart.health,
                                    )}
                                  </Badge>

                                  {smart.wear_remaining_percent !==
                                    undefined &&
                                    smart.wear_remaining_percent !==
                                      null && (
                                      <Text
                                        size="xs"
                                        c="dimmed"
                                      >
                                        Wear remaining:{' '}
                                        {smart.wear_remaining_percent}%
                                      </Text>
                                    )}

                                  {smart.warnings.length > 0 && (
                                    <Text
                                      size="xs"
                                      c={
                                        smart.health === 'critical'
                                          ? 'red'
                                          : 'yellow'
                                      }
                                    >
                                      {smart.warnings.join(
                                        ' · ',
                                      )}
                                    </Text>
                                  )}
                                </Stack>
                              );
                            })()}
                          </Table.Td>

                          <Table.Td>{device.tran ?? '—'}</Table.Td>
                          <Table.Td>{device.fstype ?? '—'}</Table.Td>
                          <Table.Td>
                            {(device.mountpoints ?? [])
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </Table.Td>
                          <Table.Td>{device.state ?? '—'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="network" pt="lg">
          {network.isLoading ? (
            <Center mih={250}>
              <Loader />
            </Center>
          ) : network.isError || !network.data ? (
            <Alert
              color="red"
              icon={<IconAlertCircle size={18} />}
              title="Network data unavailable"
            >
              The network information for this node could not be
              loaded.
            </Alert>
          ) : (
            <Stack gap="lg">
              <SimpleGrid cols={{ base: 2, md: 4 }}>
                <InfoCard
                  label="Interfaces"
                  value={String(
                    network.data.summary.interface_count,
                  )}
                  icon={<IconNetwork size={18} />}
                />

                <InfoCard
                  label="Physical"
                  value={String(
                    network.data.summary.physical_count,
                  )}
                  icon={<IconNetwork size={18} />}
                />

                <InfoCard
                  label="Bridges"
                  value={String(
                    network.data.summary.bridge_count,
                  )}
                  icon={<IconTopologyStar size={18} />}
                />

                <InfoCard
                  label="VLAN interfaces"
                  value={String(
                    network.data.summary.vlan_count,
                  )}
                  icon={<IconTopologyStar size={18} />}
                />
              </SimpleGrid>

              <Paper withBorder radius="md" p="lg">
                <Stack>
                  <Title order={4}>Interfaces</Title>

                  <ScrollArea>
                    <Table
                      striped
                      highlightOnHover
                      withTableBorder
                      miw={1100}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Type</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Master</Table.Th>
                          <Table.Th>Addresses</Table.Th>
                          <Table.Th>MAC</Table.Th>
                          <Table.Th>Speed</Table.Th>
                          <Table.Th>MTU</Table.Th>
                          <Table.Th>VLANs</Table.Th>
                        </Table.Tr>
                      </Table.Thead>

                      <Table.Tbody>
                        {network.data.interfaces.map(
                          (networkInterface) => (
                            <Table.Tr key={networkInterface.name}>
                              <Table.Td>
                                <Text fw={600}>
                                  {networkInterface.name}
                                </Text>
                              </Table.Td>

                              <Table.Td>
                                {networkInterface.type}
                              </Table.Td>

                              <Table.Td>
                                <Badge
                                  color={
                                    networkInterface.operstate ===
                                      'UP' ||
                                    networkInterface.state === 'UP'
                                      ? 'green'
                                      : 'gray'
                                  }
                                  variant="light"
                                >
                                  {networkInterface.operstate ??
                                    networkInterface.state ??
                                    'Unknown'}
                                </Badge>
                              </Table.Td>

                              <Table.Td>
                                {networkInterface.master ?? '—'}
                              </Table.Td>

                              <Table.Td>
                                {(networkInterface.addresses ?? [])
                                  .map(
                                    (address) =>
                                      `${address.local}/${address.prefixlen}`,
                                  )
                                  .join(', ') || '—'}
                              </Table.Td>

                              <Table.Td>
                                {networkInterface.mac_address ?? '—'}
                              </Table.Td>

                              <Table.Td>
                                {networkInterface.speed
                                  ? `${networkInterface.speed} Mbps`
                                  : '—'}
                              </Table.Td>

                              <Table.Td>
                                {networkInterface.mtu ?? '—'}
                              </Table.Td>

                              <Table.Td>
                                {(networkInterface.bridge_vlans ?? [])
                                  .map(
                                    (vlan) =>
                                      vlan.label ??
                                      (vlan.start === vlan.end
                                        ? String(vlan.start)
                                        : `${vlan.start}-${vlan.end}`),
                                  )
                                  .join(', ') || '—'}
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
          )}
        </Tabs.Panel>

        <Tabs.Panel value="devices" pt="lg">
          <Stack gap="lg">
            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>PCI devices</Title>

                  <Badge variant="light">
                    {data.pci.count} devices
                  </Badge>
                </Group>

                <ScrollArea>
                  <Table
                    striped
                    highlightOnHover
                    withTableBorder
                    miw={900}
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
                      {data.pci.devices.map((device, index) => (
                        <Table.Tr
                          key={`${device.slot}-${index}`}
                        >
                          <Table.Td>{device.slot}</Table.Td>
                          <Table.Td>{device.class}</Table.Td>
                          <Table.Td>{device.device}</Table.Td>
                          <Table.Td>
                            {device.revision ?? '—'}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="lg">
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>USB devices</Title>

                  <Badge variant="light">
                    {data.usb.count} devices
                  </Badge>
                </Group>

                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Bus</Table.Th>
                      <Table.Th>Device</Table.Th>
                      <Table.Th>USB ID</Table.Th>
                      <Table.Th>Description</Table.Th>
                    </Table.Tr>
                  </Table.Thead>

                  <Table.Tbody>
                    {data.usb.devices.map((device, index) => (
                      <Table.Tr
                        key={`${device.bus}-${device.device_number}-${index}`}
                      >
                        <Table.Td>{device.bus}</Table.Td>
                        <Table.Td>
                          {device.device_number}
                        </Table.Td>
                        <Table.Td>{device.usb_id}</Table.Td>
                        <Table.Td>
                          {device.description}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="temperatures" pt="lg">
          {!data.temperatures.available ? (
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={18} />}
              title="No temperature sensors available"
            >
              The host did not return any readable sensor values.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {data.temperatures.sensors.map((sensor, index) => (
                <Card
                  key={`${sensor.chip}-${sensor.source}-${index}`}
                  withBorder
                  radius="md"
                  padding="lg"
                >
                  <Group justify="space-between">
                    <Group>
                      <ThemeIcon
                        size="lg"
                        variant="light"
                        color={getTemperatureColor(
                          sensor.temperature_celsius,
                        )}
                      >
                        <IconTemperature size={20} />
                      </ThemeIcon>

                      <div>
                        <Text fw={700}>{sensor.label}</Text>

                        <Text size="xs" c="dimmed">
                          {sensor.chip}
                        </Text>
                      </div>
                    </Group>

                    <Text
                      fw={700}
                      size="xl"
                      c={getTemperatureColor(
                        sensor.temperature_celsius,
                      )}
                    >
                      {sensor.temperature_celsius?.toFixed(1)} °C
                    </Text>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="zfs" pt="lg">
          {!data.zfs.available ? (
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={18} />}
              title="ZFS is not available"
            >
              No ZFS pools were found on this node.
            </Alert>
          ) : (
            <Stack gap="lg">
              {data.zfs.pools.map((pool) => (
                <Paper
                  key={pool.name}
                  withBorder
                  radius="md"
                  p="lg"
                >
                  <Stack>
                    <Group justify="space-between">
                      <div>
                        <Title order={4}>{pool.name}</Title>

                        <Text size="sm" c="dimmed">
                          {pool.scan ?? 'No scrub information'}
                        </Text>
                      </div>

                      <Badge
                        color={
                          pool.health === 'ONLINE'
                            ? 'green'
                            : 'red'
                        }
                        variant="light"
                        size="lg"
                      >
                        {pool.health ?? pool.state ?? 'Unknown'}
                      </Badge>
                    </Group>

                    <Progress
                      value={pool.capacity_percent ?? 0}
                      color={getUsageColor(
                        pool.capacity_percent ?? 0,
                      )}
                      size="lg"
                    />

                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                      <InfoCard
                        label="Pool size"
                        value={formatBytes(pool.size)}
                        icon={<IconDatabase size={18} />}
                      />

                      <InfoCard
                        label="Allocated"
                        value={formatBytes(pool.allocated)}
                        icon={<IconDatabase size={18} />}
                      />

                      <InfoCard
                        label="Free"
                        value={formatBytes(pool.free)}
                        icon={<IconDatabase size={18} />}
                      />

                      <InfoCard
                        label="Fragmentation"
                        value={`${pool.fragmentation_percent ?? 0}%`}
                        icon={<IconGauge size={18} />}
                      />
                    </SimpleGrid>

                    {pool.errors &&
                      pool.errors !== 'No known data errors' && (
                        <Alert
                          color="red"
                          icon={<IconAlertCircle size={18} />}
                          title="ZFS errors"
                        >
                          {pool.errors}
                        </Alert>
                      )}
                  </Stack>
                </Paper>
              ))}

              <Paper withBorder radius="md" p="lg">
                <Stack>
                  <Title order={4}>Datasets and volumes</Title>

                  <ScrollArea>
                    <Table
                      striped
                      highlightOnHover
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
                        {data.zfs.datasets.map((dataset) => (
                          <Table.Tr key={dataset.name}>
                            <Table.Td>
                              <Text fw={600}>
                                {dataset.name}
                              </Text>
                            </Table.Td>
                            <Table.Td>{dataset.type}</Table.Td>
                            <Table.Td>
                              {formatBytes(dataset.used)}
                            </Table.Td>
                            <Table.Td>
                              {formatBytes(dataset.available)}
                            </Table.Td>
                            <Table.Td>
                              {formatBytes(dataset.referenced)}
                            </Table.Td>
                            <Table.Td>
                              {dataset.mountpoint}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>
              </Paper>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="software" pt="lg">
          <Paper withBorder radius="md" p="lg">
            <Stack>
              <Group justify="space-between">
                <Title order={4}>Proxmox packages</Title>

                <Badge variant="light">
                  {data.software.pve_packages_raw.length} packages
                </Badge>
              </Group>

              <ScrollArea h={600}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Package</Table.Th>
                      <Table.Th>Version</Table.Th>
                    </Table.Tr>
                  </Table.Thead>

                  <Table.Tbody>
                    {data.software.pve_packages_raw.map(
                      (packageLine) => {
                        const separator =
                          packageLine.indexOf(':');

                        const packageName =
                          separator >= 0
                            ? packageLine.slice(0, separator)
                            : packageLine;

                        const packageVersion =
                          separator >= 0
                            ? packageLine
                                .slice(separator + 1)
                                .trim()
                            : '';

                        return (
                          <Table.Tr key={packageLine}>
                            <Table.Td>
                              <Text fw={600}>
                                {packageName}
                              </Text>
                            </Table.Td>

                            <Table.Td>
                              {packageVersion}
                            </Table.Td>
                          </Table.Tr>
                        );
                      },
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
