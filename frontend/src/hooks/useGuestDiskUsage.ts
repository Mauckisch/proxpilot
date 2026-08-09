import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export type GuestDiskUsage = {
  available: boolean;
  used_bytes: number;
  total_bytes: number;
};

async function fetchGuestDiskUsage(
  infrastructureId: number,
  node: string,
  vmid: number,
): Promise<GuestDiskUsage> {
  const response =
    await api.get<GuestDiskUsage>(
      `/guest/${encodeURIComponent(
        node,
      )}/qemu/${vmid}/disk-usage`,
      {
        params: {
          infrastructure_id:
            infrastructureId,
        },
      },
    );

  return response.data;
}

export function useGuestDiskUsage(
  infrastructureId: number,
  node: string | undefined,
  vmid: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      'guest-disk-usage',
      infrastructureId,
      node,
      vmid,
    ],

    queryFn: () =>
      fetchGuestDiskUsage(
        infrastructureId,
        node as string,
        vmid,
      ),

    enabled:
      enabled &&
      infrastructureId > 0 &&
      Boolean(node) &&
      vmid > 0,

    refetchInterval: 60_000,

    staleTime: 30_000,

    retry: 0,
  });
}
