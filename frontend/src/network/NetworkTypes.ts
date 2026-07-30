import type {
  Edge,
  Node,
} from '@xyflow/react';

export interface NetworkNodeData
  extends Record<string, unknown> {
  label: string;
  subtitle?: string;
  interfaceType:
    | 'gateway'
    | 'physical'
    | 'bridge'
    | 'vlan'
    | 'bond'
    | 'tun'
    | 'loopback'
    | string;
  state?: string;
  speed?: number | null;
  address?: string;
  vlanId?: number | null;
  master?: string | null;
}

export type NetworkFlowNode = Node<
  NetworkNodeData,
  'network'
>;

export type NetworkFlowEdge = Edge;
