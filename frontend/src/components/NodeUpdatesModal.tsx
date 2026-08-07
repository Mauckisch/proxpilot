import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPackage,
} from '@tabler/icons-react';

import type { ClusterNode } from '../hooks/useDashboard';
import type { NodeUpdateStatus } from '../hooks/useUpdates';
import { OperatorButton } from './OperatorButton';

type NodeUpdatesModalProps = {
  node: ClusterNode | null;
  status?: NodeUpdateStatus;
  opened: boolean;
  actionRunning: boolean;
  onClose: () => void;
  onCheckUpdates: (node: ClusterNode) => void;
  onInstallUpdates: (node: ClusterNode) => void;
};

function formatCheckedAt(value: string | null | undefined): string {
  if (!value) {
    return 'Never checked';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function NodeUpdatesModal({
  node,
  status,
  opened,
  actionRunning,
  onClose,
  onCheckUpdates,
  onInstallUpdates,
}: NodeUpdatesModalProps) {
  if (!node) {
    return null;
  }

  const hasUpdates = (status?.updates ?? 0) > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Updates for ${node.node}`}
      size="xl"
      centered
      closeOnClickOutside={!actionRunning}
      closeOnEscape={!actionRunning}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            {!status ? (
              <Badge color="gray" variant="light">
                Not checked
              </Badge>
            ) : hasUpdates ? (
              <Badge
                color="yellow"
                variant="light"
                leftSection={<IconPackage size={12} />}
              >
                {status.updates} updates available
              </Badge>
            ) : (
              <Badge
                color="green"
                variant="light"
                leftSection={<IconCircleCheck size={12} />}
              >
                Up to date
              </Badge>
            )}

            {status?.reboot_required && (
              <Badge
                color="red"
                variant="light"
                leftSection={
                  <IconAlertTriangle size={12} />
                }
              >
                Reboot required
              </Badge>
            )}

            {status?.kernel_update && (
              <Badge color="orange" variant="light">
                Kernel update
              </Badge>
            )}
          </Group>

          <Text size="xs" c="dimmed">
            Last checked: {formatCheckedAt(status?.checked_at)}
          </Text>
        </Group>

        {!status ? (
          <Alert
            color="blue"
            icon={<IconPackage size={18} />}
            title="No update information"
          >
            Run an update check to retrieve the currently
            available packages.
          </Alert>
        ) : status.packages.length === 0 ? (
          <Alert
            color="green"
            icon={<IconCircleCheck size={18} />}
            title="No updates available"
          >
            This node is currently up to date.
          </Alert>
        ) : (
          <ScrollArea h={420}>
            <Table
              striped
              highlightOnHover
              withTableBorder
              withColumnBorders
              verticalSpacing="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Package</Table.Th>
                  <Table.Th>Repository</Table.Th>
                  <Table.Th>Installed version</Table.Th>
                  <Table.Th>Available version</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {status.packages.map((packageUpdate) => (
                  <Table.Tr
                    key={`${packageUpdate.name}-${packageUpdate.available_version}`}
                  >
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {packageUpdate.name}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      <Text size="sm">
                        {packageUpdate.repository}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {packageUpdate.current_version}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {packageUpdate.available_version}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}

        <Group justify="space-between">
          <OperatorButton
            variant="light"
            leftSection={<IconPackage size={16} />}
            disabled={actionRunning}
            permissionTooltip="Operator or administrator permissions required to check for updates."
            onClick={() => onCheckUpdates(node)}
          >
            Check again
          </OperatorButton>

          <Group>
            <Button
              variant="default"
              disabled={actionRunning}
              onClick={onClose}
            >
              Close
            </Button>

            <OperatorButton
              color="yellow"
              leftSection={<IconPackage size={16} />}
              disabled={
                actionRunning ||
                !hasUpdates ||
                node.status?.toLowerCase() !== 'online'
              }
              permissionTooltip="Operator or administrator permissions required to install updates."
              onClick={() => onInstallUpdates(node)}
            >
              Install updates
            </OperatorButton>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
