import {
  useMemo,
  useState,
} from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowRight,
  IconCopy,
  IconRefresh,
  IconSearch,
  IconServer,
} from '@tabler/icons-react';

import {
  ReplicationCard,
} from '../components/ReplicationCard';
import {
  type Guest,
  useDashboard,
} from '../hooks/useDashboard';

export function ReplicationsPage() {
  const dashboard = useDashboard();

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] =
    useState<string | null>('all');
  const [targetFilter, setTargetFilter] =
    useState<string | null>('all');

  const replications =
    dashboard.data?.replications ?? [];

  const guests =
    dashboard.data?.guests ?? [];

  const nodes =
    dashboard.data?.nodes ?? [];

  const guestByVmid = useMemo(() => {
    const map = new Map<number, Guest>();

    for (const guest of guests) {
      map.set(guest.vmid, guest);
    }

    return map;
  }, [guests]);

  const filteredReplications = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return replications
      .filter((replication) => {
        const guest =
          guestByVmid.get(replication.guest);

        const searchable = [
          replication.id,
          replication.guest,
          guest?.name,
          replication.source,
          replication.target,
          replication.schedule,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesSearch =
          !query || searchable.includes(query);

        const matchesSource =
          sourceFilter === 'all'
          || replication.source === sourceFilter;

        const matchesTarget =
          targetFilter === 'all'
          || replication.target === targetFilter;

        return (
          matchesSearch
          && matchesSource
          && matchesTarget
        );
      })
      .sort((first, second) => {
        if (first.guest !== second.guest) {
          return first.guest - second.guest;
        }

        return (
          (first.jobnum ?? 0)
          - (second.jobnum ?? 0)
        );
      });
  }, [
    guestByVmid,
    replications,
    search,
    sourceFilter,
    targetFilter,
  ]);

  const replicatedGuests = useMemo(() => {
    return new Set(
      replications.map(
        (replication) => replication.guest,
      ),
    ).size;
  }, [replications]);

  const targetsByNode = useMemo(() => {
    const map = new Map<string, number>();

    for (const replication of replications) {
      if (!replication.target) {
        continue;
      }

      map.set(
        replication.target,
        (map.get(replication.target) ?? 0) + 1,
      );
    }

    return map;
  }, [replications]);

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading replication jobs...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'Replication jobs could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load replications"
      >
        {message}
      </Alert>
    );
  }

  const hasFilters =
    search.length > 0
    || sourceFilter !== 'all'
    || targetFilter !== 'all';

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Replications</Title>

          <Text c="dimmed" mt={4}>
            Configured Proxmox ZFS replication jobs
          </Text>
        </div>

        <Group gap="xs">
          <Badge
            size="lg"
            color="blue"
            variant="light"
          >
            {replications.length} jobs
          </Badge>

          <Badge
            size="lg"
            color="violet"
            variant="light"
          >
            {replicatedGuests} guests
          </Badge>

          <Button
            variant="light"
            leftSection={
              <IconRefresh size={16} />
            }
            loading={dashboard.isFetching}
            onClick={() => dashboard.refetch()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <SimpleGrid
        cols={{
          base: 1,
          sm: 2,
          xl: 3,
        }}
      >
        {nodes.map((node) => (
          <Card
            key={node.node}
            withBorder
            radius="md"
            padding="lg"
          >
            <Group justify="space-between">
              <Group gap="sm">
                <IconServer size={22} />

                <div>
                  <Text fw={700}>
                    {node.node}
                  </Text>

                  <Text size="sm" c="dimmed">
                    Replication target
                  </Text>
                </div>
              </Group>

              <Badge
                size="lg"
                color="violet"
                variant="light"
              >
                {targetsByNode.get(node.node) ?? 0}
              </Badge>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Group align="flex-end">
        <TextInput
          label="Search"
          placeholder="Guest, VMID, node or job ID"
          value={search}
          onChange={(event) =>
            setSearch(
              event.currentTarget.value,
            )
          }
          leftSection={
            <IconSearch size={16} />
          }
          style={{ flex: 1 }}
        />

        <Select
          label="Source"
          value={sourceFilter}
          onChange={setSourceFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All source nodes',
            },
            ...nodes.map((node) => ({
              value: node.node,
              label: node.node,
            })),
          ]}
          w={200}
        />

        <Select
          label="Target"
          value={targetFilter}
          onChange={setTargetFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All target nodes',
            },
            ...nodes.map((node) => ({
              value: node.node,
              label: node.node,
            })),
          ]}
          w={200}
        />

        {hasFilters && (
          <Button
            variant="subtle"
            onClick={() => {
              setSearch('');
              setSourceFilter('all');
              setTargetFilter('all');
            }}
          >
            Reset
          </Button>
        )}
      </Group>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Showing {filteredReplications.length} of{' '}
          {replications.length} replication jobs
        </Text>

        <Group gap="xs">
          <IconCopy size={16} />

          <Text size="sm" c="dimmed">
            Source
          </Text>

          <IconArrowRight size={15} />

          <Text size="sm" c="dimmed">
            Target
          </Text>
        </Group>
      </Group>

      {filteredReplications.length === 0 ? (
        <Alert
          color="blue"
          icon={<IconAlertCircle size={20} />}
          title="No replication jobs found"
        >
          No configured replication jobs match
          the selected filters.
        </Alert>
      ) : (
        <SimpleGrid
          cols={{
            base: 1,
            md: 2,
            xl: 3,
          }}
        >
          {filteredReplications.map(
            (replication) => (
              <ReplicationCard
                key={replication.id}
                replication={replication}
                guest={
                  guestByVmid.get(
                    replication.guest,
                  )
                }
              />
            ),
          )}
        </SimpleGrid>
      )}
    </Stack>
  );
}
