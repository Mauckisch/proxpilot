import { useMemo } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCircleCheck,
  IconRefresh,
  IconServer,
  IconShieldCheck,
  IconUsersGroup,
} from '@tabler/icons-react';

import { HaResourceCard } from '../components/HaResourceCard';
import {
  type Guest,
  type HaStatusEntry,
  useDashboard,
} from '../hooks/useDashboard';

function formatTimestamp(
  timestamp?: number,
): string {
  if (!timestamp) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp * 1000));
}

function statusIncludes(
  item: HaStatusEntry | undefined,
  value: string,
): boolean {
  return item?.status
    ?.toLowerCase()
    .includes(value.toLowerCase()) ?? false;
}

export function ClusterPage() {
  const dashboard = useDashboard();

  const nodes = dashboard.data?.nodes ?? [];
  const guests = dashboard.data?.guests ?? [];
  const ha = dashboard.data?.ha ?? [];

  const quorum = ha.find(
    (item) => item.type === 'quorum',
  );

  const master = ha.find(
    (item) => item.type === 'master',
  );

  const fencing = ha.find(
    (item) => item.type === 'fencing',
  );

  const lrmEntries = ha.filter(
    (item) => item.type === 'lrm',
  );

  const services = ha.filter(
    (item) => item.type === 'service',
  );

  const onlineNodes = nodes.filter(
    (node) =>
      node.status?.toLowerCase() === 'online',
  ).length;

  const healthyLrmEntries = lrmEntries.filter(
    (item) => statusIncludes(item, 'active'),
  ).length;

  const guestByVmid = useMemo(() => {
    const map = new Map<number, Guest>();

    for (const guest of guests) {
      map.set(guest.vmid, guest);
    }

    return map;
  }, [guests]);

  const servicesByNode = useMemo(() => {
    const map = new Map<string, number>();

    for (const service of services) {
      if (!service.node) {
        continue;
      }

      map.set(
        service.node,
        (map.get(service.node) ?? 0) + 1,
      );
    }

    return map;
  }, [services]);

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading cluster and HA status...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'The cluster status could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load cluster status"
      >
        {message}
      </Alert>
    );
  }

  const quorate = quorum?.quorate === 1;

  const fencingArmed =
    fencing?.['armed-state'] === 'armed';

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Cluster</Title>

          <Text c="dimmed" mt={4}>
            Proxmox cluster, quorum and high-availability status
          </Text>
        </div>

        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={dashboard.isFetching}
          onClick={() => dashboard.refetch()}
        >
          Refresh
        </Button>
      </Group>

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
              <Text fw={700}>Quorum</Text>

              <IconUsersGroup size={22} />
            </Group>

            <Badge
              size="lg"
              color={quorate ? 'green' : 'red'}
              variant="light"
            >
              {quorate ? 'Quorate' : 'No quorum'}
            </Badge>

            <Text size="sm" c="dimmed">
              {quorum?.status ?? 'No quorum information'}
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>HA master</Text>

              <IconShieldCheck size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {master?.node ?? 'Unknown'}
            </Text>

            <Text size="sm" c="dimmed">
              {master?.timestamp
                ? `Last update: ${formatTimestamp(
                    master.timestamp,
                  )}`
                : master?.status ?? 'No master information'}
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>Fencing</Text>

              <IconCircleCheck size={22} />
            </Group>

            <Badge
              size="lg"
              color={fencingArmed ? 'green' : 'red'}
              variant="light"
            >
              {fencingArmed ? 'Armed' : 'Not armed'}
            </Badge>

            <Text size="sm" c="dimmed">
              {fencing?.status ??
                'No fencing information'}
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>HA resources</Text>

              <IconServer size={22} />
            </Group>

            <Text size="xl" fw={700}>
              {services.length}
            </Text>

            <Text size="sm" c="dimmed">
              {services.filter(
                (item) =>
                  item.crm_state === 'started',
              ).length}{' '}
              currently started
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {!quorate && (
        <Alert
          color="red"
          icon={<IconAlertCircle size={20} />}
          title="Cluster has no quorum"
        >
          HA operations and cluster configuration changes may
          be restricted until quorum is restored.
        </Alert>
      )}

      <div>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>Cluster nodes</Title>

            <Text size="sm" c="dimmed">
              {onlineNodes} of {nodes.length} nodes online ·{' '}
              {healthyLrmEntries} of {lrmEntries.length} LRM
              services active
            </Text>
          </div>
        </Group>

        <SimpleGrid
          cols={{
            base: 1,
            md: 2,
            xl: 3,
          }}
        >
          {nodes.map((node) => {
            const lrm = lrmEntries.find(
              (entry) => entry.node === node.node,
            );

            const online =
              node.status?.toLowerCase() === 'online';

            const lrmActive =
              statusIncludes(lrm, 'active');

            const watchdogActive =
              statusIncludes(lrm, 'watchdog active');

            return (
              <Card
                key={node.node}
                withBorder
                radius="md"
                padding="lg"
              >
                <Stack gap="md">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <IconServer size={22} />

                      <Text fw={700} size="lg">
                        {node.node}
                      </Text>
                    </Group>

                    <Badge
                      color={online ? 'green' : 'red'}
                      variant="light"
                    >
                      {node.status ?? 'Unknown'}
                    </Badge>
                  </Group>

                  <Group gap="xs">
                    <Badge
                      color={lrmActive ? 'green' : 'red'}
                      variant="light"
                    >
                      LRM {lrmActive ? 'active' : 'inactive'}
                    </Badge>

                    <Badge
                      color={
                        watchdogActive
                          ? 'green'
                          : 'orange'
                      }
                      variant="light"
                    >
                      Watchdog{' '}
                      {watchdogActive
                        ? 'active'
                        : 'unknown'}
                    </Badge>

                    {master?.node === node.node && (
                      <Badge
                        color="blue"
                        variant="filled"
                      >
                        HA master
                      </Badge>
                    )}

                    {node.maintenance && (
                      <Badge
                        color="orange"
                        variant="filled"
                      >
                        Maintenance
                      </Badge>
                    )}
                  </Group>

                  <SimpleGrid cols={2}>
                    <div>
                      <Text size="xs" c="dimmed">
                        HA resources
                      </Text>

                      <Text fw={700}>
                        {servicesByNode.get(node.node) ?? 0}
                      </Text>
                    </div>

                    <div>
                      <Text size="xs" c="dimmed">
                        LRM update
                      </Text>

                      <Text fw={600} size="sm">
                        {formatTimestamp(lrm?.timestamp)}
                      </Text>
                    </div>
                  </SimpleGrid>

                  {lrm?.status && (
                    <Text size="xs" c="dimmed">
                      {lrm.status}
                    </Text>
                  )}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </div>

      <div>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>HA resources</Title>

            <Text size="sm" c="dimmed">
              Virtual machines currently managed by Proxmox HA
            </Text>
          </div>

          <Badge
            color="blue"
            variant="light"
            size="lg"
          >
            {services.length} resources
          </Badge>
        </Group>

        {services.length === 0 ? (
          <Alert
            color="blue"
            icon={<IconAlertCircle size={20} />}
            title="No HA resources"
          >
            No virtual machines or containers are currently
            managed by Proxmox HA.
          </Alert>
        ) : (
          <SimpleGrid
            cols={{
              base: 1,
              md: 2,
              xl: 3,
            }}
          >
            {services.map((service) => {
              const vmid = Number(
                service.sid?.match(
                  /(?:vm|ct):(\d+)/,
                )?.[1],
              );

              return (
                <HaResourceCard
                  key={service.id ?? service.sid}
                  resource={service}
                  guest={
                    Number.isFinite(vmid)
                      ? guestByVmid.get(vmid)
                      : undefined
                  }
                />
              );
            })}
          </SimpleGrid>
        )}
      </div>
    </Stack>
  );
}
