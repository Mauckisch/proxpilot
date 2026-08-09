import {
  Group,
  Text,
} from '@mantine/core';

import {
  getInfrastructureHealthColor,
  type InfrastructureHealth,
} from '../utils/infrastructureHealth';

type InfrastructureSelectOptionProps = {
  label: string;
  health: InfrastructureHealth;
};

export function InfrastructureSelectOption({
  label,
  health,
}: InfrastructureSelectOptionProps) {
  return (
    <Group
      gap="xs"
      wrap="nowrap"
    >
      <Text
        c={getInfrastructureHealthColor(
          health,
        )}
        fw={600}
        size="sm"
      >
        ●
      </Text>

      <Text size="sm">
        {label}
      </Text>
    </Group>
  );
}
