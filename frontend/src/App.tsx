import { useEffect, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Group,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import {
  IconActivity,
  IconClipboardList,
  IconArchive,
  IconBuildingWarehouse,
  IconCopy,
  IconDashboard,
  IconInfoCircle,
  IconLogout,
  IconMoon,
  IconNetwork,
  IconServer,
  IconSettings,
  IconStack2,
  IconSun,
  IconUsers,
  IconCalendarTime,
} from '@tabler/icons-react';

import { api } from './api';
import { useAuth } from './auth';
import { DashboardPage } from './pages/DashboardPage';
import { NodesPage } from './pages/NodesPage';
import { HostDetailsPage } from './pages/HostDetailsPage';
import { GuestsPage } from './pages/GuestsPage';
import { TasksPage } from './pages/TasksPage';
import { ClusterPage } from './pages/ClusterPage';
import { StoragePage } from './pages/StoragePage';
import { ReplicationsPage } from './pages/ReplicationsPage';
import { BackupsPage } from './pages/BackupsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { TaskSchedulerPage } from './pages/TaskSchedulerPage';
import { NetworkPage } from './pages/NetworkPage';
import { ActivityPanel } from './components/ActivityPanel';
import { AboutDialog } from './components/AboutDialog';
import { useDashboard } from './hooks/useDashboard';

type NavigationItem = {
  label: string;
  icon: typeof IconDashboard;
};

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: IconDashboard },
  { label: 'Nodes', icon: IconServer },
  { label: 'Guests', icon: IconUsers },
  { label: 'Storage', icon: IconBuildingWarehouse },
  { label: 'Network', icon: IconNetwork },
  { label: 'Replications', icon: IconCopy },
  { label: 'Backups', icon: IconArchive },
  { label: 'Cluster', icon: IconStack2 },
  { label: 'Tasks', icon: IconActivity },
  { label: 'Task Scheduler', icon: IconCalendarTime },
  { label: 'Audit Log', icon: IconClipboardList },
  { label: 'Users', icon: IconUsers },
  { label: 'Settings', icon: IconSettings },
];

