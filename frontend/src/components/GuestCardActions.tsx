import {
  Button,
  Group,
  SimpleGrid,
  Stack,
} from '@mantine/core';

import {
  IconPlayerPlay,
  IconPower,
  IconRefresh,
  IconSettings,
  IconSquare,
} from '@tabler/icons-react';

import type { Guest } from '../hooks/useDashboard';
import { OperatorButton } from './OperatorButton';
import { GuestBackupButton } from './GuestBackupButton';
import { SnapshotButton } from './SnapshotButton';

export type GuestAction =
  | 'start'
  | 'shutdown'
  | 'reboot'
  | 'stop';

type GuestCardActionsProps = {
  guest: Guest;
  actionRunning: boolean;
  onAction: (
    guest: Guest,
    action: GuestAction,
  ) => void;
  onOpenDetails: (guest: Guest) => void;
};

export function GuestCardActions({
  guest,
  actionRunning,
  onAction,
  onOpenDetails,
}: GuestCardActionsProps) {
  const running =
    guest.status?.toLowerCase() === 'running';

  return (
    <Stack gap="sm">
      <Button
        variant="light"
        color="gray"
        leftSection={<IconSettings size={16} />}
        onClick={() => onOpenDetails(guest)}
        fullWidth
      >
        Details & migration
      </Button>

      <SimpleGrid cols={2} spacing="sm">
        <SnapshotButton guest={guest} />
        <GuestBackupButton guest={guest} />
      </SimpleGrid>

      {running ? (
        <Stack gap="sm">
          <Group grow>
            <OperatorButton
              variant="light"
              color="orange"
              leftSection={<IconPower size={16} />}
              disabled={actionRunning}
              onClick={() =>
                onAction(guest, 'shutdown')
              }
            >
              Shutdown
            </OperatorButton>

            <OperatorButton
              variant="light"
              color="blue"
              leftSection={<IconRefresh size={16} />}
              disabled={actionRunning}
              onClick={() =>
                onAction(guest, 'reboot')
              }
            >
              Reboot
            </OperatorButton>
          </Group>

          <OperatorButton
            variant="light"
            color="red"
            leftSection={<IconSquare size={16} />}
            disabled={actionRunning}
            onClick={() =>
              onAction(guest, 'stop')
            }
            fullWidth
          >
            Force stop
          </OperatorButton>
        </Stack>
      ) : (
        <OperatorButton
          variant="light"
          color="green"
          leftSection={<IconPlayerPlay size={16} />}
          disabled={actionRunning}
          onClick={() =>
            onAction(guest, 'start')
          }
          fullWidth
        >
          Start
        </OperatorButton>
      )}
    </Stack>
  );
}
