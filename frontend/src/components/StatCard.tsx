import { Card, Group, Progress, Stack, Text, ThemeIcon } from '@mantine/core';
import type { TablerIcon } from '@tabler/icons-react';

type StatCardProps = {
  label: string;
  value: string;
  description: string;
  progress?: number;
  icon: TablerIcon;
};

export function StatCard({
  label,
  value,
  description,
  progress,
  icon: Icon,
}: StatCardProps) {
  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed">
              {label}
            </Text>

            <Text fw={700} size="xl">
              {value}
            </Text>
          </div>

          <ThemeIcon variant="light" size="lg" radius="md">
            <Icon size={20} />
          </ThemeIcon>
        </Group>

        {progress !== undefined && (
          <Progress value={progress} radius="xl" size="sm" />
        )}

        <Text size="xs" c="dimmed">
          {description}
        </Text>
      </Stack>
    </Card>
  );
}
