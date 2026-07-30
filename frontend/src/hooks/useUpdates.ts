import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export interface PackageUpdate {
  name: string;
  repository: string;
  current_version: string;
  available_version: string;
}

export interface NodeUpdateStatus {
  node: string;
  checked_at: string | null;
  updates: number;
  reboot_required: boolean;
  kernel_update: boolean;
  packages: PackageUpdate[];
}

interface UpdateResponse {
  nodes: NodeUpdateStatus[];
}

async function fetchUpdates(): Promise<NodeUpdateStatus[]> {
  const response =
    await api.get<UpdateResponse>(
      '/node-updates',
    );

  return response.data.nodes;
}

export function useUpdates() {
  return useQuery({
    queryKey: ['node-updates'],
    queryFn: fetchUpdates,
    refetchInterval: 10000,
    retry: 1,
  });
}
