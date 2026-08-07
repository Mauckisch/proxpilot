import { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconArchive,
  IconCheck,
  IconDatabase,
} from '@tabler/icons-react';

import {
  type BackupJob,
  type Guest,
  useDashboard,
} from '../hooks/useDashboard';
import { OperatorButton } from './OperatorButton';

type GuestBackupButtonProps = {
  guest: Guest;
};

type GuestBackupResponse = {
  ok: boolean;
  job_id: string;
  node: string;
  guest_type: 'qemu' | 'lxc';
  vmid: number;
  storage?: string;
  mode?: string;
  compress?: string;
};

function retentionText(
  prune?: BackupJob['prune-backups'],
): string {
  if (!prune) {
    return 'Not configured';
  }

  const labels: Record<string, string> = {
    'keep-last': 'last',
    'keep-daily': 'daily',
    'keep-weekly': 'weekly',
    'keep-monthly': 'monthly',
    'keep-yearly': 'yearly',
  };

  const values = Object.entries(prune)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      return `${labels[key] ?? key}: ${value}`;
    });

  return values.length > 0
    ? values.join(', ')
    : 'Not configured';
}

export function GuestBackupButton({
  guest,
}: GuestBackupButtonProps) {
  const dashboard = useDashboard();

  const [opened, setOpened] = useState(false);
  const [selectedJobId, setSelectedJobId] =
    useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const enabledJobs = useMemo(() => {
    return (dashboard.data?.backup_jobs ?? []).filter(
      (job) => Boolean(job.enabled),
    );
  }, [dashboard.data?.backup_jobs]);

  const selectedJob = useMemo(() => {
    return enabledJobs.find(
      (job) => job.id === selectedJobId,
    );
  }, [enabledJobs, selectedJobId]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    if (
      selectedJobId
      && enabledJobs.some((job) => job.id === selectedJobId)
    ) {
      return;
    }

    setSelectedJobId(
      enabledJobs.length === 1
        ? enabledJobs[0].id
        : null,
    );
  }, [enabledJobs, opened, selectedJobId]);

  function closeModal(): void {
    if (submitting) {
      return;
    }

    setOpened(false);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  async function startBackup(): Promise<void> {
    if (!selectedJob || !guest.node) {
      return;
    }

    setSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/backup/guest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: selectedJob.id,
          node: guest.node,
          guest_type: guest.type,
          vmid: guest.vmid,
          confirmed: true,
        }),
      });

      const result = await response
        .json()
        .catch(() => null) as
          | GuestBackupResponse
          | { detail?: string }
          | null;

      if (!response.ok) {
        const detail =
          result
          && typeof result === 'object'
          && 'detail' in result
          && result.detail
            ? result.detail
            : `Backup start failed with HTTP ${response.status}.`;

        throw new Error(String(detail));
      }

      setSuccessMessage(
        `Backup for ${guest.name || `VMID ${guest.vmid}`} `
        + `was started on ${guest.node}.`,
      );

      await dashboard.refetch();

      window.setTimeout(() => {
        void dashboard.refetch();
      }, 2500);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The backup could not be started.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const guestTypeLabel =
    guest.type === 'qemu' ? 'Virtual machine' : 'LXC container';

  return (
    <>
      <OperatorButton
        variant="light"
        color="indigo"
        leftSection={<IconArchive size={16} />}
        permissionTooltip="Operator or administrator permissions required to start guest backups."
        onClick={() => setOpened(true)}
      >
        Backup
      </OperatorButton>

      <Modal
        opened={opened}
        onClose={closeModal}
        title="Backup guest"
        centered
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700}>
                  {guest.name || `Guest ${guest.vmid}`}
                </Text>

                <Text size="sm" c="dimmed">
                  {guestTypeLabel} · VMID {guest.vmid}
                </Text>

                <Text size="sm" c="dimmed">
                  Node: {guest.node || 'Unknown'}
                </Text>
              </div>

              <Badge
                color={
                  guest.status?.toLowerCase() === 'running'
                    ? 'green'
                    : 'gray'
                }
                variant="light"
              >
                {guest.status || 'Unknown'}
              </Badge>
            </Group>
          </Paper>

          {dashboard.isLoading ? (
            <Text size="sm" c="dimmed">
              Loading backup jobs…
            </Text>
          ) : enabledJobs.length === 0 ? (
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={20} />}
              title="No enabled backup job"
            >
              At least one enabled Proxmox backup job is
              required before an individual guest backup can
              be started.
            </Alert>
          ) : (
            <Select
              label="Backup job"
              description={
                enabledJobs.length > 1
                  ? 'Select the configuration that should be used.'
                  : 'The available backup job has been selected automatically.'
              }
              placeholder="Select backup job"
              value={selectedJobId}
              onChange={setSelectedJobId}
              allowDeselect={enabledJobs.length > 1}
              data={enabledJobs.map((job) => ({
                value: job.id,
                label: `${job.id} · ${job.storage || 'Unknown storage'}`,
              }))}
              leftSection={<IconDatabase size={16} />}
              disabled={submitting}
            />
          )}

          {selectedJob && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Paper withBorder p="sm" radius="md">
                  <Text size="xs" c="dimmed">
                    Storage
                  </Text>

                  <Text fw={600}>
                    {selectedJob.storage || 'Unknown'}
                  </Text>
                </Paper>

                <Paper withBorder p="sm" radius="md">
                  <Text size="xs" c="dimmed">
                    Mode
                  </Text>

                  <Text fw={600}>
                    {selectedJob.mode || 'snapshot'}
                  </Text>
                </Paper>

                <Paper withBorder p="sm" radius="md">
                  <Text size="xs" c="dimmed">
                    Compression
                  </Text>

                  <Text fw={600}>
                    {selectedJob.compress || 'zstd'}
                  </Text>
                </Paper>

                <Paper withBorder p="sm" radius="md">
                  <Text size="xs" c="dimmed">
                    Retention
                  </Text>

                  <Text fw={600}>
                    {retentionText(
                      selectedJob['prune-backups'],
                    )}
                  </Text>
                </Paper>
              </SimpleGrid>

              {selectedJob['notes-template'] && (
                <Alert
                  color="blue"
                  icon={<IconDatabase size={20} />}
                  title="Backup notes"
                >
                  The notes template configured in this backup
                  job will also be used for this individual
                  backup.
                </Alert>
              )}
            </>
          )}

          {successMessage && (
            <Alert
              color="green"
              icon={<IconCheck size={20} />}
              title="Backup started"
            >
              {successMessage}
            </Alert>
          )}

          {errorMessage && (
            <Alert
              color="red"
              icon={<IconAlertCircle size={20} />}
              title="Unable to start backup"
            >
              {errorMessage}
            </Alert>
          )}

          <Divider />

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={closeModal}
              disabled={submitting}
            >
              {successMessage ? 'Close' : 'Cancel'}
            </Button>

            <OperatorButton
              color="indigo"
              leftSection={<IconArchive size={16} />}
              loading={submitting}
              disabled={
                !selectedJob
                || !guest.node
                || enabledJobs.length === 0
                || Boolean(successMessage)
              }
              permissionTooltip="Operator or administrator permissions required to start guest backups."
              onClick={() => void startBackup()}
            >
              Start backup
            </OperatorButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
