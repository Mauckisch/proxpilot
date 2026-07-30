import {
  Card,
  Divider,
  Stack,
} from '@mantine/core';

import type { Guest } from '../hooks/useDashboard';

import {
  GuestCardActions,
  type GuestAction,
} from './GuestCardActions';

import { GuestCardHeader } from './GuestCardHeader';
import { GuestTags } from './GuestTags';
import { GuestUsage } from './GuestUsage';

export type { GuestAction } from './GuestCardActions';

type GuestCardProps = {
  guest: Guest;
  actionRunning: boolean;
  onAction: (
    guest: Guest,
    action: GuestAction,
  ) => void;
  onOpenDetails: (guest: Guest) => void;
};

export function GuestCard({
  guest,
  actionRunning,
  onAction,
  onOpenDetails,
}: GuestCardProps) {
  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      h="100%"
    >
      <Stack
        gap="md"
        h="100%"
        justify="space-between"
      >
        <Stack gap="md">
          <GuestCardHeader guest={guest} />

          <GuestTags tags={guest.tags} />

          <Divider />

          <GuestUsage guest={guest} />
        </Stack>

        <Stack gap="md">
          <Divider />

          <GuestCardActions
            guest={guest}
            actionRunning={actionRunning}
            onAction={onAction}
            onOpenDetails={onOpenDetails}
          />
        </Stack>
      </Stack>
    </Card>
  );
}
