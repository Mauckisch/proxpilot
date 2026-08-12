import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconExternalLink,
  IconInfoCircle,
  IconNetwork,
  IconRefresh,
  IconServer,
  IconTransfer,
} from '@tabler/icons-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api';
import { OperatorButton } from './OperatorButton';
import {
  useDashboard,
} from '../hooks/useDashboard';
import type {
  ClusterNode,
  Guest,
} from '../hooks/useDashboard';

type GuestAgentIpAddress = {
  address: string;
  type?: string | null;
  prefix?: number | null;
};

type GuestAgentNetworkInterface = {
  name: string;
  hardware_address?: string | null;
  ip_addresses: GuestAgentIpAddress[];
};

type GuestAgentOsInfo = {
  id?: string;
  name?: string;
  'pretty-name'?: string;
  version?: string;
  'version-id'?: string;
  'kernel-release'?: string;
  'kernel-version'?: string;
  machine?: string;
  variant?: string;
  'variant-id'?: string;
};

type GuestAgentFilesystem = {
  mountpoint: string;
  name?: string | null;
  type?: string | null;
  total_bytes: number;
  used_bytes: number;
};

type GuestDetailsResponse = {
  node: string;
  node_host?: string | null;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  config: Record<string, unknown>;
  status: Record<string, unknown>;
  guest_agent_network?: GuestAgentNetworkInterface[];
  guest_agent_hostname?: string | null;
  guest_agent_os?: GuestAgentOsInfo | null;
  guest_agent_filesystems?: GuestAgentFilesystem[];
};

type ProxmoxTaskResponse = {
  status?: {
    status?: string;
    exitstatus?: string;
    type?: string;
    id?: string;
    node?: string;
    starttime?: number;
    endtime?: number;
  };
  log?: Array<{
    n?: number;
    t?: string;
  }>;
};

type MigrationResponse = {
  ok: boolean;
  node: string;
  target: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  upid: string;
};

