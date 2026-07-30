import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';

import { api } from '../api';
import {
  NodeCard,
  type MaintenanceAction,
  type NodeAction,
} from '../components/NodeCard';
import { NodeUpdatesModal } from '../components/NodeUpdatesModal';
import {
  type ClusterNode,
  useDashboard,
} from '../hooks/useDashboard';
import { useUpdates } from '../hooks/useUpdates';

type ConfirmState =
  | {
      kind: 'maintenance';
      node: ClusterNode;
      action: MaintenanceAction;
    }
  | {
      kind: 'node';
      node: ClusterNode;
      action: NodeAction;
    }
  | null;

function getActionTitle(action: NodeAction): string {
  switch (action) {
    case 'check-updates':
      return 'Check updates';

    case 'install-updates':
      return 'Install updates';

    case 'package-cleanup':
      return 'Run cleanup';

    case 'reboot':
      return 'Reboot node';

    case 'shutdown':
      return 'Shutdown node';
  }
}

function getActionText(
  action: NodeAction,
  node: ClusterNode,
): string {
  switch (action) {
    case 'check-updates':
      return `Check available package updates on ${node.node}?`;

    case 'install-updates':
      return `Install all available package updates on ${node.node}? No automatic reboot will be performed.`;

    case 'package-cleanup':
      return `Remove unused packages and clean the package cache on ${node.node}?`;

    case 'reboot':
      return `Reboot ${node.node}? Running guests will not be migrated automatically.`;

    case 'shutdown':
      return node.maintenance
        ? `Shutdown ${node.node}?`
        : `Shutdown ${node.node} although maintenance mode is not enabled? Running guests will not be migrated automatically.`;
  }
}

function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ??
      response?.data?.message ??
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

type NodesPageProps = {
  onOpenNode: (node: ClusterNode) => void;
};

