import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCamera,
  IconRefresh,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { Guest } from '../hooks/useDashboard';
import { api } from '../api';
import { OperatorButton } from './OperatorButton';

type Snapshot = {
  name: string;
  description?: string;
  created_at?: number | null;
  includes_ram?: boolean;
  parent?: string | null;
};

type SnapshotResponse = {
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  count: number;
  has_snapshots: boolean;
  snapshots: Snapshot[];
};

type SnapshotButtonProps = {
  guest: Guest;
};

function formatDate(timestamp?: number | null): string {
  if (!timestamp) {
    return 'Unknown creation time';
  }

  return new Date(timestamp * 1000).toLocaleString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}


export function SnapshotButton({
  guest,
}: SnapshotButtonProps) {
  const [opened, setOpened] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [operationRunning, setOperationRunning] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] =
    useState<string | null>(null);

  const [createOpened, setCreateOpened] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [description, setDescription] = useState('');
  const [includeRam, setIncludeRam] = useState(false);

  const node = guest.node;
  const guestType =
    guest.type === 'qemu' || guest.type === 'lxc'
      ? guest.type
      : null;

  const canManage =
    Boolean(node) &&
    Boolean(guestType) &&
    typeof guest.vmid === 'number';

  async function loadSnapshots() {
    if (!node || !guestType) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get<SnapshotResponse>(
        `/snapshots/${encodeURIComponent(node)}/${guestType}/${guest.vmid}`,
      );

      setSnapshots(response.data.snapshots ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function waitForTask(
    upid: string,
    successMessage: string,
  ) {
    if (!node) {
      return;
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, 1500),
      );

      const response = await api.get<{
        status?: {
          status?: string;
          exitstatus?: string;
        };
      }>(
        `/backup/task-log?node=${encodeURIComponent(
          node,
        )}&upid=${encodeURIComponent(upid)}`,
      );

      const taskStatus = response.data.status ?? {};

      if (taskStatus.status === 'stopped') {
        const exitStatus =
          taskStatus.exitstatus ?? 'UNKNOWN';

        if (exitStatus !== 'OK') {
          throw new Error(
            `Proxmox task failed: ${exitStatus}`,
          );
        }

        setStatusMessage(successMessage);
        await loadSnapshots();
        return;
      }
    }

    throw new Error(
      'Timed out while waiting for the Proxmox task.',
    );
  }

  async function runSnapshotRequest(
    endpoint: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setOperationRunning(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await api.post<{
        ok: boolean;
        upid?: string;
      }>(endpoint, payload);

      const data = response.data;

      if (!data.upid) {
        throw new Error(
          'The backend did not return a Proxmox task ID.',
        );
      }

      setStatusMessage('Proxmox task started...');
      await waitForTask(data.upid, successMessage);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setOperationRunning(false);
    }
  }

  async function createSnapshot() {
    if (!node || !guestType) {
      return;
    }

    const name = snapshotName.trim();

    if (!name) {
      setError('Enter a snapshot name.');
      return;
    }

    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      setError(
        'Snapshot names may only contain letters, numbers, dots, underscores and hyphens.',
      );
      return;
    }

    setCreateOpened(false);

    await runSnapshotRequest(
      '/snapshots/create',
      {
        node,
        guest_type: guestType,
        vmid: guest.vmid,
        name,
        description: description.trim(),
        include_ram:
          guestType === 'qemu' ? includeRam : false,
      },
      `Snapshot "${name}" created successfully.`,
    );

    setSnapshotName('');
    setDescription('');
    setIncludeRam(false);
  }

  async function deleteSnapshot(snapshot: Snapshot) {
    if (!node || !guestType) {
      return;
    }

    const confirmed = window.confirm(
      `Delete snapshot "${snapshot.name}" permanently?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    await runSnapshotRequest(
      '/snapshots/delete',
      {
        node,
        guest_type: guestType,
        vmid: guest.vmid,
        snapshot_name: snapshot.name,
        confirmed: true,
      },
      `Snapshot "${snapshot.name}" deleted successfully.`,
    );
  }

  async function rollbackSnapshot(snapshot: Snapshot) {
    if (!node || !guestType) {
      return;
    }

    const confirmed = window.confirm(
      `Roll back ${guest.name || `Guest ${guest.vmid}`} to snapshot "${snapshot.name}"?\n\nAll changes made after this snapshot will be lost.`,
    );

    if (!confirmed) {
      return;
    }

    await runSnapshotRequest(
      '/snapshots/rollback',
      {
        node,
        guest_type: guestType,
        vmid: guest.vmid,
        snapshot_name: snapshot.name,
        confirmed: true,
      },
      `Guest rolled back to snapshot "${snapshot.name}".`,
    );
  }

  useEffect(() => {
    if (opened) {
      void loadSnapshots();
    }
  }, [opened]);

  return (
    <>
      <OperatorButton
        variant="light"
        color="cyan"
        leftSection={<IconCamera size={16} />}
        disabled={!canManage}
        permissionTooltip="Operator or administrator permissions required to manage snapshots."
        onClick={() => setOpened(true)}
      >
        Snapshots
        {(guest.snapshot_count ?? 0) > 0
          ? ` (${guest.snapshot_count})`
          : ''}
      </OperatorButton>

      <Modal
        opened={opened}
        onClose={() => {
          if (!operationRunning) {
            setOpened(false);
          }
        }}
        title={`Snapshots — ${
          guest.name || `Guest ${guest.vmid}`
        }`}
        size="lg"
        centered
        closeOnClickOutside={!operationRunning}
        closeOnEscape={!operationRunning}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {guestType === 'qemu' ? 'VM' : 'LXC'}{' '}
              {guest.vmid} · {node}
            </Text>

            <Group gap="xs">
              <Button
                variant="default"
                leftSection={<IconRefresh size={16} />}
                loading={loading}
                disabled={operationRunning}
                onClick={() => void loadSnapshots()}
              >
                Refresh
              </Button>

              <OperatorButton
                leftSection={<IconCamera size={16} />}
                disabled={operationRunning}
                permissionTooltip="Operator or administrator permissions required to create snapshots."
                onClick={() => {
                  setError(null);
                  setCreateOpened(true);
                }}
              >
                Create snapshot
              </OperatorButton>
            </Group>
          </Group>

          {error && (
            <Alert
              color="red"
              icon={<IconAlertTriangle size={18} />}
              title="Snapshot operation failed"
            >
              {error}
            </Alert>
          )}

          {statusMessage && (
            <Alert color="blue" title="Snapshot task">
              {operationRunning && (
                <Loader size="xs" mr="sm" />
              )}
              {statusMessage}
            </Alert>
          )}

          <Divider />

          {loading && snapshots.length === 0 ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : snapshots.length === 0 ? (
            <Paper withBorder p="lg" radius="md">
              <Stack align="center" gap="xs">
                <IconCamera size={30} />
                <Text fw={600}>No snapshots available</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Create the first snapshot for this guest.
                </Text>
              </Stack>
            </Paper>
          ) : (
            <Stack gap="sm">
              {snapshots.map((snapshot) => (
                <Paper
                  key={snapshot.name}
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Stack gap="sm">
                    <Group
                      justify="space-between"
                      align="flex-start"
                    >
                      <div>
                        <Group gap="xs">
                          <IconCamera size={18} />

                          <Text fw={700}>
                            {snapshot.name}
                          </Text>

                          {snapshot.includes_ram && (
                            <Badge
                              color="violet"
                              variant="light"
                            >
                              RAM included
                            </Badge>
                          )}
                        </Group>

                        <Text
                          size="xs"
                          c="dimmed"
                          mt={4}
                        >
                          {formatDate(snapshot.created_at)}
                        </Text>
                      </div>

                      {snapshot.parent && (
                        <Badge variant="outline">
                          Parent: {snapshot.parent}
                        </Badge>
                      )}
                    </Group>

                    {snapshot.description && (
                      <Text size="sm">
                        {snapshot.description}
                      </Text>
                    )}

                    <Group justify="flex-end">
                      <OperatorButton
                        variant="light"
                        color="orange"
                        leftSection={
                          <IconRestore size={16} />
                        }
                        disabled={operationRunning}
                        permissionTooltip="Operator or administrator permissions required to roll back snapshots."
                        onClick={() =>
                          void rollbackSnapshot(snapshot)
                        }
                      >
                        Rollback
                      </OperatorButton>

                      <OperatorButton
                        variant="light"
                        color="red"
                        leftSection={
                          <IconTrash size={16} />
                        }
                        disabled={operationRunning}
                        permissionTooltip="Operator or administrator permissions required to delete snapshots."
                        onClick={() =>
                          void deleteSnapshot(snapshot)
                        }
                      >
                        Delete
                      </OperatorButton>
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={createOpened}
        onClose={() => {
          if (!operationRunning) {
            setCreateOpened(false);
          }
        }}
        title="Create snapshot"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Snapshot name"
            placeholder="before-update"
            description="Letters, numbers, dots, underscores and hyphens only."
            value={snapshotName}
            maxLength={64}
            required
            onChange={(event) =>
              setSnapshotName(event.currentTarget.value)
            }
          />

          <Textarea
            label="Description"
            placeholder="Optional description"
            value={description}
            maxLength={500}
            autosize
            minRows={3}
            onChange={(event) =>
              setDescription(event.currentTarget.value)
            }
          />

          {guestType === 'qemu' && (
            <Checkbox
              label="Include RAM state"
              description="The snapshot also stores the running memory state. This requires additional storage and may take longer."
              checked={includeRam}
              onChange={(event) =>
                setIncludeRam(
                  event.currentTarget.checked,
                )
              }
            />
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setCreateOpened(false)}
            >
              Cancel
            </Button>

            <OperatorButton
              leftSection={<IconCamera size={16} />}
              disabled={!snapshotName.trim()}
              permissionTooltip="Operator or administrator permissions required to create snapshots."
              onClick={() => void createSnapshot()}
            >
              Create snapshot
            </OperatorButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
