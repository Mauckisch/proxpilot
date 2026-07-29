import {
  Badge,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconActivity,
  IconCpu,
  IconDatabase,
  IconServer,
  IconUsers,
} from '@tabler/icons-react';

import { NodeCard } from '../components/NodeCard';
import { StatCard } from '../components/StatCard';

const nodes = [
  {
    name: 'pve',
    address: '192.168.123.254',
    cpu: 14,
    ram: 41,
    storage: 48,
    uptime: '23 days',
    updates: 0,
  },
  {
    name: 'pve2',
    address: '192.168.123.253',
    cpu: 7,
    ram: 34,
    storage: 51,
    uptime: '18 days',
    updates: 4,
  },
  {
    name: 'pve3',
    address: '192.168.123.252',
    cpu: 11,
    ram: 29,
    storage: 39,
    uptime: '18 days',
    updates: 2,
  },
];

export function DashboardPage() {
  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Homelab overview</Title>
          <Text c="dimmed">
            Current health and resource usage of your Proxmox cluster.
          </Text>
        </div>

        <Badge color="green" size="lg" variant="light">
          Cluster healthy
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }}>
        <StatCard
          label="Nodes"
          value="3 / 3"
          description="All cluster nodes online"
          icon={IconServer}
        />

        <StatCard
          label="Guests"
          value="8"
          description="6 VMs and 2 containers"
          icon={IconUsers}
        />

        <StatCard
          label="CPU"
          value="11 %"
          description="Cluster average"
          progress={11}
          icon={IconCpu}
        />

        <StatCard
          label="Memory"
          value="35 %"
          description="Cluster average"
          progress={35}
          icon={IconActivity}
        />

        <StatCard
          label="Storage"
          value="46 %"
          description="Across configured storage"
          progress={46}
          icon={IconDatabase}
        />
      </SimpleGrid>

      <div>
        <Title order={3} mb="md">
          Nodes
        </Title>

        <Grid>
          {nodes.map((node) => (
            <Grid.Col key={node.name} span={{ base: 12, xl: 6 }}>
              <NodeCard {...node} />
            </Grid.Col>
          ))}
        </Grid>
      </div>
    </Stack>
  );
}