export function NodesPage({
  onOpenNode,
}: NodesPageProps) {
  const dashboard = useDashboard();
  const updates = useUpdates();

  const [selectedUpdateNode, setSelectedUpdateNode] =
    useState<ClusterNode | null>(null);

  const [confirmState, setConfirmState] =
    useState<ConfirmState>(null);

  const [actionRunning, setActionRunning] =
    useState(false);

  async function runMaintenanceAction(
    node: ClusterNode,
    action: MaintenanceAction,
  ) {
    setActionRunning(true);

    try {
      const response = await api.post(
        '/node/maintenance',
        {
          node: node.node,
          action,
        },
      );

      notifications.show({
        title:
          action === 'enable'
            ? 'Maintenance enabled'
            : 'Maintenance disabled',
        message:
          response.data?.message ??
          `Maintenance action completed for ${node.node}.`,
        color: 'green',
      });

      await dashboard.refetch();
    } catch (error) {
      notifications.show({
        title: 'Maintenance action failed',
        message: getApiErrorMessage(
          error,
          'The maintenance action could not be completed.',
        ),
        color: 'red',
      });
    } finally {
      setActionRunning(false);
      setConfirmState(null);
    }
  }

  async function runNodeAction(
    node: ClusterNode,
    action: NodeAction,
  ) {
    setActionRunning(true);

    try {
      const response = await api.post(
        '/node/action',
        {
          node: node.node,
          action,
          confirmed: action !== 'check-updates',
          acknowledge_no_maintenance:
            action === 'shutdown' &&
            !node.maintenance,
        },
      );

      notifications.show({
        title: 'Task started',
        message:
          response.data?.task?.title ??
          response.data?.message ??
          `${getActionTitle(action)} started on ${node.node}.`,
        color: 'blue',
      });

      await dashboard.refetch();
    } catch (error) {
      notifications.show({
        title: 'Node action failed',
        message: getApiErrorMessage(
          error,
          'The node action could not be started.',
        ),
        color: 'red',
      });
    } finally {
      setActionRunning(false);
      setConfirmState(null);
    }
  }

  async function confirmAction() {
    if (!confirmState) {
      return;
    }

    if (confirmState.kind === 'maintenance') {
      await runMaintenanceAction(
        confirmState.node,
        confirmState.action,
      );

      return;
    }

    await runNodeAction(
      confirmState.node,
      confirmState.action,
    );
  }

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="sm">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading Proxmox nodes...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'The node data could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load nodes"
      >
        {message}
      </Alert>
    );
  }

  const nodes = dashboard.data?.nodes ?? [];

  const onlineNodes = nodes.filter(
    (node) =>
      node.status?.toLowerCase() === 'online',
  ).length;

  const maintenanceNodes = nodes.filter(
    (node) => node.maintenance,
  ).length;

  const modalTitle =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? `Enable maintenance on ${confirmState.node.node}`
        : `Disable maintenance on ${confirmState.node.node}`
      : confirmState
        ? `${getActionTitle(confirmState.action)}: ${confirmState.node.node}`
        : '';

  const modalText =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? 'Enable HA maintenance mode? HA-managed guests may be migrated.'
        : 'Disable HA maintenance mode and return the node to normal operation?'
      : confirmState
        ? getActionText(
            confirmState.action,
            confirmState.node,
          )
        : '';

  const destructive =
    confirmState?.kind === 'node' &&
    ['reboot', 'shutdown'].includes(
      confirmState.action,
    );

  return (
    <>
      <Stack gap="xl">
        <Group
          justify="space-between"
          align="flex-end"
        >
          <div>
            <Title order={2}>Nodes</Title>

            <Text c="dimmed" mt={4}>
              Health, resource usage and controls for all
              Proxmox nodes
            </Text>
          </div>

          <Group gap="xs">
            <Badge
              color={
                onlineNodes === nodes.length
                  ? 'green'
                  : 'red'
              }
              variant="light"
              size="lg"
            >
              {onlineNodes} of {nodes.length} online
            </Badge>

            {maintenanceNodes > 0 && (
              <Badge
                color="yellow"
                variant="light"
                size="lg"
              >
                {maintenanceNodes} in maintenance
              </Badge>
            )}

            <Button
              variant="light"
              leftSection={
                <IconRefresh size={16} />
              }
              loading={dashboard.isFetching}
              onClick={() => dashboard.refetch()}
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {nodes.length === 0 ? (
          <Alert
            color="yellow"
            icon={<IconAlertCircle size={20} />}
            title="No nodes found"
          >
            The Proxmox API returned no cluster nodes.
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
                key={node.node}
                node={node}
                updateStatus={updates.data?.find(
                  (status) => status.node === node.node,
                )}
                actionRunning={actionRunning}
                onOpenDetails={onOpenNode}
                onOpenUpdates={(selectedNode) =>
                  setSelectedUpdateNode(selectedNode)
                }
                onMaintenanceAction={(
                  selectedNode,
                  action,
                ) =>
                  setConfirmState({
                    kind: 'maintenance',
                    node: selectedNode,
                    action,
                  })
                }
                onNodeAction={(
                  selectedNode,
                  action,
                ) =>
                  setConfirmState({
                    kind: 'node',
                    node: selectedNode,
                    action,
                  })
                }
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <NodeUpdatesModal
        node={selectedUpdateNode}
        status={updates.data?.find(
          (status) =>
            status.node === selectedUpdateNode?.node,
        )}
        opened={selectedUpdateNode !== null}
        actionRunning={actionRunning}
        onClose={() => {
          if (!actionRunning) {
            setSelectedUpdateNode(null);
          }
        }}
        onCheckUpdates={(node) => {
          setSelectedUpdateNode(null);
          setConfirmState({
            kind: 'node',
            node,
            action: 'check-updates',
          });
        }}
        onInstallUpdates={(node) => {
          setSelectedUpdateNode(null);
          setConfirmState({
            kind: 'node',
            node,
            action: 'install-updates',
          });
        }}
      />

      <Modal
        opened={confirmState !== null}
        onClose={() => {
          if (!actionRunning) {
            setConfirmState(null);
          }
        }}
        title={modalTitle}
        centered
        closeOnClickOutside={!actionRunning}
        closeOnEscape={!actionRunning}
      >
        <Stack>
          <Text>{modalText}</Text>

          {confirmState?.kind === 'node' &&
            confirmState.action === 'shutdown' &&
            !confirmState.node.maintenance && (
              <Alert
                color="red"
                icon={<IconAlertCircle size={18} />}
                title="Maintenance mode is not enabled"
              >
                The host will be shut down without
                automatically migrating running guests.
              </Alert>
            )}

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={actionRunning}
              onClick={() =>
                setConfirmState(null)
              }
            >
              Cancel
            </Button>

            <Button
              color={
                destructive ? 'red' : 'blue'
              }
              loading={actionRunning}
              onClick={confirmAction}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