export default function App() {
  const dashboard = useDashboard();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const [mobileOpened, mobileHandlers] = useDisclosure();

  const [aboutOpened, aboutHandlers] = useDisclosure(false);

  const [navbarCollapsed, setNavbarCollapsed] = useState(() => {
    return localStorage.getItem('proxpilot-navbar-collapsed') === 'true';
  });

  const [showActivityPanel, setShowActivityPanel] = useState(() => {
    return localStorage.getItem('proxpilot-activity-panel') !== 'false';
  });

  const [timeFormat, setTimeFormat] =
    useState<'12h' | '24h'>(() => {
      return localStorage.getItem(
        'proxpilot-time-format',
      ) === '12h'
        ? '12h'
        : '24h';
    });

  const [activeNavigation, setActiveNavigation] = useState('Dashboard');

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [selectedTaskId, setSelectedTaskId] =
    useState<string | null>(null);

  const [currentTime, setCurrentTime] =
    useState(() => new Date());

  const browserTimezone =
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone;

  const {
    colorScheme,
    setColorScheme,
  } = useMantineColorScheme();

  const computedColorScheme = useComputedColorScheme('dark');
  const darkMode = computedColorScheme === 'dark';

  const clusterNodes = dashboard.data?.nodes ?? [];

  const onlineNodeCount = clusterNodes.filter(
    (node) => node.status?.toLowerCase() === 'online',
  ).length;

  const totalNodeCount = clusterNodes.length;

  let clusterStatusText = 'Connecting...';
  let clusterStatusColor = 'gray';

  if (dashboard.isError) {
    clusterStatusText = 'Backend offline';
    clusterStatusColor = 'red';
  } else if (!dashboard.isLoading) {
    if (totalNodeCount === 0) {
      clusterStatusText = 'No nodes';
      clusterStatusColor = 'red';
    } else if (onlineNodeCount === totalNodeCount) {
      clusterStatusText = 'Cluster online';
      clusterStatusColor = 'green';
    } else if (onlineNodeCount > 0) {
      clusterStatusText = 'Cluster degraded';
      clusterStatusColor = 'yellow';
    } else {
      clusterStatusText = 'Cluster offline';
      clusterStatusColor = 'red';
    }
  }

  const nodeStatusText = dashboard.isError
    ? 'Backend connection unavailable'
    : dashboard.isLoading
      ? 'Connecting to cluster'
      : `${onlineNodeCount} of ${totalNodeCount} nodes online`;

  useEffect(() => {
    localStorage.setItem(
      'proxpilot-navbar-collapsed',
      String(navbarCollapsed),
    );
  }, [navbarCollapsed]);

  useEffect(() => {
    localStorage.setItem(
      'proxpilot-activity-panel',
      String(showActivityPanel),
    );
  }, [showActivityPanel]);

  useEffect(() => {
    localStorage.setItem(
      'proxpilot-time-format',
      timeFormat,
    );
  }, [timeFormat]);

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date());
    };

    updateClock();

    const millisecondsUntilNextMinute =
      60_000 -
      (
        Date.now()
        % 60_000
      );

    let intervalId:
      | number
      | undefined;

    const timeoutId =
      window.setTimeout(
        () => {
          updateClock();

          intervalId =
            window.setInterval(
              updateClock,
              60_000,
            );
        },
        millisecondsUntilNextMinute,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );

      if (
        intervalId !==
        undefined
      ) {
        window.clearInterval(
          intervalId,
        );
      }
    };
  }, []);

  const formattedClock =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12:
          timeFormat === '12h',
      },
    )
      .format(currentTime)
      .replace(',', '');

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      queryClient.clear();

      window.dispatchEvent(
        new Event('proxpilot-auth-required'),
      );
    }
  }

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: navbarCollapsed ? 82 : 240,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      aside={{
        width: 340,
        breakpoint: 'lg',
        collapsed: {
          desktop: !showActivityPanel,
          mobile: true,
        },
      }}
      padding="lg"
    >
      <AppShell.Header px="lg">
        <Group h="100%" justify="space-between">
          <Group>
            <Burger
              opened={mobileOpened}
              onClick={mobileHandlers.toggle}
              hiddenFrom="sm"
              size="sm"
            />

            <Burger
              opened={!navbarCollapsed}
              onClick={() =>
                setNavbarCollapsed((value) => !value)
              }
              visibleFrom="sm"
              size="sm"
            />

            <Group gap="sm" wrap="nowrap">
              <Image
                src="/branding/proxpilot-icon.svg"
                alt="ProxPilot"
                w={42}
                h={42}
                fit="contain"
              />

              <div>
                <Title order={3}>
                  Prox
                  <Text
                    component="span"
                    inherit
                    c="blue.5"
                  >
                    Pilot
                  </Text>
                </Title>

                <Text size="xs" c="dimmed">
                  Proxmox Homelab Control
                </Text>
              </div>
            </Group>
          </Group>

          <Stack
            gap={0}
            align="center"
            visibleFrom="md"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform:
                'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          >
            <Text
              size="sm"
              fw={600}
              style={{
                fontVariantNumeric:
                  'tabular-nums',
              }}
            >
              {formattedClock}
            </Text>

            <Text
              size="xs"
              c="dimmed"
            >
              {browserTimezone}
            </Text>
          </Stack>

          <Group>
            <Tooltip label={nodeStatusText}>
              <Badge
                color={clusterStatusColor}
                variant="light"
                size="lg"
              >
                {clusterStatusText}
              </Badge>
            </Tooltip>

            <Tooltip
              label={
                darkMode
                  ? 'Light mode'
                  : 'Dark mode'
              }
            >
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={() =>
                  setColorScheme(
                    darkMode ? 'light' : 'dark',
                  )
                }
              >
                {darkMode ? (
                  <IconSun size={19} />
                ) : (
                  <IconMoon size={19} />
                )}
              </ActionIcon>
            </Tooltip>

            <Stack gap={0} align="flex-end" visibleFrom="sm">
              <Text size="sm" fw={600}>
                {user.username}
              </Text>

              <Text size="xs" c="dimmed">
                {user.role === 'admin'
                  ? 'Administrator'
                  : user.role === 'operator'
                    ? 'Operator'
                    : 'Viewer'}
                {' · '}
                {user.source === 'local'
                  ? 'Local'
                  : 'LDAP'}
              </Text>
            </Stack>

            <Tooltip label="Sign out">
              <ActionIcon
                variant="subtle"
                color="red"
                size="lg"
                aria-label="Sign out"
                onClick={() => void logout()}
              >
                <IconLogout size={19} />
              </ActionIcon>
            </Tooltip>

          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section
          grow
          component={ScrollArea}
        >
          <Stack gap={4}>
            {navigationItems
              .filter((item) =>
                item.label !== 'Users' || isAdmin
              )
              .map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.label}
                  active={
                    activeNavigation === item.label
                  }
                  label={
                    navbarCollapsed
                      ? undefined
                      : item.label
                  }
                  leftSection={
                    <Icon
                      size={20}
                      stroke={1.7}
                    />
                  }
                  onClick={() => {
                    setActiveNavigation(item.label);

                    if (item.label === 'Nodes') {
                      setSelectedNode(null);
                    }

                    mobileHandlers.close();
                  }}
                  styles={{
                    root: {
                      borderRadius:
                        'var(--mantine-radius-md)',
                    },
                  }}
                />
              );
            })}
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          {!navbarCollapsed && (
            <Stack gap={4}>
              <UnstyledButton
                onClick={aboutHandlers.open}
                aria-label="Open ProxPilot information"
                style={{
                  borderRadius:
                    'var(--mantine-radius-md)',
                  padding: '6px 8px',
                }}
              >
                <Group gap="xs" wrap="nowrap">
                  <IconInfoCircle
                    size={16}
                    stroke={1.8}
                  />

                  <Text size="xs" c="dimmed">
                    ProxPilot v{__APP_VERSION__}
                  </Text>
                </Group>
              </UnstyledButton>

              <Text size="xs" c="dimmed" px={8}>
                {nodeStatusText}
              </Text>
            </Stack>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {activeNavigation === 'Dashboard' && (
          <DashboardPage
            onOpenNode={(node) => {
              setActiveNavigation('Nodes');
              setSelectedNode(node.node);
            }}
          />
        )}

        {activeNavigation === 'Nodes' &&
          selectedNode === null && (
            <NodesPage
              onOpenNode={(node) =>
                setSelectedNode(node.node)
              }
            />
          )}

        {activeNavigation === 'Nodes' &&
          selectedNode !== null && (
            <HostDetailsPage
              node={selectedNode}
              onBack={() => setSelectedNode(null)}
            />
          )}

        {activeNavigation === 'Guests' && (
          <GuestsPage />
        )}

        {activeNavigation === 'Storage' && (
          <StoragePage />
        )}

        {activeNavigation === 'Network' && (
          <NetworkPage />
        )}

        {activeNavigation === 'Replications' && (
          <ReplicationsPage />
        )}

        {activeNavigation === 'Backups' && (
          <BackupsPage />
        )}

        {activeNavigation === 'Cluster' && (
          <ClusterPage />
        )}

        {activeNavigation === 'Tasks' && (
          <TasksPage
            selectedTaskId={selectedTaskId}
          />
        )}

        {activeNavigation === 'Task Scheduler' && (
          <TaskSchedulerPage
            timeFormat={timeFormat}
          />
        )}

        {activeNavigation === 'Audit Log' && (
          <AuditLogPage />
        )}

        {activeNavigation === 'Users' && isAdmin && (
          <UsersPage />
        )}

        {activeNavigation === 'Settings' && (
          <SettingsPage
            colorScheme={colorScheme}
            onColorSchemeChange={setColorScheme}
            showActivityPanel={showActivityPanel}
            onShowActivityPanelChange={
              setShowActivityPanel
            }
            navbarCollapsed={navbarCollapsed}
            onNavbarCollapsedChange={
              setNavbarCollapsed
            }
            timeFormat={timeFormat}
            onTimeFormatChange={
              setTimeFormat
            }
          />
        )}

        {![
          'Dashboard',
          'Nodes',
          'Guests',
          'Storage',
          'Replications',
          'Backups',
          'Cluster',
          'Tasks',
          'Task Scheduler',
          'Network',
          'Audit Log',
          'Users',
          'Settings',
        ].includes(activeNavigation) && (
          <Stack>
            <Title order={2}>
              {activeNavigation}
            </Title>

            <Text c="dimmed">
              Dieses Modul wird im nächsten
              Schritt umgesetzt.
            </Text>
          </Stack>
        )}
      </AppShell.Main>

      <AppShell.Aside p="md">
        {showActivityPanel && (
          <ActivityPanel
            onOpenTask={(taskId) => {
              setSelectedTaskId(taskId);
              setActiveNavigation('Tasks');
              setSelectedNode(null);
              mobileHandlers.close();
            }}
          />
        )}
      </AppShell.Aside>

      <AboutDialog
        opened={aboutOpened}
        onClose={aboutHandlers.close}
      />
    </AppShell>
  );
}
