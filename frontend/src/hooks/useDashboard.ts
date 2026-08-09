import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export interface InfrastructureResource {
  infrastructure_id: number;
  infrastructure_name: string;
  infrastructure_type:
    | 'cluster'
    | 'standalone';
}

export interface ClusterNode
  extends InfrastructureResource {
  id?: string;
  node: string;
  type?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  maintenance?: boolean;
}

export interface Guest
  extends InfrastructureResource {
  id?: string;
  vmid: number;
  name?: string;
  node?: string;
  type?: 'qemu' | 'lxc' | string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  hastate?: string;
  tags?: string;
  snapshot_count?: number;
  has_snapshots?: boolean;
  latest_snapshot?: string | null;
}

export interface StorageResource
  extends InfrastructureResource {
  id?: string;
  storage?: string;
  node?: string;
  type?: 'storage' | string;
  status?: string;
  plugintype?: string;
  content?: string;
  shared?: number;
  disk?: number;
  maxdisk?: number;
}

export interface ReplicationJob
  extends InfrastructureResource {
  id: string;
  guest: number;
  jobnum?: number;
  source?: string;
  target?: string;
  schedule?: string;
  type?: string;
}

export interface HaStatusEntry
  extends InfrastructureResource {
  id?: string;

  type:
    | 'quorum'
    | 'master'
    | 'fencing'
    | 'lrm'
    | 'service'
    | 'node'
    | string;

  node?: string;
  status?: string;
  timestamp?: number;

  quorate?: number;

  'armed-state'?: string;

  sid?: string;
  state?: string;
  crm_state?: string;
  request_state?: string;

  max_restart?: number;
  max_relocate?: number;
  failback?: number;
  'auto-rebalance'?: number;
}

export interface BackupJob
  extends InfrastructureResource {
  id: string;
  type?: string;
  storage?: string;
  schedule?: string;
  enabled?: number;
  all?: number;
  mode?: string;
  compress?: string;
  'next-run'?: number;
  'notification-mode'?: string;
  'notes-template'?: string;
  'prune-backups'?: {
    'keep-last'?: string;
    'keep-daily'?: string;
    'keep-weekly'?: string;
    'keep-monthly'?: string;
    'keep-yearly'?: string;
  };
  fleecing?: {
    enabled?: number;
  };
}

export interface BackupTask
  extends InfrastructureResource {
  node: string;
  id?: string;
  type: string;
  status?: string;
  starttime: number;
  endtime?: number;
  user?: string;
  upid: string;
  pid?: number;
  pstart?: number;
}

export interface InfrastructureError {
  infrastructure_id: number;
  infrastructure_name: string;
  error: string;
}

export interface DashboardData {
  nodes: ClusterNode[];
  guests: Guest[];
  storages: StorageResource[];
  replications: ReplicationJob[];
  backup_jobs: BackupJob[];
  backup_tasks: BackupTask[];
  ha: HaStatusEntry[];
  infrastructure_errors:
    InfrastructureError[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const response =
    await api.get<DashboardData>('/dashboard');

  return response.data;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 10000,
    retry: 1,
  });
}
