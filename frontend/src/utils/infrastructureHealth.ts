import type { ClusterNode } from '../hooks/useDashboard';

export type InfrastructureHealth =
  | 'online'
  | 'partial'
  | 'disconnected';

export function getInfrastructureHealth(
  nodes: ClusterNode[],
): InfrastructureHealth {
  if (nodes.length === 0) {
    return 'disconnected';
  }

  const onlineNodes = nodes.filter(
    (node) =>
      node.status?.toLowerCase() === 'online',
  ).length;

  if (onlineNodes === nodes.length) {
    return 'online';
  }

  if (onlineNodes === 0) {
    return 'disconnected';
  }

  return 'partial';
}

export function getInfrastructureHealthLabel(
  health: InfrastructureHealth,
): string {
  switch (health) {
    case 'online':
      return 'Online';

    case 'partial':
      return 'Partially disconnected';

    case 'disconnected':
      return 'Disconnected';
  }
}

export function getInfrastructureHealthColor(
  health: InfrastructureHealth,
): string {
  switch (health) {
    case 'online':
      return 'green';

    case 'partial':
      return 'yellow';

    case 'disconnected':
      return 'red';
  }
}
