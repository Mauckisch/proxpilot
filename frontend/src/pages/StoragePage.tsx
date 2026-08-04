import {
  useMemo,
  useState,
} from 'react';

import {
  Alert,
  Badge,
  Button,
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
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';

import {
  StorageCard,
} from '../components/StorageCard';
import {
  useDashboard,
} from '../hooks/useDashboard';
import {
  compareNaturalNames,
  sortNodes,
} from '../utils/sort';

export function StoragePage() {
  const dashboard = useDashboard();

  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] =
    useState<string | null>('all');

  const [statusFilter, setStatusFilter] =
    useState<string | null>('all');

  const [typeFilter, setTypeFilter] =
    useState<string | null>('all');

  const storages =
    dashboard.data?.storages ?? [];

  const nodes = sortNodes(
    dashboard.data?.nodes ?? [],
  );

  const storageTypes = useMemo(() => {
    return Array.from(
      new Set(
        storages
          .map((storage) => storage.plugintype)
          .filter(
            (
              value,
            ): value is string => Boolean(value),
          ),
      ),
    ).sort();
  }, [storages]);

  const filteredStorages = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return storages
      .filter((storage) => {
        const name =
          storage.storage
          ?? storage.id
          ?? '';

        const matchesSearch =
          !query
          || `${name} ${storage.node ?? ''} ${
            storage.plugintype ?? ''
          } ${storage.content ?? ''}`
            .toLowerCase()
            .includes(query);

        const matchesNode =
          nodeFilter === 'all'
          || storage.node === nodeFilter;

        const status =
          storage.status?.toLowerCase()
          ?? 'unknown';

        const isOnline =
          status === 'available'
          || status === 'online';

        const matchesStatus =
          statusFilter === 'all'
          || (
            statusFilter === 'online'
            && isOnline
          )
          || (
            statusFilter === 'offline'
            && !isOnline
          );

        const matchesType =
          typeFilter === 'all'
          || storage.plugintype === typeFilter;

        return (
          matchesSearch
          && matchesNode
          && matchesStatus
          && matchesType
        );
      })
      .sort((first, second) => {
        const firstNode =
          first.node ?? '';

        const secondNode =
          second.node ?? '';

        const nodeComparison =
          compareNaturalNames(
            firstNode,
            secondNode,
          );

        if (nodeComparison !== 0) {
          return nodeComparison;
        }

        return compareNaturalNames(
          first.storage
            ?? first.id
            ?? '',
          second.storage
            ?? second.id
            ?? '',
        );
      });
  }, [
    nodeFilter,
    search,
    statusFilter,
    storages,
    typeFilter,
  ]);

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading storage information...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'Storage information could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load storages"
      >
        {message}
      </Alert>
    );
  }

  const onlineStorages =
    storages.filter((storage) => {
      const status =
        storage.status?.toLowerCase();

      return (
        status === 'available'
        || status === 'online'
      );
    }).length;

  const sharedStorages =
    storages.filter(
      (storage) => storage.shared === 1,
    ).length;

  const hasFilters =
    search.length > 0
    || nodeFilter !== 'all'
    || statusFilter !== 'all'
    || typeFilter !== 'all';

  return (
    <Stack gap="xl">
      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>Storage</Title>

          <Text c="dimmed" mt={4}>
            Capacity and availability of Proxmox storages
          </Text>
        </div>

        <Group gap="xs">
          <Badge
            color="green"
            variant="light"
            size="lg"
          >
            {onlineStorages} online
          </Badge>

          <Badge
            color="violet"
            variant="light"
            size="lg"
          >
            {sharedStorages} shared
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

      <Group align="flex-end">
        <TextInput
          label="Search"
          placeholder="Storage, node, type or content"
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
          label="Node"
          value={nodeFilter}
          onChange={setNodeFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All nodes',
            },
            ...nodes.map((node) => ({
              value: node.node,
              label: node.node,
            })),
          ]}
          w={180}
        />

        <Select
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All statuses',
            },
            {
              value: 'online',
              label: 'Online',
            },
            {
              value: 'offline',
              label: 'Offline',
            },
          ]}
          w={180}
        />

        <Select
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          allowDeselect={false}
          data={[
            {
              value: 'all',
              label: 'All types',
            },
            ...storageTypes.map((type) => ({
              value: type,
              label: type,
            })),
          ]}
          w={180}
        />

        {hasFilters && (
          <Button
            variant="subtle"
            onClick={() => {
              setSearch('');
              setNodeFilter('all');
              setStatusFilter('all');
              setTypeFilter('all');
            }}
          >
            Reset
          </Button>
        )}
      </Group>

      <Text size="sm" c="dimmed">
        Showing {filteredStorages.length} of{' '}
        {storages.length} storages
      </Text>

      {filteredStorages.length === 0 ? (
        <Alert
          color="blue"
          icon={
            <IconAlertCircle size={20} />
          }
          title="No storages found"
        >
          No storage resources match the
          selected filters.
        </Alert>
      ) : (
        <SimpleGrid
          cols={{
            base: 1,
            md: 2,
            xl: 3,
          }}
        >
          {filteredStorages.map(
            (storage, index) => (
              <StorageCard
                key={
                  storage.id
                  ?? `${storage.node}-${
                    storage.storage
                  }-${index}`
                }
                storage={storage}
              />
            ),
          )}
        </SimpleGrid>
      )}
    </Stack>
  );
}
