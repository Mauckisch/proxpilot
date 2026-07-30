import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import {
  getGuestActionText,
  getGuestActionTitle,
  type GuestConfirmState,
} from '../hooks/useGuestActions';

type GuestActionModalProps = {
  confirmState: GuestConfirmState;
  actionRunning: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function GuestActionModal({
  confirmState,
  actionRunning,
  onClose,
  onConfirm,
}: GuestActionModalProps) {
  const destructive =
    confirmState?.action === 'stop';

  return (
    <Modal
      opened={confirmState !== null}
      onClose={onClose}
      title={
        confirmState
          ? `${getGuestActionTitle(confirmState.action)}: ${
              confirmState.guest.name ||
              confirmState.guest.vmid
            }`
          : ''
      }
      centered
      closeOnClickOutside={!actionRunning}
      closeOnEscape={!actionRunning}
    >
      <Stack>
        {confirmState && (
          <Text>
            {getGuestActionText(
              confirmState.guest,
              confirmState.action,
            )}
          </Text>
        )}

        {destructive && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={18} />}
            title="Possible data loss"
          >
            The guest will be stopped immediately
            without a graceful operating-system shutdown.
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
