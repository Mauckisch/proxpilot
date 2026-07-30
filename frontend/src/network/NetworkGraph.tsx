import { useMemo } from 'react';

import {
  Alert,
  Paper,
} from '@mantine/core';
import {
  IconAlertCircle,
} from '@tabler/icons-react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import type {
  NetworkInterface,
  NetworkRoute,
} from '../hooks/useNetwork';
import {
  layoutNetworkGraph,
} from './NetworkLayout';
import {
  NetworkNode,
} from './NetworkNode';
import type {
  NetworkFlowEdge,
  NetworkFlowNode,
} from './NetworkTypes';

interface NetworkGraphProps {
  interfaces: NetworkInterface[];
  defaultRoutes: NetworkRoute[];
}

const nodeTypes = {
  network: NetworkNode,
};

function getPrimaryAddress(
  networkInterface: NetworkInterface,
): string | undefined {
  const ipv4 =
    networkInterface.addresses?.find(
      (address) =>
        address.family === 'inet' &&
        address.scope !== 'host',
    );

  if (!ipv4?.local) {
    return undefined;
  }

  if (ipv4.prefixlen === undefined) {
    return ipv4.local;
  }

  return `${ipv4.local}/${ipv4.prefixlen}`;
}

function getInterfaceState(
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

function addEdge(
  edges: NetworkFlowEdge[],
  knownEdges: Set<string>,
  source: string,
  target: string,
  label?: string,
): void {
  if (source === target) {
    return;
  }

  const key = `${source}->${target}`;

  if (knownEdges.has(key)) {
    return;
  }

  knownEdges.add(key);

  edges.push({
    id: key,
    source,
    target,
    label,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
    style: {
      strokeWidth: 2,
    },
    labelStyle: {
      fontSize: 11,
    },
  });
}

export function NetworkGraph({
  interfaces,
  defaultRoutes,
}: NetworkGraphProps) {
  const graph = useMemo(() => {
    const nodes: NetworkFlowNode[] =
      interfaces
        .filter(
          (networkInterface) =>
            networkInterface.type !== 'loopback',
        )
        .map((networkInterface) => ({
          id: networkInterface.name,
          type: 'network',
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label:
              networkInterface.guest?.name ??
              networkInterface.name,
            subtitle:
              networkInterface.mac_address ??
              undefined,
            interfaceType:
              networkInterface.type,
            state: getInterfaceState(
              networkInterface,
            ),
            speed: networkInterface.speed,
            address: getPrimaryAddress(
              networkInterface,
            ),
            vlanId:
              networkInterface.vlan_id,
            master:
              networkInterface.master,
          },
        }));

    const nodeIds = new Set(
      nodes.map((node) => node.id),
    );

    const edges: NetworkFlowEdge[] = [];
    const knownEdges = new Set<string>();

    for (const networkInterface of interfaces) {
      if (!nodeIds.has(networkInterface.name)) {
        continue;
      }

      if (
        networkInterface.type === 'vlan' &&
        networkInterface.name.includes('.')
      ) {
        const baseInterface =
          networkInterface.name.split('.')[0];

        if (nodeIds.has(baseInterface)) {
          addEdge(
            edges,
            knownEdges,
            baseInterface,
            networkInterface.name,
            `VLAN ${networkInterface.vlan_id ?? ''}`,
          );
        }
      }

      if (
        networkInterface.master &&
        nodeIds.has(networkInterface.master)
      ) {
        if (networkInterface.type === 'tun') {
          addEdge(
            edges,
            knownEdges,
            networkInterface.master,
            networkInterface.name,
            'guest',
          );
        } else {
          addEdge(
            edges,
            knownEdges,
            networkInterface.name,
            networkInterface.master,
          );
        }
      }
    }

    const defaultRoute = defaultRoutes[0];

    if (
      defaultRoute?.gateway &&
      defaultRoute.dev &&
      nodeIds.has(defaultRoute.dev)
    ) {
      const gatewayId = 'network-gateway';

      nodes.push({
        id: gatewayId,
        type: 'network',
        position: {
          x: 0,
          y: 0,
        },
        data: {
          label: 'Default gateway',
          subtitle: defaultRoute.gateway,
          address: defaultRoute.gateway,
          interfaceType: 'gateway',
          state: 'up',
        },
      });

      addEdge(
        edges,
        knownEdges,
        gatewayId,
        defaultRoute.dev,
        'default route',
      );
    }

    return layoutNetworkGraph(
      nodes,
      edges,
    );
  }, [defaultRoutes, interfaces]);

  if (graph.nodes.length === 0) {
    return (
      <Alert
        color="blue"
        icon={<IconAlertCircle size={20} />}
        title="No network interfaces"
      >
        No interfaces are available for the selected
        node.
      </Alert>
    );
  }

  return (
    <Paper
      withBorder
      radius="md"
      style={{
        height: '720px',
        overflow: 'hidden',
      }}
    >
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.25,
        }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{
          hideAttribution: true,
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
        />

        <Controls
          showInteractive={false}
        />

        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={3}
        />
      </ReactFlow>
    </Paper>
  );
}
