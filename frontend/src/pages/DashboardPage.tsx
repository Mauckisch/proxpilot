import { useState } from 'react';

import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCpu,
  IconRefresh,
  IconServer,
  IconTool,
} from '@tabler/icons-react';

import { NodeActionModal } from '../components/NodeActionModal';
import { NodeCard } from '../components/NodeCard';
import {
  useDashboard,
  type ClusterNode,
} from '../hooks/useDashboard';
import { useNodeActions } from '../hooks/useNodeActions';
import { sortNodes } from '../utils/sort';

type DashboardPageProps = {
  onOpenNode: (node: ClusterNode) => void;
};

export function DashboardPage({
  onOpenNode,
}: DashboardPageProps) {
  const dashboard = useDashboard();

  const [
    selectedInfrastructureId,
    setSelectedInfrastructureId,
  ] = useState<number | null>(() => {
    const stored = localStorage.getItem(
      'proxpilot-dashboard-infrastructure',
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

  const nodeActions = useNodeActions(async () => {
    await dashboard.refetch();
  });

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="sm">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading Proxmox cluster...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'The dashboard data could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Proxmox API unavailable"
      >
        {message}
      </Alert>
    );
  }

  const allNodes = sortNodes(
    dashboard.data?.nodes ?? [],
  );

  const allGuests =
    dashboard.data?.guests ?? [];

  const infrastructures = Array.from(
    allNodes.reduce(
      (
        result,
        node,
      ) => {
        const existing = result.get(
          node.infrastructure_id,
        );

        const online =
          node.status?.toLowerCase() ===
          'online';

        if (existing) {
          existing.totalNodes += 1;

          if (online) {
            existing.onlineNodes += 1;
          }

          return result;
        }

        result.set(
          node.infrastructure_id,
          {
            id:
              node.infrastructure_id,
            name:
              node.infrastructure_name,
            type:
              node.infrastructure_type,
            totalNodes: 1,
            onlineNodes:
              online ? 1 : 0,
          },
        );

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
          totalNodes: number;
          onlineNodes: number;
        }
      >(),
    ).values(),
  ).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const effectiveInfrastructureId =
    infrastructures.some(
      (item) =>
        item.id ===
        selectedInfrastructureId,
    )
      ? selectedInfrastructureId
      : infrastructures[0]?.id ??
        null;

  const selectedInfrastructure =
    infrastructures.find(
      (item) =>
        item.id ===
        effectiveInfrastructureId,
    ) ?? null;

  const nodes =
    effectiveInfrastructureId === null
      ? []
      : allNodes.filter(
          (node) =>
            node.infrastructure_id ===
            effectiveInfrastructureId,
        );

  const guests =
    effectiveInfrastructureId === null
      ? []
      : allGuests.filter(
          (guest) =>
            guest.infrastructure_id ===
            effectiveInfrastructureId,
        );

  const infrastructureOptions =
    infrastructures.map(
      (infrastructure) => {
        const health =
          infrastructure.onlineNodes ===
          infrastructure.totalNodes
            ? 'online'
            : infrastructure.onlineNodes === 0
              ? 'disconnected'
              : 'partial';

        const statusLabel =
          health === 'online'
            ? 'Online'
            : health === 'partial'
              ? 'Partially disconnected'
              : 'Disconnected';

        return {
          value: String(
            infrastructure.id,
          ),
          label: `${
            infrastructure.name
          } · ${
            infrastructure.type ===
            'cluster'
              ? 'Cluster'
              : 'Standalone'
          } · ${statusLabel}`,
          health,
        };
      },
    );

  const onlineNodes = nodes.filter(
    (node) =>
      node.status?.toLowerCase() === 'online',
  ).length;

  const runningGuests = guests.filter(
    (guest) =>
      guest.status?.toLowerCase() === 'running',
  ).length;

  const maintenanceNodes = nodes.filter(
    (node) => node.maintenance,
  ).length;

  const rebootHasUnmanagedRunningGuests =
    nodeActions.confirmState?.kind === 'node' &&
    nodeActions.confirmState.action === 'reboot'
      ? guests.some(
          (guest) =>
            guest.node ===
              nodeActions.confirmState?.node.node &&
            guest.status?.toLowerCase() ===
              'running' &&
            !String(
              guest.hastate ?? '',
            ).trim(),
        )
      : false;

  return (
    <>
      <Stack gap="xl">
        <Group
          justify="space-between"
          align="flex-end"
        >
          <div>
            <Title order={2}>
              {selectedInfrastructure?.type ===
              'standalone'
                ? 'Standalone overview'
                : 'Cluster overview'}
            </Title>

            <Text c="dimmed" mt={4}>
              {selectedInfrastructure
                ? `Live status for ${selectedInfrastructure.name}`
                : 'Live status of your Proxmox infrastructure'}
            </Text>
          </div>

          <Group gap="xs" align="flex-end">
            <Select
              label="Infrastructure"
              data={infrastructureOptions}
              renderOption={({ option }) => {
                const infrastructure =
                  infrastructureOptions.find(
                    (item) =>
                      item.value ===
                      option.value,
                  );

                const color =
                  infrastructure?.health ===
                  'online'
                    ? 'green'
                    : infrastructure?.health ===
                        'partial'
                      ? 'yellow'
                      : 'red';

                return (
                  <Group
                    gap="xs"
                    wrap="nowrap"
                  >
                    <Text
                      c={color}
                      fw={600}
                      size="sm"
                    >
                      ●
                    </Text>

                    <Text size="sm">
                      {option.label}
                    </Text>
                  </Group>
                );
              }}
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

                localStorage.setItem(
                  'proxpilot-dashboard-infrastructure',
                  String(id),
                );
              }}
              allowDeselect={false}
              w={300}
            />

            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
            loading={dashboard.isFetching}
            onClick={() => dashboard.refetch()}
          >
            Refresh
          </Button>
          </Group>
        </Group>

        <SimpleGrid
          cols={{
            base: 1,
            sm: 2,
            lg: 4,
          }}
        >
          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Nodes online
                </Text>

                <Text size="xl" fw={700}>
                  {onlineNodes} / {nodes.length}
                </Text>
              </div>

              <IconServer size={30} />
            </Group>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Guests
                </Text>

                <Text size="xl" fw={700}>
                  {guests.length}
                </Text>
              </div>

              <IconCpu size={30} />
            </Group>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Guests running
                </Text>

                <Text size="xl" fw={700}>
                  {runningGuests}
                </Text>
              </div>

              <IconCpu size={30} />
            </Group>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Maintenance
                </Text>

                <Text size="xl" fw={700}>
                  {maintenanceNodes}
                </Text>
              </div>

              <IconTool size={30} />
            </Group>
          </Card>
        </SimpleGrid>

        <div>
          <Title order={3} mb="md">
            {selectedInfrastructure?.type ===
            'standalone'
              ? 'Standalone host'
              : 'Cluster nodes'}
          </Title>

          {nodes.length === 0 ? (
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={20} />}
              title="No nodes found"
            >
              The backend returned no Proxmox nodes.
            </Alert>
          ) : (
            <SimpleGrid
              cols={{
                base: 1,
                md: 2,
                xl: 3,
              }}
            >
              {nodes.map((node) => (
                <NodeCard
                  readonly
                  key={
                    `${node.infrastructure_id}:` +
                    node.node
                  }
                  node={node}
                  actionRunning={
                    nodeActions.actionRunning
                  }
                  onMaintenanceAction={
                    nodeActions.requestMaintenanceAction
                  }
                  onNodeAction={
                    nodeActions.requestNodeAction
                  }
                  onOpenDetails={onOpenNode}
                />
              ))}
            </SimpleGrid>
          )}
        </div>
      </Stack>

      <NodeActionModal
        confirmState={nodeActions.confirmState}
        actionRunning={nodeActions.actionRunning}
        hasUnmanagedRunningGuests={
          rebootHasUnmanagedRunningGuests
        }
        onClose={nodeActions.closeConfirmation}
        onConfirm={nodeActions.confirmAction}
      />
    </>
  );
}
