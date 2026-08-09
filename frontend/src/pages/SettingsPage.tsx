import { useEffect, useState } from 'react';
import { LdapSettingsCard } from '../components/LdapSettingsCard';
import { SystemInformationCard } from '../components/SystemInformationCard';
import { InfrastructureSettingsCard } from '../components/InfrastructureSettingsCard';
import {
  Alert,
  Badge,
  Card,
  Divider,
  Group,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  type MantineColorScheme,
} from '@mantine/core';
import {
  IconAdjustments,
  IconAlertCircle,
  IconApi,
  IconCheck,
  IconLayoutSidebar,
  IconPalette,
  IconRefresh,
} from '@tabler/icons-react';

type SettingsPageProps = {
  colorScheme: MantineColorScheme;
  onColorSchemeChange: (value: MantineColorScheme) => void;
  showActivityPanel: boolean;
  onShowActivityPanelChange: (value: boolean) => void;
  navbarCollapsed: boolean;
  onNavbarCollapsedChange: (value: boolean) => void;
  timeFormat: '12h' | '24h';
  onTimeFormatChange: (value: '12h' | '24h') => void;
};

type BackendHealth = {
  status: string;
  version: string;
};

type BackendConfig = {
  refresh_interval: number;
};

export function SettingsPage({
  colorScheme,
  onColorSchemeChange,
  showActivityPanel,
  onShowActivityPanelChange,
  navbarCollapsed,
  onNavbarCollapsedChange,
  timeFormat,
  onTimeFormatChange,
}: SettingsPageProps) {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [config, setConfig] = useState<BackendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBackendInformation() {
      setLoading(true);
      setBackendError(null);

      try {
        const [healthResponse, configResponse] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/config'),
        ]);

        if (!healthResponse.ok) {
          throw new Error(
            `Health-Endpunkt antwortete mit HTTP ${healthResponse.status}`,
          );
        }

        if (!configResponse.ok) {
          throw new Error(
            `Config-Endpunkt antwortete mit HTTP ${configResponse.status}`,
          );
        }

        const healthData =
          (await healthResponse.json()) as BackendHealth;

        const configData =
          (await configResponse.json()) as BackendConfig;

        if (!cancelled) {
          setHealth(healthData);
          setConfig(configData);
        }
      } catch (error) {
        if (!cancelled) {
          setBackendError(
            error instanceof Error
              ? error.message
              : 'Backend-Informationen konnten nicht geladen werden.',
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

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Settings</Title>

        <Text c="dimmed" mt={4}>
          Darstellung und Verhalten von ProxPilot konfigurieren.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Card withBorder radius="lg" p="lg">
          <Stack gap="lg">
            <Group>
              <ThemeIcon variant="light" size="lg">
                <IconPalette size={20} />
              </ThemeIcon>

              <div>
                <Text fw={600}>Appearance</Text>

                <Text size="sm" c="dimmed">
                  Farbschema der Benutzeroberfläche
                </Text>
              </div>
            </Group>

            <SegmentedControl
              fullWidth
              value={colorScheme}
              onChange={(value) =>
                onColorSchemeChange(value as MantineColorScheme)
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

            <Text size="xs" c="dimmed">
              Bei „System“ verwendet ProxPilot die Einstellung des
              Betriebssystems.
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="lg" p="lg">
          <Stack gap="lg">
            <Group>
              <ThemeIcon variant="light" size="lg">
                <IconLayoutSidebar size={20} />
              </ThemeIcon>

              <div>
                <Text fw={600}>Layout</Text>

                <Text size="sm" c="dimmed">
                  Navigation und Seitenleisten
                </Text>
              </div>
            </Group>

            <Switch
              checked={!navbarCollapsed}
              onChange={(event) =>
                onNavbarCollapsedChange(!event.currentTarget.checked)
              }
              label="Navigation ausgeklappt anzeigen"
              description="Zeigt zusätzlich zu den Symbolen die Namen der Module an."
            />

            <Switch
              checked={showActivityPanel}
              onChange={(event) =>
                onShowActivityPanelChange(event.currentTarget.checked)
              }
              label="Activity Panel anzeigen"
              description="Zeigt laufende und kürzlich gestartete ProxPilot-Aktionen."
            />
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="lg">
          <Group>
            <ThemeIcon variant="light" size="lg">
              <IconAdjustments size={20} />
            </ThemeIcon>

            <div>
              <Text fw={600}>Regional</Text>

              <Text size="sm" c="dimmed">
                Date and time display preferences
              </Text>
            </div>
          </Group>

          <SegmentedControl
            fullWidth
            value={timeFormat}
            onChange={(value) =>
              onTimeFormatChange(
                value as '12h' | '24h',
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

          <Text size="xs" c="dimmed">
            Dates use the international YYYY-MM-DD format.
            Calendar controls are displayed in English.
          </Text>
        </Stack>
      </Card>

      <InfrastructureSettingsCard />

      <LdapSettingsCard />

      <SystemInformationCard />

      <Card withBorder radius="lg" p="lg">
        <Stack gap="lg">
          <Group>
            <ThemeIcon variant="light" size="lg">
              <IconApi size={20} />
            </ThemeIcon>

            <div>
              <Text fw={600}>Backend</Text>

              <Text size="sm" c="dimmed">
                Status und Laufzeitkonfiguration
              </Text>
            </div>
          </Group>

          <Divider />

          {loading && (
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Skeleton height={64} radius="md" />
              <Skeleton height={64} radius="md" />
              <Skeleton height={64} radius="md" />
            </SimpleGrid>
          )}

          {!loading && backendError && (
            <Alert
              color="red"
              icon={<IconAlertCircle size={18} />}
              title="Backend nicht erreichbar"
            >
              {backendError}
            </Alert>
          )}

          {!loading && !backendError && (
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Card withBorder radius="md" p="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="xs" c="dimmed">
                      Status
                    </Text>

                    <Text fw={600} mt={4}>
                      Backend erreichbar
                    </Text>
                  </div>

                  <Badge
                    color="green"
                    variant="light"
                    leftSection={<IconCheck size={12} />}
                  >
                    Online
                  </Badge>
                </Group>
              </Card>

              <Card withBorder radius="md" p="md">
                <Text size="xs" c="dimmed">
                  Frontend
                </Text>

                <Text fw={600} mt={4}>
                  ProxPilot v{__APP_VERSION__}
                </Text>

                <Text size="xs" c="dimmed" mt={4}>
                  React + Mantine
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Text size="xs" c="dimmed">
                  Backend
                </Text>

                <Text fw={600} mt={4}>
                  {health?.version ?? 'Unbekannt'}
                </Text>

                <Text size="xs" c="dimmed" mt={4}>
                  FastAPI
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Group gap="xs">
                  <IconRefresh size={16} />

                  <div>
                    <Text size="xs" c="dimmed">
                      Aktualisierungsintervall
                    </Text>

                    <Text fw={600} mt={4}>
                      {config?.refresh_interval ?? '–'} Sekunden
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
        icon={<IconAdjustments size={18} />}
        title="Speicherung"
      >
        Die Darstellungs- und Layout-Einstellungen werden lokal in diesem
        Browser gespeichert. Proxmox-Zugangsdaten und API-Token bleiben
        ausschließlich in der Backend-Konfiguration.
      </Alert>
    </Stack>
  );
}