type MigrationPreflightResponse = {
  ok: boolean;
  cross_infrastructure: boolean;
  source_infrastructure_id: number;
  target_infrastructure_id: number;
  source_node: string;
  target_node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  checks: Array<{
    name: string;
    ok: boolean;
    message: string;
    details?: Record<string, unknown>;
  }>;
  warnings: Array<{
    name: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  blocking_checks: number;
};

type GuestDetailsDrawerProps = {
  guest: Guest | null;
  nodes: ClusterNode[];
  opened: boolean;
  onClose: () => void;
  onMigrationComplete: () => Promise<unknown> | unknown;
};

type ParsedDevice = {
  key: string;
  raw: string;
  values: Record<string, string>;
};

function getErrorMessage(
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
          };
        };
      }
    ).response;

    if (response?.data?.detail) {
      return response.data.detail;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function valueToText(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatBytes(value: unknown): string {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const converted = bytes / 1024 ** index;

  return `${converted.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function formatUptime(value: unknown): string {
  const totalSeconds = Number(value);

  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '—';
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(
    (totalSeconds % 86400) / 3600,
  );
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }

  parts.push(`${minutes}m`);

  return parts.join(' ');
}

function parseDevice(
  key: string,
  input: unknown,
): ParsedDevice {
  const raw = valueToText(input);
  const values: Record<string, string> = {};

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const [index, part] of parts.entries()) {
    const separator = part.indexOf('=');

    if (separator > 0) {
      values[part.slice(0, separator)] =
        part.slice(separator + 1);
    } else if (index === 0) {
      values.device = part;
    } else {
      values[part] = '1';
    }
  }

  return {
    key,
    raw,
    values,
  };
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>

      <Text fw={600} mt={4}>
        {valueToText(value)}
      </Text>
    </Paper>
  );
}

export function GuestDetailsDrawer({
  guest,
  nodes,
  opened,
  onClose,
  onMigrationComplete,
}: GuestDetailsDrawerProps) {
  const dashboard = useDashboard();
  const [details, setDetails] =
    useState<GuestDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] =
    useState(false);
  const [detailsError, setDetailsError] =
    useState<string | null>(null);

  const [
    targetInfrastructureId,
    setTargetInfrastructureId,
  ] = useState<number | null>(null);

  const [targetNode, setTargetNode] =
    useState<string | null>(null);

  const [targetVmid, setTargetVmid] =
    useState<string>('');

  const [targetStorage, setTargetStorage] =
    useState<string>('__default__');

  const [targetBridge, setTargetBridge] =
    useState<string | null>(null);

  const [
    targetNetworkInterfaces,
    setTargetNetworkInterfaces,
  ] = useState<
    Array<{
      name: string;
      type?: string | null;
      state?: string | null;
    }>
  >([]);

  const [
    targetNetworkLoading,
    setTargetNetworkLoading,
  ] = useState(false);

  const [
    targetNetworkError,
    setTargetNetworkError,
  ] = useState<string | null>(null);

  const [online, setOnline] = useState(true);
  const [restart, setRestart] = useState(true);
  const [withLocalDisks, setWithLocalDisks] =
    useState(true);

  const [deleteSource, setDeleteSource] =
    useState(false);

  const [migrationRunning, setMigrationRunning] =
    useState(false);
  const [migrationUpid, setMigrationUpid] =
    useState<string | null>(null);
  const [taskData, setTaskData] =
    useState<ProxmoxTaskResponse | null>(null);
  const [taskError, setTaskError] =
    useState<string | null>(null);

  const validGuestType =
    guest?.type === 'qemu' || guest?.type === 'lxc'
      ? guest.type
      : null;

  const running =
    guest?.status?.toLowerCase() === 'running';

  const crossInfrastructureMigration =
    guest !== null &&
    targetInfrastructureId !== null &&
    targetInfrastructureId !==
      guest.infrastructure_id;

  const loadDetails = async () => {
    if (!guest?.node || !validGuestType) {
      return;
    }

    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const response =
        await api.get<GuestDetailsResponse>(
          `/guest/${encodeURIComponent(
            guest.node,
          )}/${validGuestType}/${guest.vmid}`,
          {
            params: {
              infrastructure_id:
                guest.infrastructure_id,
            },
          },
        );

      setDetails(response.data);
    } catch (error) {
      setDetailsError(
        getErrorMessage(
          error,
          'The guest details could not be loaded.',
        ),
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (!opened || !guest) {
      return;
    }

    setDetails(null);
    setDetailsError(null);
    setMigrationUpid(null);
    setTaskData(null);
    setTaskError(null);
    setMigrationRunning(false);
    setTargetInfrastructureId(
      guest.infrastructure_id,
    );
    setTargetVmid(
      String(guest.vmid),
    );
    setTargetStorage('__default__');
    setTargetBridge(null);
    setTargetNetworkInterfaces([]);
    setTargetNetworkError(null);
    setWithLocalDisks(
      guest.type === 'qemu',
    );
    setOnline(
      guest.type === 'qemu' &&
        guest.status?.toLowerCase() === 'running',
    );
    setRestart(
      guest.type === 'lxc' &&
        guest.status?.toLowerCase() === 'running',
    );

    const firstTarget =
      nodes.find(
        (node) =>
          node.infrastructure_id ===
            guest.infrastructure_id &&
          node.node !== guest.node &&
          node.status?.toLowerCase() === 'online',
      ) ??
      nodes.find(
        (node) =>
          node.infrastructure_id ===
            guest.infrastructure_id &&
          node.node !== guest.node,
      );

    setTargetNode(firstTarget?.node ?? null);

    void loadDetails();
    // loadDetails intentionally follows the selected guest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opened,
    guest?.node,
    guest?.type,
    guest?.vmid,
  ]);

  useEffect(() => {
    if (
      !migrationUpid ||
      !guest?.node ||
      !migrationRunning
    ) {
      return;
    }

    let cancelled = false;

    const checkTask = async () => {
      try {
        const response =
          await api.get<ProxmoxTaskResponse>(
            `/proxmox-task/${encodeURIComponent(
              guest.node as string,
            )}`,
            {
              params: {
                infrastructure_id:
                  guest.infrastructure_id,
                upid: migrationUpid,
              },
            },
          );

        if (cancelled) {
          return;
        }

        setTaskData(response.data);
        setTaskError(null);

        const taskStatus =
          response.data.status?.status?.toLowerCase();

        if (taskStatus === 'stopped') {
          setMigrationRunning(false);

          const exitStatus =
            response.data.status?.exitstatus ?? 'Unknown';

          if (exitStatus.toUpperCase() === 'OK') {
            notifications.show({
              color: 'green',
              title: 'Migration completed',
              message: `${
                guest.name || `Guest ${guest.vmid}`
              } was migrated successfully.`,
              icon: <IconCheck size={18} />,
            });

            await onMigrationComplete();
          } else {
            notifications.show({
              color: 'red',
              title: 'Migration failed',
              message: `Proxmox task status: ${exitStatus}`,
              icon: <IconAlertCircle size={18} />,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTaskError(
            getErrorMessage(
              error,
              'The migration task could not be queried.',
            ),
          );
        }
      }
    };

    void checkTask();

    const interval = window.setInterval(
      () => void checkTask(),
      2000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    guest?.name,
    guest?.node,
    guest?.vmid,
    migrationRunning,
    migrationUpid,
    onMigrationComplete,
  ]);

  const targetInfrastructureOptions =
    useMemo(() => {
      const infrastructures =
        new Map<
          number,
          {
            value: string;
            label: string;
          }
        >();

      for (
        const node of
        dashboard.data?.nodes ?? []
      ) {
        infrastructures.set(
          node.infrastructure_id,
          {
            value: String(
              node.infrastructure_id,
            ),
            label:
              node.infrastructure_name,
          },
        );
      }

      return Array.from(
        infrastructures.values(),
      ).sort(
        (a, b) =>
          a.label.localeCompare(
            b.label,
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          ),
      );
    }, [dashboard.data?.nodes]);

  const allDashboardNodes =
    dashboard.data?.nodes ?? [];

  const nodeOptions = useMemo(
    () =>
      allDashboardNodes
        .filter(
          (node) =>
            targetInfrastructureId !== null &&
            node.infrastructure_id ===
              targetInfrastructureId &&
            (
              node.infrastructure_id !==
                guest?.infrastructure_id ||
              node.node !== guest?.node
            ),
        )
        .map((node) => ({
          value: node.node,
          label: `${node.node}${
            node.status
              ? ` · ${node.status}`
              : ''
          }`,
          disabled:
            node.status?.toLowerCase() !== 'online',
        })),
    [
      allDashboardNodes,
      guest?.infrastructure_id,
      guest?.node,
      targetInfrastructureId,
    ],
  );

  useEffect(() => {
    if (
      targetInfrastructureId === null
    ) {
      setTargetNode(null);
      return;
    }

    const currentTargetStillValid =
      allDashboardNodes.some(
        (node) =>
          node.infrastructure_id ===
            targetInfrastructureId &&
          node.node === targetNode &&
          (
            node.infrastructure_id !==
              guest?.infrastructure_id ||
            node.node !== guest?.node
          ) &&
          node.status?.toLowerCase() ===
            'online',
      );

    if (currentTargetStillValid) {
      return;
    }

    const firstTarget =
      allDashboardNodes.find(
        (node) =>
          node.infrastructure_id ===
            targetInfrastructureId &&
          (
            node.infrastructure_id !==
              guest?.infrastructure_id ||
            node.node !== guest?.node
          ) &&
          node.status?.toLowerCase() ===
            'online',
      ) ??
      allDashboardNodes.find(
        (node) =>
          node.infrastructure_id ===
            targetInfrastructureId &&
          (
            node.infrastructure_id !==
              guest?.infrastructure_id ||
            node.node !== guest?.node
          ),
      );

    setTargetNode(
      firstTarget?.node ?? null,
    );

    setTargetStorage(
      '__default__',
    );

    setTargetBridge(null);
  }, [
    allDashboardNodes,
    guest?.infrastructure_id,
    guest?.node,
    targetInfrastructureId,
    targetNode,
  ]);

  useEffect(() => {
    if (crossInfrastructureMigration) {
      setWithLocalDisks(true);
      setOnline(false);
      setRestart(false);
      return;
    }

    setWithLocalDisks(
      validGuestType === 'qemu',
    );

    setOnline(
      validGuestType === 'qemu' &&
      running,
    );

    setRestart(
      validGuestType === 'lxc' &&
      running,
    );
  }, [
    crossInfrastructureMigration,
    running,
    validGuestType,
  ]);

  useEffect(() => {
    if (
      !crossInfrastructureMigration ||
      targetInfrastructureId === null ||
      !targetNode
    ) {
      setTargetNetworkInterfaces([]);
      setTargetBridge(null);
      setTargetNetworkError(null);
      setTargetNetworkLoading(false);
      return;
    }

    let cancelled = false;

    const loadTargetNetwork =
      async () => {
        setTargetNetworkLoading(true);
        setTargetNetworkError(null);

        try {
          const response =
            await api.get<{
              interfaces?: Array<{
                name?: string;
                type?: string | null;
                state?: string | null;
              }>;
            }>(
              `/infrastructures/${targetInfrastructureId}/network/${encodeURIComponent(
                targetNode,
              )}`,
            );

          if (cancelled) {
            return;
          }

          const interfaces =
            (
              response.data.interfaces ??
              []
            )
              .filter(
                (
                  item,
                ): item is {
                  name: string;
                  type?: string | null;
                  state?: string | null;
                } =>
                  typeof item.name ===
                    'string' &&
                  item.name.trim()
                    .length > 0,
              )
              .map((item) => ({
                name:
                  item.name.trim(),
                type:
                  item.type ?? null,
                state:
                  item.state ?? null,
              }));

          setTargetNetworkInterfaces(
            interfaces,
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          setTargetNetworkInterfaces([]);
          setTargetBridge(null);

          setTargetNetworkError(
            getErrorMessage(
              error,
              'The target network configuration could not be loaded.',
            ),
          );
        } finally {
          if (!cancelled) {
            setTargetNetworkLoading(
              false,
            );
          }
        }
      };

    void loadTargetNetwork();

    return () => {
      cancelled = true;
    };
  }, [
    crossInfrastructureMigration,
    targetInfrastructureId,
    targetNode,
  ]);

  const sourceBridges =
    useMemo(() => {
      const bridges =
        new Set<string>();

      for (
        const [key, rawValue] of
        Object.entries(
          details?.config ?? {},
        )
      ) {
        if (
          !/^net\d+$/.test(key) ||
          typeof rawValue !== 'string'
        ) {
          continue;
        }

        for (
          const part of
          rawValue.split(',')
        ) {
          const trimmed =
            part.trim();

          if (
            !trimmed.startsWith(
              'bridge=',
            )
          ) {
            continue;
          }

          const bridge =
            trimmed
              .slice(
                'bridge='.length,
              )
              .trim();

          if (bridge) {
            bridges.add(
              bridge,
            );
          }
        }
      }

      return Array.from(
        bridges,
      ).sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          ),
      );
    }, [details?.config]);

  const targetBridgeOptions =
    useMemo(() => {
      if (
        !crossInfrastructureMigration
      ) {
        return [];
      }

      return targetNetworkInterfaces
        .filter(
          (item) =>
            item.type === 'bridge',
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              undefined,
              {
                numeric: true,
                sensitivity: 'base',
              },
            ),
        )
        .map((item) => ({
          value: item.name,
          label: `${item.name}${
            item.state
              ? ` · ${item.state}`
              : ''
          }`,
          disabled:
            item.state != null &&
            item.state.toLowerCase() !==
              'up',
        }));
    }, [
      crossInfrastructureMigration,
      targetNetworkInterfaces,
    ]);

  useEffect(() => {
    if (
      !crossInfrastructureMigration
    ) {
      setTargetBridge(null);
      return;
    }

    if (
      targetBridgeOptions.some(
        (option) =>
          option.value ===
            targetBridge &&
          !option.disabled,
      )
    ) {
      return;
    }

    const sameBridge =
      sourceBridges.length === 1
        ? targetBridgeOptions.find(
            (option) =>
              option.value ===
                sourceBridges[0] &&
              !option.disabled,
          )
        : undefined;

    const firstAvailable =
      targetBridgeOptions.find(
        (option) =>
          !option.disabled,
      );

    setTargetBridge(
      sameBridge?.value ??
      firstAvailable?.value ??
      null,
    );
  }, [
    crossInfrastructureMigration,
    sourceBridges,
    targetBridge,
    targetBridgeOptions,
  ]);

  const currentGuestStorages =
    useMemo(() => {
      const guestConfig =
        details?.config ?? {};

      const storageNames =
        new Set<string>();

      for (
        const [key, rawValue] of
        Object.entries(guestConfig)
      ) {
        const isQemuDisk =
          /^(scsi|sata|ide|virtio)\d+$/.test(
            key,
          ) ||
          /^(efidisk|tpmstate)\d+$/.test(
            key,
          );

        const isLxcDisk =
          key === 'rootfs' ||
          /^mp\d+$/.test(key);

        if (
          validGuestType === 'qemu'
            ? !isQemuDisk
            : validGuestType === 'lxc'
              ? !isLxcDisk
              : true
        ) {
          continue;
        }

        if (
          typeof rawValue !== 'string'
        ) {
          continue;
        }

        const volume =
          rawValue
            .split(',', 1)[0]
            ?.trim();

        if (!volume) {
          continue;
        }

        const separator =
          volume.indexOf(':');

        if (separator <= 0) {
          continue;
        }

        const storageName =
          volume
            .slice(0, separator)
            .trim();

        if (storageName) {
          storageNames.add(
            storageName,
          );
        }
      }

      return Array.from(
        storageNames,
      ).sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          ),
      );
    }, [
      details?.config,
      validGuestType,
    ]);

  const defaultStorageLabel =
    currentGuestStorages.length > 0
      ? (
          'Default (current: ' +
          currentGuestStorages.join(', ') +
          ')'
        )
      : 'Default (Proxmox mapping)';

  const targetStorageOptions =
    useMemo(() => {
      const options =
        crossInfrastructureMigration
          ? []
          : [
              {
                value: '__default__',
                label:
                  defaultStorageLabel,
                disabled: false,
              },
            ];

      if (
        !guest ||
        !targetNode
      ) {
        return options;
      }

      const requiredContent =
        validGuestType === 'lxc'
          ? 'rootdir'
          : 'images';

      const targetStorages =
        new Map<
          string,
          {
            name: string;
            type: string;
          }
        >();

      for (
        const storage of
        dashboard.data?.storages ?? []
      ) {
        if (
          targetInfrastructureId === null ||
          storage.infrastructure_id !==
            targetInfrastructureId
        ) {
          continue;
        }

        if (
          storage.node &&
          storage.node !== targetNode
        ) {
          continue;
        }

        if (
          storage.status &&
          String(storage.status)
            .toLowerCase() !== 'available'
          &&
          String(storage.status)
            .toLowerCase() !== 'active'
        ) {
          continue;
        }

        const storageName =
          String(
            storage.storage ?? '',
          ).trim();

        if (!storageName) {
          continue;
        }

        const content =
          String(
            storage.content ?? '',
          )
            .split(',')
            .map(
              (value) =>
                value.trim()
                  .toLowerCase(),
            );

        if (
          content.length > 0 &&
          !content.includes(
            requiredContent,
          )
        ) {
          continue;
        }

        targetStorages.set(
          storageName,
          {
            name: storageName,
            type: String(
              storage.plugintype ?? '',
            )
              .trim()
              .toLowerCase(),
          },
        );
      }

      const sorted =
        Array.from(
          targetStorages.values(),
        ).sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              undefined,
              {
                numeric: true,
                sensitivity: 'base',
              },
            ),
        );

      return [
        ...options,
        ...sorted.map(
          (storage) => ({
            value: storage.name,
            label: storage.name,
            disabled: false,
          }),
        ),
      ];
    }, [
      crossInfrastructureMigration,
      currentGuestStorages,
      dashboard.data?.storages,
      defaultStorageLabel,
      guest,
      targetInfrastructureId,
      targetNode,
      validGuestType,
    ]);

  useEffect(() => {
    if (
      !crossInfrastructureMigration &&
      targetStorage ===
        '__default__'
    ) {
      return;
    }

    const stillAvailable =
      targetStorageOptions.some(
        (option) =>
          option.value ===
            targetStorage &&
          !option.disabled,
      );

    if (stillAvailable) {
      return;
    }

    if (crossInfrastructureMigration) {
      const firstCompatible =
        targetStorageOptions.find(
          (option) =>
            !option.disabled,
        );

      setTargetStorage(
        firstCompatible?.value ??
          '',
      );

      return;
    }

    setTargetStorage(
      '__default__',
    );
  }, [
    crossInfrastructureMigration,
    targetNode,
    targetStorage,
    targetStorageOptions,
  ]);

  const config = details?.config ?? {};
  const status = details?.status ?? {};

  const guestFilesystemUsage = useMemo(() => {
    const filesystems =
      details?.guest_agent_filesystems ?? [];

    const totalBytes = filesystems.reduce(
      (sum, filesystem) =>
        sum + filesystem.total_bytes,
      0,
    );

    const usedBytes = filesystems.reduce(
      (sum, filesystem) =>
        sum + filesystem.used_bytes,
      0,
    );

    const percent =
      totalBytes > 0
        ? Math.min(
            100,
            Math.max(
              0,
              (usedBytes / totalBytes) * 100,
            ),
          )
        : 0;

    return {
      totalBytes,
      usedBytes,
      percent,
    };
  }, [details?.guest_agent_filesystems]);

  const networkDevices = useMemo(
    () =>
      Object.entries(config)
        .filter(([key]) => /^net\d+$/.test(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) =>
          parseDevice(key, value),
        ),
    [config],
  );

  const diskDevices = useMemo(
    () =>
      Object.entries(config)
        .filter(([key]) =>
          /^(scsi|sata|ide|virtio|efidisk|tpmstate|rootfs|mp)\d*$/.test(
            key,
          ),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) =>
          parseDevice(key, value),
        ),
    [config],
  );

  const migrationLogRef =
    useRef<HTMLElement | null>(null);

  const migrationLog =
    taskData?.log
      ?.map((entry) => entry.t)
      .filter(
        (line): line is string =>
          typeof line === 'string',
      )
      .join('\n') ?? '';

  useEffect(() => {
    if (
      !migrationLog ||
      !migrationLogRef.current
    ) {
      return;
    }

    const element =
      migrationLogRef.current;

    element.scrollTop =
      element.scrollHeight;
  }, [migrationLog]);

  const taskStopped =
    taskData?.status?.status?.toLowerCase() ===
    'stopped';

  const taskSuccessful =
    taskStopped &&
    taskData?.status?.exitstatus?.toUpperCase() ===
      'OK';

  const startMigration = async () => {
    const parsedTargetVmid =
      Number(targetVmid);

    if (
      !guest?.node ||
      !validGuestType ||
      !targetNode
    ) {
      notifications.show({
        color: 'red',
        title: 'Migration unavailable',
        message:
          'Source node, guest type or target node is missing.',
      });

      return;
    }

    if (
      crossInfrastructureMigration &&
      targetInfrastructureId === null
    ) {
      notifications.show({
        color: 'red',
        title: 'Migration unavailable',
        message:
          'Target infrastructure is missing.',
      });

      return;
    }


    if (
      crossInfrastructureMigration &&
      (
        !Number.isInteger(
          parsedTargetVmid,
        ) ||
        parsedTargetVmid <= 0
      )
    ) {
      notifications.show({
        color: 'red',
        title: 'Migration unavailable',
        message:
          'Enter a valid target VMID.',
      });

      return;
    }

    if (
      crossInfrastructureMigration &&
      (
        !targetStorage ||
        targetStorage === '__default__'
      )
    ) {
      notifications.show({
        color: 'red',
        title: 'Migration unavailable',
        message:
          'Select a target storage for remote migration.',
      });

      return;
    }

    if (
      crossInfrastructureMigration &&
      !targetBridge
    ) {
      notifications.show({
        color: 'red',
        title: 'Migration unavailable',
        message:
          'Select a target network bridge for remote migration.',
      });

      return;
    }

    const requestPayload = {
      infrastructure_id:
        guest.infrastructure_id,
      target_infrastructure_id:
        targetInfrastructureId,
      node: guest.node,
      guest_type: validGuestType,
      vmid: guest.vmid,
      target_vmid:
        crossInfrastructureMigration
          ? parsedTargetVmid
          : null,
      target: targetNode,
      online:
        crossInfrastructureMigration
          ? false
          : (
              validGuestType === 'qemu' &&
              running &&
              online
            ),
      restart:
        crossInfrastructureMigration
          ? false
          : (
              validGuestType === 'lxc' &&
              running &&
              restart
            ),
      with_local_disks:
        validGuestType === 'qemu' &&
        (
          crossInfrastructureMigration
            ? true
            : withLocalDisks
        ),
      target_storage:
        targetStorage === '__default__'
          ? null
          : targetStorage,
      target_bridge:
        crossInfrastructureMigration
          ? targetBridge
          : null,
      delete_source:
        crossInfrastructureMigration
          ? deleteSource
          : false,
      confirmed: true,
    };

    if (crossInfrastructureMigration) {
      try {
        const preflightResponse =
          await api.post<MigrationPreflightResponse>(
            '/guest/migrate/preflight',
            requestPayload,
          );

        if (!preflightResponse.data.ok) {
          const failedChecks =
            preflightResponse.data.checks
              .filter(
                (check) =>
                  !check.ok,
              )
              .map(
                (check) =>
                  check.message,
              );

          notifications.show({
            color: 'red',
            title: 'Migration preflight failed',
            message:
              failedChecks.join(' ') ||
              'Remote migration requirements are not met.',
          });

          return;
        }

        if (
          preflightResponse.data.warnings.length > 0
        ) {
          const warningText =
            preflightResponse.data.warnings
              .map(
                (warning) =>
                  warning.message,
              )
              .join('\n');

          const warningConfirmed =
            window.confirm(
              [
                'Migration preflight passed with warnings:',
                '',
                warningText,
                '',
                'Continue anyway?',
              ].join('\n'),
            );

          if (!warningConfirmed) {
            return;
          }
        }
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Migration preflight failed',
          message: getErrorMessage(
            error,
            'The migration preflight could not be completed.',
          ),
          icon: <IconAlertCircle size={18} />,
        });

        return;
      }
    }

    const confirmationText = [
      `Migrate ${guest.name || `Guest ${guest.vmid}`}?`,
      '',
      `Source: ${guest.node}`,
      `Target: ${targetNode}`,
      crossInfrastructureMigration
        ? `Target infrastructure: ${
            targetInfrastructureId
          }`
        : null,
      crossInfrastructureMigration
        ? `Source VMID: ${guest.vmid}`
        : null,
      crossInfrastructureMigration
        ? `Target VMID: ${parsedTargetVmid}`
        : null,
      crossInfrastructureMigration
        ? `Target storage: ${targetStorage}`
        : null,
      crossInfrastructureMigration
        ? `Target network: ${targetBridge}`
        : null,
      crossInfrastructureMigration
        ? (
            deleteSource
              ? 'Source VM after migration: Delete'
              : 'Source VM after migration: Keep'
          )
        : null,
      validGuestType === 'qemu' &&
      running &&
      !crossInfrastructureMigration
        ? `Online migration: ${online ? 'Yes' : 'No'}`
        : null,
      validGuestType === 'lxc' &&
      running &&
      !crossInfrastructureMigration
        ? `Restart during migration: ${
            restart ? 'Yes' : 'No'
          }`
        : null,
      (
        validGuestType === 'qemu' &&
        (
          crossInfrastructureMigration ||
          withLocalDisks
        )
      )
        ? 'Local disks will be included.'
        : null,
      crossInfrastructureMigration
        ? 'The source VM will be retained after the migration.'
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (!window.confirm(confirmationText)) {
      return;
    }

    setMigrationRunning(true);
    setMigrationUpid(null);
    setTaskData(null);
    setTaskError(null);

    try {
      const response =
        await api.post<MigrationResponse>(
          '/guest/migrate',
          requestPayload,
        );

      setMigrationUpid(response.data.upid);

      notifications.show({
        color: 'blue',
        title: 'Migration started',
        message: `${
          guest.name || `Guest ${guest.vmid}`
        } is being migrated to ${targetNode}.`,
        icon: <IconTransfer size={18} />,
      });
    } catch (error) {
      setMigrationRunning(false);

      notifications.show({
        color: 'red',
        title: 'Migration failed to start',
        message: getErrorMessage(
          error,
          'The migration could not be started.',
        ),
        icon: <IconAlertCircle size={18} />,
      });
    }
  };

  const title =
    guest?.name || `Guest ${guest?.vmid ?? ''}`;

  const proxmoxHost = details?.node_host;

  const proxmoxUrl =
    proxmoxHost && validGuestType && guest
      ? `https://${proxmoxHost}:8006/#v1:0:=${encodeURIComponent(
          `${validGuestType}/${guest.vmid}`,
        )}`
      : null;

  const openInProxmox = () => {
    if (!proxmoxUrl) {
      return;
    }

    window.open(
      proxmoxUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const openConsole = () => {
    if (
      !guest ||
      !guest.node
    ) {
      return;
    }

    const guestType =
      guest.type === 'qemu' || guest.type === 'lxc'
        ? guest.type
        : null;

    if (!guestType) {
      return;
    }

    const parameters = new URLSearchParams({
      infrastructure_id:
        String(guest.infrastructure_id),
      node: guest.node,
      guest_type: guestType,
      vmid: String(guest.vmid),
      name: title,
    });

    window.open(
      `/console?${parameters.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Group gap="sm">
          <IconServer size={22} />

          <div>
            <Text fw={700}>{title}</Text>

            <Text size="xs" c="dimmed">
              {guest?.type === 'qemu' ? 'VM' : 'LXC'}{' '}
              {guest?.vmid} · {guest?.node}
            </Text>
          </div>
        </Group>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {!guest ? null : (
        <Stack gap="lg">
          <Group justify="space-between">
            <Group gap="xs">
              <Badge
                color={running ? 'green' : 'gray'}
                variant="light"
              >
                {guest.status ?? 'Unknown'}
              </Badge>

              <Badge
                color={
                  guest.type === 'qemu'
                    ? 'blue'
                    : 'violet'
                }
                variant="light"
              >
                {guest.type === 'qemu' ? 'VM' : 'LXC'}
              </Badge>
            </Group>

            <Group gap="xs">
              <OperatorButton
                variant="light"
                size="xs"
                leftSection={
                  <IconDeviceDesktop size={15} />
                }
                disabled={
                  !(
                    guest.type === 'qemu' ||
                    guest.type === 'lxc'
                  ) ||
                  !running
                }
                onClick={openConsole}
              >
                Console
              </OperatorButton>

              <Button
                variant="light"
                size="xs"
                leftSection={
                  <IconExternalLink size={15} />
                }
                disabled={!proxmoxUrl}
                onClick={openInProxmox}
              >
                Open in Proxmox
              </Button>

              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconRefresh size={15} />}
                loading={detailsLoading}
                onClick={() => void loadDetails()}
              >
                Refresh details
              </Button>
            </Group>
          </Group>

          {detailsError && (
            <Alert
              color="red"
              icon={<IconAlertCircle size={18} />}
              title="Unable to load guest details"
            >
              {detailsError}
            </Alert>
          )}

          {detailsLoading && !details ? (
            <Stack align="center" py="xl">
              <Loader />

              <Text c="dimmed">
                Loading guest configuration...
              </Text>
            </Stack>
          ) : (
            <Tabs defaultValue="overview">
              <Tabs.List>
                <Tabs.Tab
                  value="overview"
                  leftSection={
                    <IconInfoCircle size={16} />
                  }
                >
                  Overview
                </Tabs.Tab>

                <Tabs.Tab
                  value="hardware"
                  leftSection={<IconCpu size={16} />}
                >
                  Hardware
                </Tabs.Tab>

                <Tabs.Tab
                  value="network"
                  leftSection={<IconNetwork size={16} />}
                >
                  Network
                </Tabs.Tab>

                <Tabs.Tab
                  value="storage"
                  leftSection={<IconDatabase size={16} />}
                >
                  Storage
                </Tabs.Tab>

                <Tabs.Tab
                  value="migration"
                  leftSection={<IconTransfer size={16} />}
                >
                  Migration
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="overview" pt="md">
                <Stack gap="md">
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <DetailItem
                      label="Name"
                      value={
                        config.name ??
                        guest.name ??
                        `Guest ${guest.vmid}`
                      }
                    />

                    <DetailItem
                      label="VMID"
                      value={guest.vmid}
                    />

                    <DetailItem
                      label="Node"
                      value={guest.node}
                    />

                    <DetailItem
                      label="Status"
                      value={
                        status.status ??
                        guest.status
                      }
                    />

                    <DetailItem
                      label="Uptime"
                      value={formatUptime(
                        status.uptime ??
                          guest.uptime,
                      )}
                    />

                    <DetailItem
                      label="Guest hostname"
                      value={
                        details?.guest_agent_hostname ??
                        '—'
                      }
                    />

                    <DetailItem
                      label="Operating system"
                      value={
                        details?.guest_agent_os?.[
                          'pretty-name'
                        ] ??
                        details?.guest_agent_os?.name ??
                        '—'
                      }
                    />

                    <DetailItem
                      label="Kernel"
                      value={
                        details?.guest_agent_os?.[
                          'kernel-release'
                        ] ??
                        '—'
                      }
                    />

                    <DetailItem
                      label="Architecture"
                      value={
                        details?.guest_agent_os?.machine ??
                        '—'
                      }
                    />

                    <DetailItem
                      label="HA state"
                      value={guest.hastate}
                    />
                  </SimpleGrid>

                  {(Boolean(config.description) ||
                    Boolean(config.tags) ||
                    Boolean(guest.tags)) && (
                    <Paper withBorder radius="md" p="md">
                      {Boolean(config.description) && (
                        <>
                          <Text size="xs" c="dimmed">
                            Description
                          </Text>

                          <Text
                            size="sm"
                            mt={4}
                            style={{
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {valueToText(
                              config.description,
                            )}
                          </Text>
                        </>
                      )}

                      {(Boolean(config.tags) ||
                        Boolean(guest.tags)) && (
                        <>
                          {config.description && (
                            <Divider my="md" />
                          )}

                          <Text size="xs" c="dimmed">
                            Tags
                          </Text>

                          <Group gap="xs" mt="xs">
                            {String(
                              config.tags ??
                                guest.tags,
                            )
                              .split(/[;,]/)
                              .map((tag) =>
                                tag.trim(),
                              )
                              .filter(Boolean)
                              .map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="light"
                                  color="gray"
                                >
                                  {tag}
                                </Badge>
                              ))}
                          </Group>
                        </>
                      )}
                    </Paper>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="hardware" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <DetailItem
                    label="CPU type"
                    value={
                      config.cpu ??
                      config.cputype ??
                      'Default'
                    }
                  />

                  <DetailItem
                    label="Sockets"
                    value={config.sockets ?? 1}
                  />

                  <DetailItem
                    label="Cores"
                    value={
                      config.cores ??
                      status.cpus ??
                      guest.maxcpu
                    }
                  />

                  <DetailItem
                    label="Memory"
                    value={
                      config.memory
                        ? `${config.memory} MiB`
                        : formatBytes(
                            status.maxmem ??
                              guest.maxmem,
                          )
                    }
                  />

                  <DetailItem
                    label="Balloon"
                    value={
                      config.balloon
                        ? `${config.balloon} MiB`
                        : 'Disabled / not configured'
                    }
                  />

                  <DetailItem
                    label="NUMA"
                    value={config.numa ?? 0}
                  />

                  <DetailItem
                    label="BIOS"
                    value={
                      config.bios ??
                      'Default'
                    }
                  />

                  <DetailItem
                    label="Machine"
                    value={
                      config.machine ??
                      'Default'
                    }
                  />

                  <DetailItem
                    label="SCSI controller"
                    value={
                      config.scsihw ??
                      'Default'
                    }
                  />

                  <DetailItem
                    label="QEMU guest agent"
                    value={
                      config.agent ??
                      'Disabled / not configured'
                    }
                  />

                  <DetailItem
                    label="Architecture"
                    value={
                      config.arch ??
                      status.arch
                    }
                  />

                  <DetailItem
                    label="Operating system"
                    value={
                      config.ostype ??
                      status.ostype
                    }
                  />
                </SimpleGrid>
              </Tabs.Panel>

              <Tabs.Panel value="network" pt="md">
                {networkDevices.length === 0 ? (
                  <Alert
                    color="gray"
                    icon={<IconNetwork size={18} />}
                  >
                    No network adapters were found in the
                    guest configuration.
                  </Alert>
                ) : (
                  <Stack gap="md">
                    {networkDevices.map((device) => {
                      const model =
                        device.values.device ??
                        device.values.name ??
                        'Network adapter';

                      const mac =
                        device.values[
                          Object.keys(
                            device.values,
                          ).find((key) =>
                            /^(virtio|e1000|rtl8139|vmxnet3)$/i.test(
                              key,
                            ),
                          ) ?? ''
                        ];

                      const normalizedMac =
                        mac?.toLowerCase();

                      const agentInterface =
                        details?.guest_agent_network?.find(
                          (item) =>
                            item.hardware_address
                              ?.toLowerCase() ===
                            normalizedMac,
                        );

                      const agentAddresses =
                        agentInterface?.ip_addresses
                          ?.map((address) => {
                            if (
                              address.prefix ===
                                undefined ||
                              address.prefix === null
                            ) {
                              return address.address;
                            }

                            return `${address.address}/${address.prefix}`;
                          })
                          .join(', ') || '—';

                      return (
                        <Paper
                          key={device.key}
                          withBorder
                          radius="md"
                          p="md"
                        >
                          <Group
                            justify="space-between"
                            mb="md"
                          >
                            <div>
                              <Title order={5}>
                                {device.key}
                              </Title>

                              <Text
                                size="xs"
                                c="dimmed"
                              >
                                {model}
                              </Text>
                            </div>

                            <Badge
                              color={
                                device.values.link_down ===
                                '1'
                                  ? 'gray'
                                  : 'green'
                              }
                              variant="light"
                            >
                              {device.values.link_down ===
                              '1'
                                ? 'Disconnected'
                                : 'Connected'}
                            </Badge>
                          </Group>

                          <SimpleGrid
                            cols={{
                              base: 1,
                              sm: 2,
                            }}
                          >
                            <DetailItem
                              label="Bridge"
                              value={
                                device.values.bridge ??
                                '—'
                              }
                            />

                            <DetailItem
                              label="VLAN tag"
                              value={
                                device.values.tag ??
                                'Untagged'
                              }
                            />

                            <DetailItem
                              label="MAC address"
                              value={mac ?? '—'}
                            />

                            <DetailItem
                              label="IP addresses (Guest Agent)"
                              value={agentAddresses}
                            />

                            <DetailItem
                              label="Firewall"
                              value={
                                device.values.firewall ===
                                '1'
                                  ? 'Enabled'
                                  : 'Disabled'
                              }
                            />
                          </SimpleGrid>

                          <Text
                            size="xs"
                            c="dimmed"
                            mt="md"
                          >
                            Raw configuration
                          </Text>

                          <Code
                            block
                            mt={4}
                            style={{
                              whiteSpace: 'pre-wrap',
                              overflowWrap:
                                'anywhere',
                            }}
                          >
                            {device.raw}
                          </Code>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="storage" pt="md">
                <Stack gap="md">
                  {guestFilesystemUsage.totalBytes > 0 && (
                    <Paper
                      withBorder
                      radius="md"
                      p="md"
                    >
                      <Group
                        justify="space-between"
                        align="flex-end"
                        mb="xs"
                      >
                        <div>
                          <Text
                            size="xs"
                            c="dimmed"
                          >
                            Guest disk usage
                          </Text>

                          <Text fw={700} mt={2}>
                            {formatBytes(
                              guestFilesystemUsage.usedBytes,
                            )}{' '}
                            /{' '}
                            {formatBytes(
                              guestFilesystemUsage.totalBytes,
                            )}
                          </Text>
                        </div>

                        <Text fw={700}>
                          {guestFilesystemUsage.percent.toFixed(
                            1,
                          )}
                          %
                        </Text>
                      </Group>

                      <Progress
                        value={
                          guestFilesystemUsage.percent
                        }
                      />
                    </Paper>
                  )}

                {diskDevices.length === 0 ? (
                  <Alert
                    color="gray"
                    icon={<IconDatabase size={18} />}
                  >
                    No disks were found in the guest
                    configuration.
                  </Alert>
                ) : (
                  <Stack gap="md">
                    {diskDevices.map((device) => (
                      <Paper
                        key={device.key}
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Group
                          justify="space-between"
                          align="flex-start"
                        >
                          <div>
                            <Title order={5}>
                              {device.key}
                            </Title>

                            <Text
                              size="xs"
                              c="dimmed"
                              mt={2}
                            >
                              {device.values.device ??
                                'Configured disk'}
                            </Text>
                          </div>

                          {device.values.size && (
                            <Badge variant="light">
                              {device.values.size}
                            </Badge>
                          )}
                        </Group>

                        <SimpleGrid
                          cols={{
                            base: 1,
                            sm: 2,
                          }}
                          mt="md"
                        >
                          <DetailItem
                            label="Backup"
                            value={
                              device.values.backup === '0'
                                ? 'Excluded'
                                : 'Included'
                            }
                          />

                          <DetailItem
                            label="Discard"
                            value={
                              device.values.discard ===
                              'on'
                                ? 'Enabled'
                                : 'Disabled'
                            }
                          />

                          <DetailItem
                            label="SSD emulation"
                            value={
                              device.values.ssd === '1'
                                ? 'Enabled'
                                : 'Disabled'
                            }
                          />

                          <DetailItem
                            label="IO thread"
                            value={
                              device.values.iothread ===
                              '1'
                                ? 'Enabled'
                                : 'Disabled'
                            }
                          />
                        </SimpleGrid>

                        <Text
                          size="xs"
                          c="dimmed"
                          mt="md"
                        >
                          Raw configuration
                        </Text>

                        <Code
                          block
                          mt={4}
                          style={{
                            whiteSpace: 'pre-wrap',
                            overflowWrap:
                              'anywhere',
                          }}
                        >
                          {device.raw}
                        </Code>
                      </Paper>
                    ))}
                  </Stack>
                )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="migration" pt="md">
                <Stack gap="lg">
                  <Alert
                    color="blue"
                    icon={<IconInfoCircle size={18} />}
                  >
                    The migration is started directly through
                    the Proxmox API. Compatibility, storage
                    access and available resources are checked
                    by Proxmox when the task starts.
                  </Alert>

                  <Alert
                    color="yellow"
                    icon={<IconAlertCircle size={18} />}
                  >
                    For best migration compatibility, the
                    source and target Proxmox nodes should
                    ideally run the same Proxmox VE version.
                    Different versions can introduce
                    compatibility differences, especially
                    during migrations between separate
                    infrastructures.
                  </Alert>

                  {crossInfrastructureMigration && (
                    <Alert
                      color="blue"
                      icon={<IconInfoCircle size={18} />}
                    >
                      Remote migrations can take some time to
                      initialize before disk transfer activity
                      becomes visible. Please wait after
                      starting the migration and do not start
                      the operation again while initialization
                      is still in progress.
                    </Alert>
                  )}

                  {crossInfrastructureMigration && (
                    <Alert
                      color={
                        running
                          ? 'red'
                          : 'yellow'
                      }
                      icon={
                        <IconAlertCircle
                          size={18}
                        />
                      }
                      title={
                        running
                          ? 'Guest must be stopped'
                          : 'Cross-infrastructure migration'
                      }
                    >
                      {running
                        ? (
                            <>
                              Remote migration to another
                              infrastructure is only allowed
                              while the guest is stopped.
                              Stop the guest before
                              continuing.
                            </>
                          )
                        : (
                            <>
                              This operation uses the
                              experimental Proxmox remote
                              migration feature. Local disks
                              will be transferred to the
                              selected target storage.
                              ProxPilot cannot fully verify
                              CPU-model compatibility with
                              different target hardware, so
                              successful startup of the
                              migrated guest cannot be
                              guaranteed.
                            </>
                          )}
                    </Alert>
                  )}

                  <Paper withBorder radius="md" p="md">
                    <Stack gap="md">
                      <Select
                        label="Target infrastructure"
                        description="Select the Proxmox infrastructure that should receive the guest."
                        data={
                          targetInfrastructureOptions
                        }
                        value={
                          targetInfrastructureId ===
                          null
                            ? null
                            : String(
                                targetInfrastructureId,
                              )
                        }
                        onChange={(value) => {
                          const parsed =
                            value === null
                              ? null
                              : Number(value);

                          setTargetInfrastructureId(
                            parsed !== null &&
                            Number.isInteger(
                              parsed,
                            )
                              ? parsed
                              : null,
                          );
                        }}
                        allowDeselect={false}
                        searchable
                      />

                      <Group grow align="flex-end">
                        <TextInput
                          label="Source node"
                          value={guest.node ?? ''}
                          disabled
                        />

                        <Box
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            paddingBottom: 8,
                          }}
                        >
                          <IconArrowRight size={20} />
                        </Box>

                        <Select
                          label="Target node"
                          placeholder="Select target node"
                          data={nodeOptions}
                          value={targetNode}
                          onChange={setTargetNode}
                          allowDeselect={false}
                          searchable
                        />
                      </Group>

                      {crossInfrastructureMigration && (
                        <TextInput
                          label="Target VMID"
                          description="VMID to use on the target infrastructure. The source VMID is used by default, but you can select another free VMID."
                          value={targetVmid}
                          onChange={(event) => {
                            const value =
                              event.currentTarget.value;

                            if (
                              value === '' ||
                              /^\d+$/.test(value)
                            ) {
                              setTargetVmid(
                                value,
                              );
                            }
                          }}
                          inputMode="numeric"
                          placeholder="Enter target VMID"
                        />
                      )}

                      {crossInfrastructureMigration && (
                        <Checkbox
                          label="Delete source VM after successful migration"
                          description="If enabled, the source VM will be removed only after the remote migration completes successfully. Leave this disabled to keep the source VM."
                          checked={deleteSource}
                          onChange={(event) =>
                            setDeleteSource(
                              event.currentTarget.checked,
                            )
                          }
                        />
                      )}

                      <Select
                        label="Target storage"
                        description={
                          crossInfrastructureMigration
                            ? 'Select the storage that will receive the guest disks on the target infrastructure.'
                            : 'Select a storage available on the target node or let Proxmox use its default mapping.'
                        }
                        data={
                          targetStorageOptions
                        }
                        value={
                          targetStorage
                        }
                        onChange={(value) =>
                          setTargetStorage(
                            value ??
                              (
                                crossInfrastructureMigration
                                  ? ''
                                  : '__default__'
                              ),
                          )
                        }
                        allowDeselect={false}
                        searchable
                        disabled={
                          !targetNode
                        }
                        nothingFoundMessage={
                          'No compatible storage found'
                        }
                      />

                      {crossInfrastructureMigration &&
                        targetStorageOptions.length > 0 &&
                        !targetStorageOptions.some(
                          (option) =>
                            !option.disabled,
                        ) && (
                          <Alert
                            color="red"
                            icon={
                              <IconAlertCircle
                                size={18}
                              />
                            }
                          >
                            No compatible target storage is
                            available for the source disk
                            storage type. The selected guest
                            cannot be migrated to this target
                            infrastructure with the current
                            storage configuration.
                          </Alert>
                        )}

                      {crossInfrastructureMigration && (
                        <>
                          <Select
                            label="Target network"
                            description={
                              sourceBridges.length > 0
                                ? (
                                    'Source bridge: ' +
                                    sourceBridges.join(
                                      ', ',
                                    ) +
                                    '. Select the bridge to use on the target infrastructure.'
                                  )
                                : 'Select the network bridge to use on the target infrastructure.'
                            }
                            placeholder={
                              targetNetworkLoading
                                ? 'Loading target network...'
                                : 'Select target bridge'
                            }
                            data={
                              targetBridgeOptions
                            }
                            value={
                              targetBridge
                            }
                            onChange={
                              setTargetBridge
                            }
                            allowDeselect={false}
                            searchable
                            disabled={
                              !targetNode ||
                              targetNetworkLoading
                            }
                            nothingFoundMessage="No usable target bridge found"
                          />

                          {targetNetworkError && (
                            <Alert
                              color="red"
                              icon={
                                <IconAlertCircle
                                  size={18}
                                />
                              }
                            >
                              {
                                targetNetworkError
                              }
                            </Alert>
                          )}
                        </>
                      )}

                      {validGuestType === 'qemu' && (
                        <Checkbox
                          label="Online migration"
                          description={
                            crossInfrastructureMigration
                              ? 'Remote migration currently requires the VM to be stopped.'
                              : running
                                ? 'Keep the VM running while its memory state is transferred.'
                                : 'Online migration is available only while the VM is running.'
                          }
                          checked={
                            !crossInfrastructureMigration &&
                            running &&
                            online
                          }
                          disabled={
                            crossInfrastructureMigration ||
                            !running
                          }
                          onChange={(event) =>
                            setOnline(
                              event.currentTarget
                                .checked,
                            )
                          }
                        />
                      )}

                      {validGuestType === 'qemu' && (
                        <Checkbox
                          label="Include local disks"
                          description={
                            crossInfrastructureMigration
                              ? 'Required for migration to another infrastructure. VM disks will be transferred to the selected target storage.'
                              : 'Required when the VM uses local storage instead of shared storage. Local VM disks will be transferred to the target node.'
                          }
                          checked={
                            crossInfrastructureMigration
                              ? true
                              : withLocalDisks
                          }
                          disabled={
                            crossInfrastructureMigration
                          }
                          onChange={(event) =>
                            setWithLocalDisks(
                              event.currentTarget
                                .checked,
                            )
                          }
                        />
                      )}

                      {validGuestType === 'lxc' &&
                        running && (
                          <Checkbox
                            label="Restart running container during migration"
                            description="The container is stopped on the source node and started on the target node."
                            checked={restart}
                            onChange={(event) =>
                              setRestart(
                                event.currentTarget
                                  .checked,
                              )
                            }
                          />
                        )}

                      {validGuestType === 'lxc' &&
                        running &&
                        !restart && (
                          <Alert
                            color="yellow"
                            icon={
                              <IconAlertCircle size={18} />
                            }
                          >
                            A running LXC container normally
                            requires restart migration. Stop
                            the container first or enable the
                            restart option.
                          </Alert>
                        )}

                      <OperatorButton
                        leftSection={
                          <IconTransfer size={18} />
                        }
                        loading={
                          migrationRunning &&
                          !migrationUpid
                        }
                        disabled={
                          !targetNode ||
                          migrationRunning ||
                          (
                            crossInfrastructureMigration &&
                            (
                              running ||
                              !Number.isInteger(
                                Number(targetVmid),
                              ) ||
                              Number(targetVmid) <= 0 ||
                              !targetStorage ||
                              targetStorage ===
                                '__default__' ||
                              !targetBridge
                            )
                          )
                        }
                        permissionTooltip="Operator or administrator permissions required to migrate guests."
                        onClick={() =>
                          void startMigration()
                        }
                      >
                        Start migration
                      </OperatorButton>
                    </Stack>
                  </Paper>

                  {(migrationUpid ||
                    migrationRunning ||
                    taskData ||
                    taskError) && (
                    <Paper
                      withBorder
                      radius="md"
                      p="md"
                    >
                      <Group
                        justify="space-between"
                        mb="sm"
                      >
                        <div>
                          <Text fw={700}>
                            Migration task
                          </Text>

                          <Text
                            size="xs"
                            c="dimmed"
                          >
                            {taskData?.status?.type ??
                              'qmigrate'}
                          </Text>
                        </div>

                        <Badge
                          color={
                            migrationRunning
                              ? 'blue'
                              : taskSuccessful
                                ? 'green'
                                : taskStopped
                                  ? 'red'
                                  : 'gray'
                          }
                          variant="light"
                        >
                          {migrationRunning
                            ? 'Running'
                            : taskSuccessful
                              ? 'Completed'
                              : taskData?.status
                                    ?.exitstatus ??
                                taskData?.status
                                  ?.status ??
                                'Waiting'}
                        </Badge>
                      </Group>

                      {migrationRunning && (
                        <Progress
                          value={100}
                          animated
                          mb="md"
                        />
                      )}

                      {taskError && (
                        <Alert
                          color="red"
                          icon={
                            <IconAlertCircle size={18} />
                          }
                          mb="md"
                        >
                          {taskError}
                        </Alert>
                      )}

                      {migrationUpid && (
                        <>
                          <Text
                            size="xs"
                            c="dimmed"
                          >
                            UPID
                          </Text>

                          <Code
                            block
                            mt={4}
                            style={{
                              overflowWrap:
                                'anywhere',
                            }}
                          >
                            {migrationUpid}
                          </Code>
                        </>
                      )}

                      {migrationLog && (
                        <>
                          <Text
                            size="xs"
                            c="dimmed"
                            mt="md"
                          >
                            Proxmox task log
                          </Text>

                          <Code
                            ref={
                              migrationLogRef
                            }
                            block
                            mt={4}
                            style={{
                              maxHeight: 320,
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              overflowWrap:
                                'anywhere',
                            }}
                          >
                            {migrationLog}
                          </Code>
                        </>
                      )}
                    </Paper>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
