import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

import {
  getNodeActionText,
  getNodeActionTitle,
  type NodeConfirmState,
} from '../hooks/useNodeActions';

type NodeActionModalProps = {
  confirmState: NodeConfirmState;
  actionRunning: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function NodeActionModal({
  confirmState,
  actionRunning,
  onClose,
  onConfirm,
}: NodeActionModalProps) {
  const title =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? `Enable maintenance on ${confirmState.node.node}`
        : `Disable maintenance on ${confirmState.node.node}`
      : confirmState
        ? `${getNodeActionTitle(confirmState.action)}: ${confirmState.node.node}`
        : '';

  const text =
    confirmState?.kind === 'maintenance'
      ? confirmState.action === 'enable'
        ? 'Enable HA maintenance mode? HA-managed guests may be migrated.'
        : 'Disable HA maintenance mode and return the node to normal operation?'
      : confirmState
        ? getNodeActionText(
            confirmState.action,
            confirmState.node,
          )
        : '';

  const destructive =
    confirmState?.kind === 'node' &&
    ['reboot', 'shutdown'].includes(
      confirmState.action,
    );

  const shutdownWithoutMaintenance =
    confirmState?.kind === 'node' &&
    confirmState.action === 'shutdown' &&
    confirmState.node.infrastructure_type === 'cluster' &&
    !confirmState.node.maintenance;

  return (
    <Modal
      opened={confirmState !== null}
      onClose={onClose}
      title={title}
      centered
      closeOnClickOutside={!actionRunning}
      closeOnEscape={!actionRunning}
    >
      <Stack>
        <Text>{text}</Text>

        {shutdownWithoutMaintenance && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={18} />}
            title="Maintenance mode is not enabled"
          >
            The host will be shut down without
            automatically migrating running guests.
          </Alert>
        )}

        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={actionRunning}
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            color={destructive ? 'red' : 'blue'}
            loading={actionRunning}
            onClick={onConfirm}
          >
            Confirm
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
