import {
  useEffect,
  useState,
} from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  type MantineColorScheme,
} from '@mantine/core';

import {
  IconAdjustments,
  IconAlertCircle,
  IconApi,
  IconBuilding,
  IconCheck,
  IconDeviceFloppy,
  IconLayoutSidebar,
  IconLock,
  IconMail,
  IconPalette,
  IconRefresh,
  IconServer,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';

import {
  InfrastructureSettingsCard,
} from '../components/InfrastructureSettingsCard';

import {
  LdapSettingsCard,
} from '../components/LdapSettingsCard';

import {
  NotificationSettingsCard,
} from '../components/NotificationSettingsCard';

import {
  SystemInformationCard,
} from '../components/SystemInformationCard';

import {
  UsersPage,
} from './UsersPage';

import {
  useAuth,
} from '../auth';


type SettingsPageProps = {
  colorScheme: MantineColorScheme;
  onColorSchemeChange: (
    value: MantineColorScheme,
  ) => void;
  showActivityPanel: boolean;
  onShowActivityPanelChange: (
    value: boolean,
  ) => void;
  navbarCollapsed: boolean;
  onNavbarCollapsedChange: (
    value: boolean,
  ) => void;
  timeFormat: '12h' | '24h';
  onTimeFormatChange: (
    value: '12h' | '24h',
  ) => void;
  isAdmin: boolean;
};


type BackendHealth = {
  status: string;
  version: string;
};


type BackendConfig = {
  refresh_interval: number;
  timezone?: string;
};


type RegionalSettings = {
  timezone: string;
  timezones: string[];
};


type SettingsTab =
  | 'general'
  | 'infrastructure'
  | 'authentication'
  | 'users'
  | 'notifications'
  | 'regional'
  | 'system';


const SETTINGS_TAB_STORAGE_KEY =
  'proxpilot-settings-tab';


function getInitialSettingsTab(): SettingsTab {
  const stored =
    localStorage.getItem(
      SETTINGS_TAB_STORAGE_KEY,
    );

  if (
    stored === 'general' ||
    stored === 'infrastructure' ||
    stored === 'authentication' ||
    stored === 'users' ||
    stored === 'notifications' ||
    stored === 'regional' ||
    stored === 'system'
  ) {
    return stored;
  }

  return 'general';
}


export function SettingsPage({
  colorScheme,
  onColorSchemeChange,
  showActivityPanel,
  onShowActivityPanelChange,
  navbarCollapsed,
  onNavbarCollapsedChange,
  timeFormat,
  onTimeFormatChange,
  isAdmin,
}: SettingsPageProps) {
  const {
    canOperate,
  } = useAuth();

  const [
    activeTab,
    setActiveTab,
  ] = useState<SettingsTab>(
    getInitialSettingsTab,
  );

  const [
    health,
    setHealth,
  ] = useState<BackendHealth | null>(
    null,
  );

  const [
    config,
    setConfig,
  ] = useState<BackendConfig | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    backendError,
    setBackendError,
  ] = useState<string | null>(
    null,
  );

  const [
    timezoneOptions,
    setTimezoneOptions,
  ] = useState<string[]>([]);

  const [
    timezoneName,
    setTimezoneName,
  ] = useState('UTC');

  const [
    timezoneLoading,
    setTimezoneLoading,
  ] = useState(true);

  const [
    timezoneSaving,
    setTimezoneSaving,
  ] = useState(false);

  const [
    timezoneError,
    setTimezoneError,
  ] = useState<string | null>(
    null,
  );

  const [
    timezoneSuccess,
    setTimezoneSuccess,
  ] = useState<string | null>(
    null,
  );


  useEffect(() => {
    if (
      !isAdmin &&
      activeTab === 'users'
    ) {
      setActiveTab('general');
      return;
    }

    localStorage.setItem(
      SETTINGS_TAB_STORAGE_KEY,
      activeTab,
    );
  }, [activeTab, isAdmin]);


  useEffect(() => {
    let cancelled = false;

    async function loadBackendInformation() {
      setLoading(true);
      setBackendError(null);

      try {
        const [
          healthResponse,
          configResponse,
        ] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/config'),
        ]);

        if (!healthResponse.ok) {
          throw new Error(
            (
              'Health endpoint responded ' +
              `mit HTTP ${healthResponse.status}`
            ),
          );
        }

        if (!configResponse.ok) {
          throw new Error(
            (
              'Config endpoint responded ' +
              `mit HTTP ${configResponse.status}`
            ),
          );
        }

        const healthData =
          (
            await healthResponse.json()
          ) as BackendHealth;

        const configData =
          (
            await configResponse.json()
          ) as BackendConfig;

        if (!cancelled) {
          setHealth(
            healthData,
          );

          setConfig(
            configData,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setBackendError(
            error instanceof Error
              ? error.message
              : (
                  'Backend information ' +
                  'could not be loaded.'
                ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBackendInformation();

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;

    async function loadRegionalSettings() {
      setTimezoneLoading(true);
      setTimezoneError(null);

      try {
        const response = await fetch(
          '/api/settings/regional',
        );

        if (!response.ok) {
          throw new Error(
            `Regional settings endpoint responded with HTTP ${response.status}`,
          );
        }

        const data =
          (
            await response.json()
          ) as RegionalSettings;

        if (!cancelled) {
          setTimezoneName(
            data.timezone || 'UTC',
          );
          setTimezoneOptions(
            Array.isArray(data.timezones)
              ? data.timezones
              : [],
          );
        }
      } catch (error) {
        if (!cancelled) {
          setTimezoneError(
            error instanceof Error
              ? error.message
              : 'Regional settings could not be loaded.',
          );
        }
      } finally {
        if (!cancelled) {
          setTimezoneLoading(false);
        }
      }
    }

    void loadRegionalSettings();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);


  useEffect(() => {
    const adminOnlyTabs: SettingsTab[] = [
      'authentication',
      'users',
      'notifications',
      'regional',
    ];

    const operatorOrAdminTabs: SettingsTab[] = [
      'system',
    ];

    const tabDenied =
      (
        adminOnlyTabs.includes(activeTab) &&
        !isAdmin
      ) ||
      (
        operatorOrAdminTabs.includes(activeTab) &&
        !canOperate
      );

    if (tabDenied) {
      setActiveTab('general');

      localStorage.setItem(
        SETTINGS_TAB_STORAGE_KEY,
        'general',
      );
    }
  }, [
    activeTab,
    canOperate,
    isAdmin,
  ]);


  async function saveTimezone() {
    const timezone =
      timezoneName.trim();

    if (!timezone) {
      setTimezoneError(
        'Please enter a timezone.',
      );
      return;
    }

    setTimezoneSaving(true);
    setTimezoneError(null);
    setTimezoneSuccess(null);

    try {
      const response = await fetch(
        '/api/settings/regional',
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            timezone,
          }),
        },
      );

      if (!response.ok) {
        let detail =
          `HTTP ${response.status}`;

        try {
          const data =
            await response.json();

          if (
            data &&
            typeof data.detail === 'string'
          ) {
            detail = data.detail;
          }
        } catch {
          // Keep the HTTP fallback.
        }

        throw new Error(detail);
      }

      const data =
        (
          await response.json()
        ) as RegionalSettings;

      setTimezoneName(
        data.timezone,
      );

      setTimezoneSuccess(
        'Global timezone saved successfully.',
      );
    } catch (error) {
      setTimezoneError(
        error instanceof Error
          ? error.message
          : 'Timezone could not be saved.',
      );
    } finally {
      setTimezoneSaving(false);
    }
  }


  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>
          Settings
        </Title>

        <Text
          c="dimmed"
          mt={4}
        >
          Configure ProxPilot appearance,
          infrastructure and system behavior.
        </Text>
      </div>


      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (
            value === 'general' ||
            value === 'infrastructure' ||
            value === 'authentication' ||
            value === 'users' ||
            value === 'notifications' ||
            value === 'regional' ||
            value === 'system'
          ) {
            setActiveTab(
              value,
            );
          }
        }}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab
            value="general"
            leftSection={
              <IconAdjustments
                size={16}
              />
            }
          >
            General
          </Tabs.Tab>

          <Tabs.Tab
            value="infrastructure"
            leftSection={
              <IconBuilding
                size={16}
              />
            }
          >
            Infrastructure
          </Tabs.Tab>

          {isAdmin && (
            <Tabs.Tab
              value="authentication"
              leftSection={
                <IconLock
                  size={16}
                />
              }
            >
              Authentication
            </Tabs.Tab>
          )}

          {isAdmin && (
            <Tabs.Tab
              value="users"
              leftSection={
                <IconUsers
                  size={16}
                />
              }
            >
              Users
            </Tabs.Tab>
          )}

          {isAdmin && (
            <Tabs.Tab
              value="notifications"
              leftSection={
                <IconMail
                  size={16}
                />
              }
            >
              Notifications
            </Tabs.Tab>
          )}

          {isAdmin && (
            <Tabs.Tab
              value="regional"
              leftSection={
                <IconWorld
                  size={16}
                />
              }
            >
              Regional
            </Tabs.Tab>
          )}

          {canOperate && (
            <Tabs.Tab
              value="system"
              leftSection={
                <IconServer
                  size={16}
                />
              }
            >
              System
            </Tabs.Tab>
          )}
        </Tabs.List>


        <Tabs.Panel
          value="general"
          pt="lg"
        >
          <Stack gap="lg">
            <SimpleGrid
              cols={{
                base: 1,
                xl: 2,
              }}
              spacing="lg"
            >
              <Card
                withBorder
                radius="lg"
                p="lg"
              >
                <Stack gap="lg">
                  <Group>
                    <ThemeIcon
                      variant="light"
                      size="lg"
                    >
                      <IconPalette
                        size={20}
                      />
                    </ThemeIcon>

                    <div>
                      <Text fw={600}>
                        Appearance
                      </Text>

                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        User interface
                        color scheme
                      </Text>
                    </div>
                  </Group>

                  <SegmentedControl
                    fullWidth
                    value={
                      colorScheme
                    }
                    onChange={(
                      value,
                    ) =>
                      onColorSchemeChange(
                        value as
                          MantineColorScheme,
                      )
                    }
                    data={[
                      {
                        label: 'System',
                        value: 'auto',
                      },
                      {
                        label: 'Light',
                        value: 'light',
                      },
                      {
                        label: 'Dark',
                        value: 'dark',
                      },
                    ]}
                  />

                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    When set to "System",
                    ProxPilot follows the operating
                    system color scheme.
                  </Text>
                </Stack>
              </Card>


              <Card
                withBorder
                radius="lg"
                p="lg"
              >
                <Stack gap="lg">
                  <Group>
                    <ThemeIcon
                      variant="light"
                      size="lg"
                    >
                      <IconLayoutSidebar
                        size={20}
                      />
                    </ThemeIcon>

                    <div>
                      <Text fw={600}>
                        Layout
                      </Text>

                      <Text
                        size="sm"
                        c="dimmed"
                      >
                        Navigation and
                        sidebars
                      </Text>
                    </div>
                  </Group>

                  <Switch
                    checked={
                      !navbarCollapsed
                    }
                    onChange={(
                      event,
                    ) =>
                      onNavbarCollapsedChange(
                        !event
                          .currentTarget
                          .checked,
                      )
                    }
                    label={
                      'Show expanded ' +
                      'navigation'
                    }
                    description={
                      'Shows module names in addition ' +
                      'to navigation icons.'
                    }
                  />

                  <Switch
                    checked={
                      showActivityPanel
                    }
                    onChange={(
                      event,
                    ) =>
                      onShowActivityPanelChange(
                        event
                          .currentTarget
                          .checked,
                      )
                    }
                    label={
                      'Show Activity Panel'
                    }
                    description={
                      'Shows running and recently ' +
                      'started ProxPilot actions.'
                    }
                  />
                </Stack>
              </Card>
            </SimpleGrid>


            <Alert
              variant="light"
              icon={
                <IconAdjustments
                  size={18}
                />
              }
              title="Storage"
            >
              Appearance and layout settings
              are stored locally in this browser.
            </Alert>
          </Stack>
        </Tabs.Panel>


        <Tabs.Panel
          value="infrastructure"
          pt="lg"
        >
          <InfrastructureSettingsCard />
        </Tabs.Panel>


        {isAdmin && (
          <Tabs.Panel
            value="authentication"
            pt="lg"
          >
            <LdapSettingsCard />
          </Tabs.Panel>
        )}


        {isAdmin && (
          <Tabs.Panel
            value="users"
            pt="lg"
          >
            <UsersPage />
          </Tabs.Panel>
        )}


        {isAdmin && (
          <Tabs.Panel
            value="notifications"
            pt="lg"
          >
            <NotificationSettingsCard />
          </Tabs.Panel>
        )}


        {isAdmin && (
          <Tabs.Panel
            value="regional"
            pt="lg"
          >
          <Card
            withBorder
            radius="lg"
            p="lg"
          >
            <Stack gap="lg">
              <Group>
                <ThemeIcon
                  variant="light"
                  size="lg"
                >
                  <IconWorld size={20} />
                </ThemeIcon>

                <div>
                  <Text fw={600}>
                    Date and time
                  </Text>

                  <Text
                    size="sm"
                    c="dimmed"
                  >
                    Global timezone and display
                    preferences.
                  </Text>
                </div>
              </Group>

              <SegmentedControl
                fullWidth
                value={timeFormat}
                onChange={(value) =>
                  onTimeFormatChange(
                    value as
                      | '12h'
                      | '24h',
                  )
                }
                data={[
                  {
                    label: '24-hour',
                    value: '24h',
                  },
                  {
                    label: '12-hour',
                    value: '12h',
                  },
                ]}
              />

              <Text
                size="xs"
                c="dimmed"
              >
                The time format is stored
                locally in this browser.
              </Text>

              <Divider />

              <Select
                label="Global timezone"
                description={
                  'IANA timezone used by ProxPilot for global ' +
                  'date and scheduling behavior.'
                }
                placeholder="Select timezone"
                searchable
                clearable={false}
                data={timezoneOptions}
                value={timezoneName}
                disabled={
                  timezoneLoading ||
                  timezoneSaving
                }
                nothingFoundMessage="No timezone found"
                onChange={(value) => {
                  if (value !== null) {
                    setTimezoneName(value);
                    setTimezoneError(null);
                    setTimezoneSuccess(null);
                  }
                }}
              />

              <Text
                size="xs"
                c="dimmed"
              >
                Select the global IANA timezone used
                for scheduling and date calculations.
              </Text>

              {timezoneError && (
                <Alert
                  color="red"
                  icon={
                    <IconAlertCircle
                      size={18}
                    />
                  }
                  title="Timezone configuration failed"
                >
                  {timezoneError}
                </Alert>
              )}

              {timezoneSuccess && (
                <Alert
                  color="green"
                  icon={
                    <IconCheck
                      size={18}
                    />
                  }
                  title="Timezone saved"
                >
                  {timezoneSuccess}
                </Alert>
              )}

              {!isAdmin && (
                <Alert
                  variant="light"
                  icon={
                    <IconWorld size={18} />
                  }
                  title="Administrator setting"
                >
                  The global timezone can only
                  be changed by an administrator.
                </Alert>
              )}

              {isAdmin && (
                <Group justify="flex-start">
                  <Button
                    leftSection={
                      <IconDeviceFloppy
                        size={17}
                      />
                    }
                    loading={timezoneSaving}
                    disabled={timezoneLoading}
                    onClick={() =>
                      void saveTimezone()
                    }
                  >
                    Save timezone
                  </Button>
                </Group>
              )}
            </Stack>
          </Card>
          </Tabs.Panel>
        )}


        {canOperate && (
          <Tabs.Panel
            value="system"
            pt="lg"
          >
          <Stack gap="lg">
            <SystemInformationCard />


            <Card
              withBorder
              radius="lg"
              p="lg"
            >
              <Stack gap="lg">
                <Group>
                  <ThemeIcon
                    variant="light"
                    size="lg"
                  >
                    <IconApi
                      size={20}
                    />
                  </ThemeIcon>

                  <div>
                    <Text fw={600}>
                      Backend
                    </Text>

                    <Text
                      size="sm"
                      c="dimmed"
                    >
                      Status and runtime
                      configuration
                    </Text>
                  </div>
                </Group>

                <Divider />


                {loading && (
                  <SimpleGrid
                    cols={{
                      base: 1,
                      sm: 3,
                    }}
                  >
                    <Skeleton
                      height={64}
                      radius="md"
                    />

                    <Skeleton
                      height={64}
                      radius="md"
                    />

                    <Skeleton
                      height={64}
                      radius="md"
                    />
                  </SimpleGrid>
                )}


                {!loading &&
                  backendError && (
                    <Alert
                      color="red"
                      icon={
                        <IconAlertCircle
                          size={18}
                        />
                      }
                      title={
                        'Backend ' +
                        'unavailable'
                      }
                    >
                      {backendError}
                    </Alert>
                  )}


                {!loading &&
                  !backendError && (
                    <SimpleGrid
                      cols={{
                        base: 1,
                        sm: 2,
                        lg: 4,
                      }}
                    >
                      <Card
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Group
                          justify="space-between"
                          align="flex-start"
                        >
                          <div>
                            <Text
                              size="xs"
                              c="dimmed"
                            >
                              Status
                            </Text>

                            <Text
                              fw={600}
                              mt={4}
                            >
                              Backend
                              available
                            </Text>
                          </div>

                          <Badge
                            color="green"
                            variant="light"
                            leftSection={
                              <IconCheck
                                size={12}
                              />
                            }
                          >
                            Online
                          </Badge>
                        </Group>
                      </Card>


                      <Card
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          Frontend
                        </Text>

                        <Text
                          fw={600}
                          mt={4}
                        >
                          ProxPilot v
                          {__APP_VERSION__}
                        </Text>

                        <Text
                          size="xs"
                          c="dimmed"
                          mt={4}
                        >
                          React + Mantine
                        </Text>
                      </Card>


                      <Card
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          Backend
                        </Text>

                        <Text
                          fw={600}
                          mt={4}
                        >
                          {health?.version ??
                            'Unknown'}
                        </Text>

                        <Text
                          size="xs"
                          c="dimmed"
                          mt={4}
                        >
                          FastAPI
                        </Text>
                      </Card>


                      <Card
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Group gap="xs">
                          <IconRefresh
                            size={16}
                          />

                          <div>
                            <Text
                              size="xs"
                              c="dimmed"
                            >
                              Refresh interval
                            </Text>

                            <Text
                              fw={600}
                              mt={4}
                            >
                              {config
                                ?.refresh_interval ??
                                '–'}{' '}
                              seconds
                            </Text>
                          </div>
                        </Group>
                      </Card>
                    </SimpleGrid>
                  )}
              </Stack>
            </Card>


            <Alert
              variant="light"
              icon={
                <IconServer
                  size={18}
                />
              }
              title="Persistent configuration"
            >
              Proxmox credentials,
              API tokens and infrastructure
              configuration are managed by
              the backend and are not stored
              in the browser.
            </Alert>
          </Stack>
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
