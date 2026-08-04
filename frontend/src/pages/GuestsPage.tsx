import { useMemo, useState } from 'react';

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

import { GuestActionModal } from '../components/GuestActionModal';
import { GuestCard } from '../components/GuestCard';
import { GuestDetailsDrawer } from '../components/GuestDetailsDrawer';
import {
  type Guest,
  useDashboard,
} from '../hooks/useDashboard';
import { useGuestActions } from '../hooks/useGuestActions';
import {
  compareNaturalNames,
  sortNodes,
} from '../utils/sort';

export function GuestsPage() {
  const dashboard = useDashboard();

  const guestActions = useGuestActions(
    async () => {
      await dashboard.refetch();
    },
  );

  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] =
    useState<string | null>('all');
  const [typeFilter, setTypeFilter] =
    useState<string | null>('all');
  const [statusFilter, setStatusFilter] =
    useState<string | null>('all');
  const [selectedGuest, setSelectedGuest] =
    useState<Guest | null>(null);

  const guests = dashboard.data?.guests ?? [];
  const nodes = sortNodes(
    dashboard.data?.nodes ?? [],
  );

  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return guests
      .filter((guest) => {
        const matchesSearch =
          query.length === 0 ||
          `${guest.name ?? ''} ${guest.vmid} ${
            guest.node ?? ''
          } ${guest.tags ?? ''}`
            .toLowerCase()
            .includes(query);

        const matchesNode =
          nodeFilter === 'all' ||
          guest.node === nodeFilter;

        const matchesType =
          typeFilter === 'all' ||
          guest.type === typeFilter;

        const matchesStatus =
          statusFilter === 'all' ||
          guest.status === statusFilter;

        return (
          matchesSearch &&
          matchesNode &&
          matchesType &&
          matchesStatus
        );
      })
      .sort((a, b) => {
        const nodeCompare =
          compareNaturalNames(
            a.node ?? '',
            b.node ?? '',
          );

        if (nodeCompare !== 0) {
          return nodeCompare;
        }

        return a.vmid - b.vmid;
      });
  }, [
    guests,
    nodeFilter,
    search,
    statusFilter,
    typeFilter,
  ]);

  if (dashboard.isLoading) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="sm">
          <Loader size="lg" />

          <Text c="dimmed">
            Loading virtual machines and containers...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (dashboard.isError) {
    const message =
      dashboard.error instanceof Error
        ? dashboard.error.message
        : 'The guest data could not be loaded.';

    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={20} />}
        title="Unable to load guests"
      >
        {message}
      </Alert>
    );
  }

  const runningGuests = guests.filter(
    (guest) =>
      guest.status?.toLowerCase() === 'running',
  ).length;

  const vmCount = guests.filter(
    (guest) => guest.type === 'qemu',
  ).length;

  const lxcCount = guests.filter(
    (guest) => guest.type === 'lxc',
  ).length;

  const nodeOptions = [
    {
      value: 'all',
      label: 'All nodes',
    },
    ...nodes.map((node) => ({
      value: node.node,
      label: node.node,
    })),
  ];

  return (
    <>
      <Stack gap="xl">
        <Group
          justify="space-between"
          align="flex-end"
        >
          <div>
            <Title order={2}>Guests</Title>

            <Text c="dimmed" mt={4}>
              Manage all virtual machines and Linux
              containers
            </Text>
          </div>

          <Group gap="xs">
            <Badge
              color="green"
              variant="light"
              size="lg"
            >
              {runningGuests} running
            </Badge>

            <Badge
              color="blue"
              variant="light"
              size="lg"
            >
              {vmCount} VMs
            </Badge>

            <Badge
              color="violet"
              variant="light"
              size="lg"
            >
              {lxcCount} LXC
            </Badge>

            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
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
            lg: 4,
          }}
        >
          <TextInput
            label="Search"
            placeholder="Name, VMID, node or tag"
            value={search}
            onChange={(event) =>
              setSearch(event.currentTarget.value)
            }
            leftSection={<IconSearch size={16} />}
          />

          <Select
            label="Node"
            data={nodeOptions}
            value={nodeFilter}
            onChange={setNodeFilter}
            allowDeselect={false}
          />

          <Select
            label="Type"
            data={[
              {
                value: 'all',
                label: 'VM and LXC',
              },
              {
                value: 'qemu',
                label: 'Virtual machines',
              },
              {
                value: 'lxc',
                label: 'Linux containers',
              },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
            allowDeselect={false}
          />

          <Select
            label="Status"
            data={[
              {
                value: 'all',
                label: 'All statuses',
              },
              {
                value: 'running',
                label: 'Running',
              },
              {
                value: 'stopped',
                label: 'Stopped',
              },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            allowDeselect={false}
          />
        </SimpleGrid>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Showing {filteredGuests.length} of{' '}
            {guests.length} guests
          </Text>

          {(search ||
            nodeFilter !== 'all' ||
            typeFilter !== 'all' ||
            statusFilter !== 'all') && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => {
                setSearch('');
                setNodeFilter('all');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
            >
              Reset filters
            </Button>
          )}
        </Group>

        {filteredGuests.length === 0 ? (
          <Alert
            color="yellow"
            icon={<IconAlertCircle size={20} />}
            title="No guests found"
          >
            No virtual machines or containers match the
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
            {filteredGuests.map((guest) => (
              <GuestCard
                key={`${guest.node}-${guest.type}-${guest.vmid}`}
                guest={guest}
                actionRunning={
                  guestActions.actionRunning
                }
                onAction={
                  guestActions.requestAction
                }
                onOpenDetails={setSelectedGuest}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <GuestActionModal
        confirmState={guestActions.confirmState}
        actionRunning={guestActions.actionRunning}
        onClose={guestActions.closeConfirmation}
        onConfirm={guestActions.confirmAction}
      />

      <GuestDetailsDrawer
        guest={selectedGuest}
        nodes={nodes}
        opened={selectedGuest !== null}
        onClose={() => setSelectedGuest(null)}
        onMigrationComplete={async () => {
          await dashboard.refetch();
        }}
      />
    </>
  );
}
