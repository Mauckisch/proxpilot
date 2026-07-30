import {
  Badge,
  Button,
  Divider,
  Group,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconRefresh,
  IconServer,
} from '@tabler/icons-react';

import type { HostDetails } from '../../hooks/useHostDetails';

type NodeHeaderProps = {
  details: HostDetails;
  refreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export function NodeHeader({
  details,
  refreshing,
  onBack,
  onRefresh,
}: NodeHeaderProps) {
  const system = details.hardware.system;

  return (
    <Group
      justify="space-between"
      align="flex-start"
    >
      <Group align="flex-start">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={18} />}
          onClick={onBack}
        >
          Nodes
        </Button>

        <Divider orientation="vertical" />

        <div>
          <Group gap="xs">
            <IconServer size={28} />

            <Title order={2}>
              {details.overview.hostname}
            </Title>

            <Badge color="green" variant="light">
              Online
            </Badge>
          </Group>

          <Text c="dimmed" mt={4}>
            {details.overview.fqdn ??
              details.node}
            {' · '}
            {system?.product_name ??
              'Unknown hardware'}
          </Text>
        </div>
      </Group>

      <Button
        variant="light"
        leftSection={<IconRefresh size={16} />}
        loading={refreshing}
        onClick={onRefresh}
      >
        Refresh
      </Button>
    </Group>
  );
}
