import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export interface HostOperatingSystem {
  pretty_name?: string;
  name?: string;
  version_id?: string;
  version?: string;
  version_codename?: string;
  debian_version_full?: string;
  id?: string;
  home_url?: string;
  support_url?: string;
  bug_report_url?: string;
}

export interface HostLoad {
  one_minute?: number;
  five_minutes?: number;
  fifteen_minutes?: number;
}

export interface HostFilesystem {
  filesystem: string;
  type?: string;
  total?: number | null;
  used?: number | null;
  available?: number | null;
  usage_percent?: number | null;
  mountpoint?: string;
}

export interface HostOverview {
  hostname: string;
  fqdn?: string;
  kernel?: string;
  architecture?: string;
  pve_version?: string;
  os?: HostOperatingSystem;
  uptime_seconds?: number;
  boot_time?: string;
  current_time?: string;
  load?: HostLoad;
  virtualization?: string;
  root_filesystem?: HostFilesystem | null;
}

export interface HostSystemHardware {
  manufacturer?: string;
  product_name?: string;
  product_version?: string;
  product_serial?: string;
  product_uuid?: string;
  board_manufacturer?: string;
  board_name?: string;
  board_version?: string;
  board_serial?: string | null;
  bios_vendor?: string;
  bios_version?: string;
  bios_date?: string;
}

export interface HostCpuCache {
  l1d?: string | null;
  l1i?: string | null;
  l2?: string | null;
  l3?: string | null;
}

export interface HostCpu {
  architecture?: string;
  model_name?: string;
  vendor?: string;
  sockets?: number;
  cores_per_socket?: number;
  threads_per_core?: number;
  logical_cpus?: number;
  numa_nodes?: number;
  minimum_mhz?: number;
  maximum_mhz?: number;
  physical_cores?: number;
  virtualization?: string;
  hypervisor_vendor?: string | null;
  cache?: HostCpuCache;
}

export interface HostMemory {
  total?: number;
  available?: number;
  used?: number;
  free?: number;
  buffers?: number;
  cached?: number;
  swap_total?: number;
  swap_free?: number;
  swap_used?: number;
}

export interface HostHardware {
  system?: HostSystemHardware;
  cpu?: HostCpu;
  memory?: HostMemory;
}

export interface HostBlockDevice {
  name?: string;
  kname?: string;
  path?: string;
  type?: string;
  size?: number;
  model?: string | null;
  vendor?: string | null;
  serial?: string | null;
  rota?: boolean | number;
  tran?: string | null;
  fstype?: string | null;
  fsver?: string | null;
  label?: string | null;
  uuid?: string | null;
  mountpoints?: Array<string | null>;
  pkname?: string | null;
  state?: string | null;
  hotplug?: boolean | number;
  rm?: boolean | number;
  ro?: boolean | number;
  children?: HostBlockDevice[];
}

export interface HostSmartDevice {
  path: string;
  model?: string | null;
  serial?: string | null;
  protocol?: string | null;
  passed?: boolean | null;
  health:
    | 'healthy'
    | 'warning'
    | 'critical'
    | 'unknown';
  warnings: string[];
  temperature_celsius?: number | null;
  percentage_used?: number | null;
  wear_remaining_percent?: number | null;
  critical_warning?: number;
  media_errors?: number;
  reallocated_sectors?: number;
  reported_uncorrect?: number;
  pending_sectors?: number;
  offline_uncorrectable?: number;
  crc_errors?: number;
}

export interface HostStorage {
  filesystems: HostFilesystem[];
  block_devices: HostBlockDevice[];
  smart_devices: HostSmartDevice[];
}

export interface HostPciDevice {
  slot?: string;
  class?: string;
  device?: string;
  revision?: string | null;
  raw?: string;
}

export interface HostUsbDevice {
  bus?: string;
  device_number?: string;
  usb_id?: string;
  description?: string;
}

export interface HostTemperatureSensor {
  chip?: string;
  label?: string;
  source?: string;
  temperature_celsius?: number;
}

export interface HostTemperatureData {
  available: boolean;
  sensors: HostTemperatureSensor[];
}

export interface HostZfsPool {
  name?: string;
  size?: number;
  allocated?: number;
  free?: number;
  fragmentation_percent?: number;
  capacity_percent?: number;
  health?: string;
  state?: string;
  scan?: string;
  errors?: string;
  read_errors?: number;
  write_errors?: number;
  checksum_errors?: number;
  raw_status?: string;
}

export interface HostZfsDataset {
  name?: string;
  type?: string;
  used?: number;
  available?: number;
  referenced?: number;
  mountpoint?: string;
}

export interface HostZfsData {
  available: boolean;
  pools: HostZfsPool[];
  datasets: HostZfsDataset[];
}

export interface HostDetails {
  node: string;
  overview: HostOverview;
  hardware: HostHardware;
  storage: HostStorage;
  pci: {
    devices: HostPciDevice[];
    count: number;
  };
  usb: {
    devices: HostUsbDevice[];
    count: number;
  };
  temperatures: HostTemperatureData;
  zfs: HostZfsData;
  software: {
    pve_packages_raw: string[];
  };
}

async function fetchHostDetails(node: string): Promise<HostDetails> {
  const response = await api.get<HostDetails>(
    `/node/${encodeURIComponent(node)}/details`,
    {
      timeout: 90000,
    },
  );

  return response.data;
}

export function useHostDetails(node: string) {
  return useQuery({
    queryKey: ['host-details', node],
    queryFn: () => fetchHostDetails(node),
    enabled: Boolean(node),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
}
