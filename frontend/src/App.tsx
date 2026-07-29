import { useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconActivity,
  IconAdjustments,
  IconBuildingWarehouse,
  IconDashboard,
  IconMoon,
  IconServer,
  IconSettings,
  IconStack2,
  IconSun,
  IconUsers,
} from '@tabler/icons-react';

import { DashboardPage } from './pages/DashboardPage';
import { ActivityPanel } from './components/ActivityPanel';

type NavigationItem = {
  label: string;
  icon: typeof IconDashboard;
};

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: IconDashboard },
  { label: 'Nodes', icon: IconServer },
  { label: 'Guests', icon: IconUsers },
  { label: 'Storage', icon: IconBuildingWarehouse },
  { label: 'Cluster', icon: IconStack2 },
  { label: 'Tasks', icon: IconActivity },
  { label: 'Settings', icon: IconSettings },
];

export default function App() {
  const [mobileOpened, mobileHandlers] = useDisclosure();
  const [navbarCollapsed, navbarHandlers] = useDisclosure(false);
  const [activeNavigation, setActiveNavigation] = useState('Dashboard');
  const [darkMode, setDarkMode] = useState(true);

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
        collapsed: { desktop: false, mobile: true },
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
              onClick={navbarHandlers.toggle}
              visibleFrom="sm"
              size="sm"
            />

            <Group gap="sm">
              <Avatar radius="md" color="blue">
                P
              </Avatar>

              <div>
                <Title order={3}>ProxPilot</Title>
                <Text size="xs" c="dimmed">
                  Proxmox Homelab Control
                </Text>
              </div>
            </Group>
          </Group>

          <Group>
            <Badge color="green" variant="light" size="lg">
              Cluster online
            </Badge>

            <Tooltip label={darkMode ? 'Light mode' : 'Dark mode'}>
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={() => setDarkMode((value) => !value)}
              >
                {darkMode ? <IconSun size={19} /> : <IconMoon size={19} />}
              </ActionIcon>
            </Tooltip>

            <Avatar radius="xl" color="gray">
              DM
            </Avatar>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            {navigationItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.label}
                  active={activeNavigation === item.label}
                  label={navbarCollapsed ? undefined : item.label}
                  leftSection={<Icon size={20} stroke={1.7} />}
                  onClick={() => {
                    setActiveNavigation(item.label);
                    mobileHandlers.close();
                  }}
                  styles={{
                    root: {
                      borderRadius: 'var(--mantine-radius-md)',
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
              <Group gap="xs">
                <IconAdjustments size={16} />
                <Text size="xs" c="dimmed">
                  ProxPilot v1.0 alpha
                </Text>
              </Group>

              <Text size="xs" c="dimmed">
                Connected to 3 nodes
              </Text>
            </Stack>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {activeNavigation === 'Dashboard' ? (
          <DashboardPage />
        ) : (
          <Stack>
            <Title order={2}>{activeNavigation}</Title>
            <Text c="dimmed">
              Dieses Modul wird im nächsten Schritt umgesetzt.
            </Text>
          </Stack>
        )}
      </AppShell.Main>

      <AppShell.Aside p="md">
        <ActivityPanel />
      </AppShell.Aside>
    </AppShell>
  );
}
