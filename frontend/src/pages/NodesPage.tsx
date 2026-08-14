import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
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
import { ClusterSummary } from '../components/ClusterSummary';
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
import { sortNodes } from '../utils/sort';

type BatchAction =
  | 'check-updates'
  | 'install-updates'
  | 'package-cleanup';


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
  hasUnmanagedRunningGuests = false,
): string {
  switch (action) {
    case 'check-updates':
      return `Check available package updates on ${node.node}?`;

    case 'install-updates':
      return `Install all available package updates on ${node.node}? No automatic reboot will be performed.`;

    case 'package-cleanup':
      return `Remove unused packages and clean the package cache on ${node.node}?`;

    case 'reboot':
      return (
        node.infrastructure_type === 'cluster' &&
        !node.maintenance &&
        hasUnmanagedRunningGuests
      )
        ? `Reboot ${node.node}? Running guests that are not managed by HA will not be migrated automatically.`
        : `Reboot ${node.node}?`;

    case 'shutdown':
      return (
        node.infrastructure_type === 'standalone' ||
        node.maintenance
      )
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

  const [
    selectedInfrastructureId,
    setSelectedInfrastructureId,
  ] = useState<number | null>(() => {
    const stored = localStorage.getItem(
      'proxpilot-nodes-infrastructure',
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

  const [selectedUpdateNode, setSelectedUpdateNode] =
    useState<ClusterNode | null>(null);

  const [confirmState, setConfirmState] =
    useState<ConfirmState>(null);

  const [actionRunning, setActionRunning] =
    useState(false);

  const [
    batchConfirmAction,
    setBatchConfirmAction,
  ] = useState<BatchAction | null>(null);

  const [
    batchStarting,
    setBatchStarting,
  ] = useState(false);

  async function runMaintenanceAction(
    node: ClusterNode,
    action: MaintenanceAction,
  ) {
    setActionRunning(true);

    try {
      const response = await api.post(
        '/node/maintenance',
        {
          infrastructure_id:
            node.infrastructure_id,
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
          infrastructure_id:
            node.infrastructure_id,
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

  async function runBatchAction(
    action: BatchAction,
  ) {
    if (
      !selectedInfrastructure ||
      selectedNodes.length === 0
    ) {
      return;
    }

    setBatchStarting(true);

    try {
      const response = await api.post(
        '/node/batch-action',
        {
          infrastructure_id:
            selectedInfrastructure.id,
          nodes: selectedNodes.map(
            (node) => node.node,
          ),
          action,
          confirmed:
            action !== 'check-updates',
        },
      );

      notifications.show({
        title: 'Batch task started',
        message:
          response.data?.task?.title ??
          `${selectedNodes.length} nodes queued.`,
        color: 'blue',
      });

      await dashboard.refetch();
    } catch (error) {
      notifications.show({
        title: 'Batch task failed to start',
        message: getApiErrorMessage(
          error,
          'The batch task could not be started.',
        ),
        color: 'red',
      });
    } finally {
      setBatchStarting(false);
      setBatchConfirmAction(null);
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

  const nodes = sortNodes(
    dashboard.data?.nodes ?? [],
  );

  const infrastructureGroups = Array.from(
    nodes.reduce(
      (
        groups,
        node,
      ) => {
        const existing = groups.get(
          node.infrastructure_id,
        );

        if (existing) {
          existing.nodes.push(node);
          return groups;
        }

        groups.set(
          node.infrastructure_id,
          {
            id: node.infrastructure_id,
            name:
              node.infrastructure_name,
            type:
              node.infrastructure_type,
            nodes: [node],
          },
        );

        return groups;
      },
      new Map<
        number,
        {
          id: number;
          name: string;
          type:
            | 'cluster'
            | 'standalone';
          nodes: ClusterNode[];
        }
      >(),
    ).values(),
  ).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const effectiveInfrastructureId =
    infrastructureGroups.some(
      (item) =>
        item.id ===
        selectedInfrastructureId,
    )
      ? selectedInfrastructureId
      : infrastructureGroups[0]?.id ??
        null;

  const selectedInfrastructure =
    infrastructureGroups.find(
      (item) =>
        item.id ===
        effectiveInfrastructureId,
    ) ?? null;

  const selectedNodes =
    selectedInfrastructure?.nodes ?? [];

  const onlineNodes =
    selectedNodes.filter(
      (node) =>
        node.status?.toLowerCase() ===
        'online',
    ).length;

  const maintenanceNodes =
    selectedNodes.filter(
      (node) => node.maintenance,
    ).length;

  const infrastructureOptions =
    infrastructureGroups.map(
      (infrastructure) => {
        const onlineNodes =
          infrastructure.nodes.filter(
            (node) =>
              node.status?.toLowerCase() ===
              'online',
          ).length;

        const totalNodes =
          infrastructure.nodes.length;

        const health =
          onlineNodes === totalNodes
            ? 'online'
            : onlineNodes === 0
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

  const selectedDashboard =
    dashboard.data &&
    effectiveInfrastructureId !== null
      ? {
          ...dashboard.data,
          nodes:
            dashboard.data.nodes.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          guests:
            dashboard.data.guests.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          storages:
            dashboard.data.storages.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          replications:
            dashboard.data.replications.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          backup_jobs:
            dashboard.data.backup_jobs.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          backup_tasks:
            dashboard.data.backup_tasks.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          ha:
            dashboard.data.ha.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
          infrastructure_errors:
            dashboard.data.infrastructure_errors.filter(
              (item) =>
                item.infrastructure_id ===
                effectiveInfrastructureId,
            ),
        }
      : null;

  const modalTitle =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? `Enable maintenance on ${confirmState.node.node}`
        : `Disable maintenance on ${confirmState.node.node}`
      : confirmState
        ? `${getActionTitle(confirmState.action)}: ${confirmState.node.node}`
        : '';

  const rebootHasUnmanagedRunningGuests =
    confirmState?.kind === 'node' &&
    confirmState.action === 'reboot'
      ? (
          dashboard.data?.guests.some(
            (guest) =>
              guest.infrastructure_id ===
                confirmState.node.infrastructure_id &&
              guest.node === confirmState.node.node &&
              guest.status?.toLowerCase() === 'running' &&
              !String(
                guest.hastate ?? '',
              ).trim(),
          ) ?? false
        )
      : false;

  const modalText =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? 'Enable HA maintenance mode? HA-managed guests may be migrated.'
        : 'Disable HA maintenance mode and return the node to normal operation?'
      : confirmState
        ? getActionText(
            confirmState.action,
            confirmState.node,
            rebootHasUnmanagedRunningGuests,
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
                  'proxpilot-nodes-infrastructure',
                  String(id),
                );
              }}
              allowDeselect={false}
              w={300}
            />

            <Badge
              color={
                selectedNodes.length > 0 &&
                onlineNodes ===
                  selectedNodes.length
                  ? 'green'
                  : 'red'
              }
              variant="light"
              size="lg"
            >
              {onlineNodes} of{' '}
              {selectedNodes.length} online
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

        {selectedDashboard && (
          <ClusterSummary
            data={selectedDashboard}
            updates={
              updates.data?.filter(
                (status) =>
                  status.infrastructure_id ===
                  effectiveInfrastructureId,
              )
            }
          />
        )}

        {nodes.length === 0 ? (
          <Alert
            color="yellow"
            icon={<IconAlertCircle size={20} />}
            title="No nodes found"
          >
            No Proxmox nodes were returned by the
            configured infrastructures.
          </Alert>
        ) : selectedInfrastructure ? (
          <Stack gap="md">
            <Group
              justify="space-between"
              align="center"
            >
              <div>
                <Group gap="sm">
                  <Title order={4}>
                    {selectedInfrastructure.name}
                  </Title>

                  <Badge
                    variant="light"
                    color={
                      selectedInfrastructure.type ===
                      'cluster'
                        ? 'blue'
                        : 'grape'
                    }
                  >
                    {selectedInfrastructure.type ===
                    'cluster'
                      ? 'Cluster'
                      : 'Standalone'}
                  </Badge>
                </Group>

                <Text
                  size="sm"
                  c="dimmed"
                  mt={3}
                >
                  {selectedNodes.length}{' '}
                  {selectedNodes.length === 1
                    ? 'node'
                    : 'nodes'}
                  {' · '}
                  {onlineNodes} online
                </Text>
              </div>

              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  disabled={
                    selectedNodes.length === 0 ||
                    batchStarting
                  }
                  onClick={() =>
                    setBatchConfirmAction(
                      'check-updates',
                    )
                  }
                >
                  Check all updates
                </Button>

                <Button
                  size="xs"
                  variant="light"
                  disabled={
                    selectedNodes.length === 0 ||
                    batchStarting
                  }
                  onClick={() =>
                    setBatchConfirmAction(
                      'install-updates',
                    )
                  }
                >
                  Install all updates
                </Button>

                <Button
                  size="xs"
                  variant="light"
                  disabled={
                    selectedNodes.length === 0 ||
                    batchStarting
                  }
                  onClick={() =>
                    setBatchConfirmAction(
                      'package-cleanup',
                    )
                  }
                >
                  Cleanup all
                </Button>
              </Group>
            </Group>

            <SimpleGrid
              cols={{
                base: 1,
                md: 2,
                xl: 3,
              }}
            >
              {selectedNodes.map(
                (node) => (
                  <NodeCard
                    key={
                      `${node.infrastructure_id}:` +
                      node.node
                    }
                    node={node}
                    updateStatus={
                      updates.data?.find(
                        (status) =>
                          status.node ===
                            node.node &&
                          status.infrastructure_id ===
                            node.infrastructure_id,
                      )
                    }
                    actionRunning={
                      actionRunning
                    }
                    onOpenDetails={
                      onOpenNode
                    }
                    onOpenUpdates={(
                      selectedNode,
                    ) =>
                      setSelectedUpdateNode(
                        selectedNode,
                      )
                    }
                    onMaintenanceAction={(
                      selectedNode,
                      action,
                    ) =>
                      setConfirmState({
                        kind:
                          'maintenance',
                        node:
                          selectedNode,
                        action,
                      })
                    }
                    onNodeAction={(
                      selectedNode,
                      action,
                    ) =>
                      setConfirmState({
                        kind: 'node',
                        node:
                          selectedNode,
                        action,
                      })
                    }
                  />
                ),
              )}
            </SimpleGrid>
          </Stack>
        ) : null}
      </Stack>

      <NodeUpdatesModal
        node={selectedUpdateNode}
        status={updates.data?.find(
          (status) =>
            status.node ===
              selectedUpdateNode?.node &&
            status.infrastructure_id ===
              selectedUpdateNode
                ?.infrastructure_id,
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
        opened={batchConfirmAction !== null}
        onClose={() => {
          if (!batchStarting) {
            setBatchConfirmAction(null);
          }
        }}
        title={
          batchConfirmAction === 'check-updates'
            ? 'Check updates on all nodes'
            : batchConfirmAction === 'install-updates'
              ? 'Install updates on all nodes'
              : 'Run cleanup on all nodes'
        }
        centered
        closeOnClickOutside={!batchStarting}
        closeOnEscape={!batchStarting}
      >
        <Stack>
          <Text>
            {batchConfirmAction === 'check-updates'
              ? `Check available package updates on all ${selectedNodes.length} nodes of ${selectedInfrastructure?.name ?? 'this infrastructure'}?`
              : batchConfirmAction === 'install-updates'
                ? `Install all available package updates on all ${selectedNodes.length} nodes of ${selectedInfrastructure?.name ?? 'this infrastructure'}? No automatic reboot will be performed.`
                : `Remove unused packages and clean the package cache on all ${selectedNodes.length} nodes of ${selectedInfrastructure?.name ?? 'this infrastructure'}?`}
          </Text>

          {selectedNodes.length !== onlineNodes && (
            <Alert
              color="yellow"
              icon={
                <IconAlertCircle
                  size={18}
                />
              }
              title="Not all nodes are online"
            >
              {onlineNodes} of{' '}
              {selectedNodes.length} nodes are
              currently online. Unreachable nodes
              will be reported as failed in the
              batch result.
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={batchStarting}
              onClick={() =>
                setBatchConfirmAction(null)
              }
            >
              Cancel
            </Button>

            <Button
              loading={batchStarting}
              onClick={() => {
                if (batchConfirmAction) {
                  void runBatchAction(
                    batchConfirmAction,
                  );
                }
              }}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>


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
