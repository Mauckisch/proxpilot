import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export interface NetworkAddress {
  family?: string;
  address?: string;
  prefix_length?: number;
  scope?: string;
  broadcast?: string;
  dynamic?: boolean;
}

export interface NetworkStatistics {
  rx_bytes?: number;
  rx_packets?: number;
  rx_errors?: number;
  rx_dropped?: number;
  tx_bytes?: number;
  tx_packets?: number;
  tx_errors?: number;
  tx_dropped?: number;
}

export interface NetworkVlanRange {
  start?: number;
  end?: number;
  label?: string;
}

export interface NetworkInterface {
  name: string;
  type: string;
  state?: string;
  operstate?: string;
  master?: string | null;
  vlan_id?: number | null;
  mtu?: number;
  mac_address?: string | null;
  speed?: number | null;
  addresses?: NetworkAddress[];
  bridge_vlans?: NetworkVlanRange[];
  statistics?: NetworkStatistics;
  guest?: {
    vmid: number;
    type: string;
    name: string;
    status: string;
    node: string;
  };
}

export interface NetworkRoute {
  type?: string;
  dst?: string;
  gateway?: string;
  dev?: string;
  table?: string;
  protocol?: string;
  scope?: string;
  prefsrc?: string;
  metric?: number;
}

export interface NetworkSummary {
  interface_count: number;
  physical_count: number;
  bridge_count: number;
  vlan_count: number;
  bond_count: number;
  up_count: number;
  down_count: number;
}

export interface NetworkData {
  node: string;
  hostname: string;
  interfaces: NetworkInterface[];
  routes: NetworkRoute[];
  default_routes: NetworkRoute[];
  dns_servers: string[];
  summary: NetworkSummary;
}

async function fetchNetwork(
  infrastructureId: number,
  node: string,
): Promise<NetworkData> {
  const response = await api.get<NetworkData>(
    (
      `/infrastructures/${infrastructureId}` +
      `/network/${encodeURIComponent(node)}`
    ),
  );

  return response.data;
}

export function useNetwork(
  infrastructureId: number,
  node: string,
) {
  return useQuery({
    queryKey: [
      'network',
      infrastructureId,
      node,
    ],
    queryFn: () =>
      fetchNetwork(
        infrastructureId,
        node,
      ),
    enabled:
      infrastructureId > 0 &&
      Boolean(node),
    refetchInterval: 15000,
    retry: 1,
  });
}
