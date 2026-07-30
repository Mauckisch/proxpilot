import { useState } from 'react';

import { notifications } from '@mantine/notifications';

import { api } from '../api';
import type {
  MaintenanceAction,
  NodeAction,
} from '../components/NodeCard';
import type { ClusterNode } from './useDashboard';

export type NodeConfirmState =
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

type RefetchFunction = () => Promise<unknown>;

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

export function getNodeActionTitle(
  action: NodeAction,
): string {
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

export function getNodeActionText(
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

export function useNodeActions(
  refetch: RefetchFunction,
) {
  const [confirmState, setConfirmState] =
    useState<NodeConfirmState>(null);

  const [actionRunning, setActionRunning] =
    useState(false);

  function requestMaintenanceAction(
    node: ClusterNode,
    action: MaintenanceAction,
  ) {
    setConfirmState({
      kind: 'maintenance',
      node,
      action,
    });
  }

  function requestNodeAction(
    node: ClusterNode,
    action: NodeAction,
  ) {
    setConfirmState({
      kind: 'node',
      node,
      action,
    });
  }

  function closeConfirmation() {
    if (!actionRunning) {
      setConfirmState(null);
    }
  }

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

      await refetch();
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
          confirmed: action === 'check-updates' ? false : true,
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
          `${getNodeActionTitle(action)} started on ${node.node}.`,
        color: 'blue',
      });

      await refetch();
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

  return {
    confirmState,
    actionRunning,
    requestMaintenanceAction,
    requestNodeAction,
    closeConfirmation,
    confirmAction,
  };
}
