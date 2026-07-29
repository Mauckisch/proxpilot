import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Menu,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconDots,
  IconPackage,
  IconPower,
  IconRefresh,
  IconServer,
  IconTool,
} from '@tabler/icons-react';

type NodeCardProps = {
  name: string;
  address: string;
  cpu: number;
  ram: number;
  storage: number;
  uptime: string;
  updates: number;
  maintenance?: boolean;
};

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <Stack gap={5}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {label}
        </Text>

        <Text size="xs" fw={600}>
          {value} %
        </Text>
      </Group>

      <Progress value={value} size="sm" radius="xl" />
    </Stack>
  );
}

export function NodeCard({
  name,
  address,
  cpu,
  ram,
  storage,
  uptime,
  updates,
  maintenance = false,
}: NodeCardProps) {
  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon size={44} radius="md" variant="light">
              <IconServer size={24} />
            </ThemeIcon>

            <div>
              <Group gap="xs">
                <Title order={4}>{name}</Title>
                <Badge color="green" variant="dot">
                  Online
                </Badge>
              </Group>

              <Text size="xs" c="dimmed">
                {address}
              </Text>
            </div>
          </Group>

          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Button variant="subtle" px="xs">
                <IconDots size={18} />
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item leftSection={<IconRefresh size={16} />}>
                Refresh node
              </Menu.Item>
              <Menu.Item leftSection={<IconTool size={16} />}>
                Open details
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <SimpleGrid cols={3}>
          <Metric label="CPU" value={cpu} />
          <Metric label="RAM" value={ram} />
          <Metric label="Storage" value={storage} />
        </SimpleGrid>

        <Group justify="space-between">
          <div>
            <Text size="xs" c="dimmed">
              Uptime
            </Text>
            <Text size="sm" fw={600}>
              {uptime}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Updates
            </Text>
            <Badge
              color={updates > 0 ? 'orange' : 'green'}
              variant="light"
            >
              {updates > 0 ? `${updates} available` : 'Up to date'}
            </Badge>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Maintenance
            </Text>
            <Badge
              color={maintenance ? 'orange' : 'gray'}
              variant="light"
            >
              {maintenance ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </Group>

        <Divider />

        <Group grow>
          <Button
            variant="light"
            leftSection={<IconPackage size={16} />}
          >
            Updates
          </Button>

          <Button
            variant="light"
            color="orange"
            leftSection={<IconRefresh size={16} />}
          >
            Reboot
          </Button>

          <Button
            variant="light"
            color="red"
            leftSection={<IconPower size={16} />}
          >
            Shutdown
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
