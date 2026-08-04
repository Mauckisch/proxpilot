import {
  Alert,
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

  const nodes = sortNodes(
    dashboard.data?.nodes ?? [],
  );

  const guests = dashboard.data?.guests ?? [];

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

  return (
    <>
      <Stack gap="xl">
        <Group
          justify="space-between"
          align="flex-end"
        >
          <div>
            <Title order={2}>
              Cluster overview
            </Title>

            <Text c="dimmed" mt={4}>
              Live status and node controls for your
              Proxmox cluster
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
            Cluster nodes
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
                  key={node.node}
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
        onClose={nodeActions.closeConfirmation}
        onConfirm={nodeActions.confirmAction}
      />
    </>
  );
}
