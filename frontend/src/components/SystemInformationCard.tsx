import {
  Alert,
  Badge,
  Card,
  Code,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCpu,
  IconDatabase,
  IconKey,
  IconServer,
  IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { api } from '../api';

type SystemInformation = {
  application: {
    name: string;
    version: string;
    started_at: string;
    uptime_seconds: number;
  };
  runtime: {
    python_version: string;
    python_implementation: string;
    platform: string;
    system: string;
    release: string;
    machine: string;
    architecture: string;
    hostname: string;
    process_id: number;
  };
  database: {
    engine: string;
    sqlite_version: string;
    path: string;
    size_bytes: number | null;
    schema_version: number | null;
    supported_schema_version: number;
  };
  authentication: {
    enabled: boolean;
    local_enabled: boolean;
    ldap_enabled: boolean;
    session_max_age: number;
    cookie_secure: boolean;
    users: {
      total: number;
      local: number;
      ldap: number;
      enabled: number;
    };
  };
  api: {
    refresh_interval: number;
    docs_path: string;
  };
  current_user: {
    id: number;
    username: string;
    role: 'admin' | 'operator' | 'viewer';
    source: 'local' | 'ldap';
  };
};

function formatBytes(value: number | null): string {
  if (value === null) {
    return 'Unknown';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ??
      'System information could not be loaded.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'System information could not be loaded.';
}

export function SystemInformationCard() {
  const [information, setInformation] =
    useState<SystemInformation | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSystemInformation() {
      setLoading(true);
      setError(null);

      try {
        const response =
          await api.get<SystemInformation>(
            '/system',
          );

        if (!cancelled) {
          setInformation(response.data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getErrorMessage(requestError),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSystemInformation();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card withBorder radius="lg" p="lg">
      <Stack gap="lg">
        <Group>
          <ThemeIcon variant="light" size="lg">
            <IconServer size={20} />
          </ThemeIcon>

          <div>
            <Text fw={600}>
              System information
            </Text>

            <Text size="sm" c="dimmed">
              Runtime, database and authentication
              information.
            </Text>
          </div>
        </Group>

        {loading && (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        )}

        {error && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={18} />}
            title="System information unavailable"
          >
            {error}
          </Alert>
        )}

        {information && !loading && !error && (
          <Stack gap="lg">
            <SimpleGrid
              cols={{
                base: 1,
                sm: 2,
                xl: 4,
              }}
            >
              <Card withBorder radius="md" p="md">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    ProxPilot
                  </Text>

                  <Badge color="blue" variant="light">
                    v{information.application.version}
                  </Badge>
                </Group>

                <Text fw={600} mt="sm">
                  Uptime
                </Text>

                <Text size="sm">
                  {formatDuration(
                    information.application
                      .uptime_seconds,
                  )}
                </Text>

                <Text size="xs" c="dimmed" mt="xs">
                  Started{' '}
                  {formatDate(
                    information.application
                      .started_at,
                  )}
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Group gap="xs">
                  <IconCpu size={18} />

                  <Text fw={600}>
                    Runtime
                  </Text>
                </Group>

                <Text size="sm" mt="sm">
                  Python{' '}
                  {
                    information.runtime
                      .python_version
                  }
                </Text>

                <Text size="sm">
                  {
                    information.runtime.machine
                  }{' '}
                  ·{' '}
                  {
                    information.runtime
                      .architecture
                  }
                </Text>

                <Text size="xs" c="dimmed" mt="xs">
                  {
                    information.runtime.hostname
                  }
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Group gap="xs">
                  <IconDatabase size={18} />

                  <Text fw={600}>
                    Database
                  </Text>
                </Group>

                <Text size="sm" mt="sm">
                  {
                    information.database.engine
                  }{' '}
                  {
                    information.database
                      .sqlite_version
                  }
                </Text>

                <Text size="sm">
                  Schema{' '}
                  {
                    information.database
                      .schema_version
                  }{' '}
                  /{' '}
                  {
                    information.database
                      .supported_schema_version
                  }
                </Text>

                <Text size="xs" c="dimmed" mt="xs">
                  {formatBytes(
                    information.database
                      .size_bytes,
                  )}
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Group gap="xs">
                  <IconUsers size={18} />

                  <Text fw={600}>
                    Users
                  </Text>
                </Group>

                <Text size="sm" mt="sm">
                  Total:{' '}
                  {
                    information.authentication
                      .users.total
                  }
                </Text>

                <Text size="sm">
                  Local:{' '}
                  {
                    information.authentication
                      .users.local
                  }
                </Text>

                <Text size="sm">
                  LDAP:{' '}
                  {
                    information.authentication
                      .users.ldap
                  }
                </Text>
              </Card>
            </SimpleGrid>

            <SimpleGrid
              cols={{
                base: 1,
                md: 2,
              }}
            >
              <Card withBorder radius="md" p="md">
                <Group gap="xs">
                  <IconKey size={18} />

                  <Text fw={600}>
                    Authentication
                  </Text>
                </Group>

                <Group mt="md" gap="xs">
                  <Badge
                    color={
                      information.authentication
                        .local_enabled
                        ? 'green'
                        : 'red'
                    }
                    variant="light"
                  >
                    Local{' '}
                    {information.authentication
                      .local_enabled
                      ? 'enabled'
                      : 'disabled'}
                  </Badge>

                  <Badge
                    color={
                      information.authentication
                        .ldap_enabled
                        ? 'green'
                        : 'gray'
                    }
                    variant="light"
                  >
                    LDAP{' '}
                    {information.authentication
                      .ldap_enabled
                      ? 'enabled'
                      : 'disabled'}
                  </Badge>

                  <Badge
                    color={
                      information.authentication
                        .cookie_secure
                        ? 'green'
                        : 'yellow'
                    }
                    variant="light"
                  >
                    Secure cookie{' '}
                    {information.authentication
                      .cookie_secure
                      ? 'enabled'
                      : 'disabled'}
                  </Badge>
                </Group>

                <Text size="sm" mt="md">
                  Session timeout:{' '}
                  {
                    information.authentication
                      .session_max_age
                  }{' '}
                  seconds
                </Text>

                <Text size="sm">
                  Enabled users:{' '}
                  {
                    information.authentication
                      .users.enabled
                  }
                </Text>
              </Card>

              <Card withBorder radius="md" p="md">
                <Text fw={600}>
                  Runtime details
                </Text>

                <Text size="xs" c="dimmed" mt="md">
                  Platform
                </Text>

                <Text size="sm">
                  {
                    information.runtime.platform
                  }
                </Text>

                <Text size="xs" c="dimmed" mt="md">
                  Database path
                </Text>

                <Code
                  block
                  mt={4}
                  style={{
                    overflowWrap: 'anywhere',
                  }}
                >
                  {information.database.path}
                </Code>

                <Text size="xs" c="dimmed" mt="md">
                  Current user
                </Text>

                <Text size="sm">
                  {
                    information.current_user
                      .username
                  }{' '}
                  ·{' '}
                  {
                    information.current_user.role
                  }{' '}
                  ·{' '}
                  {
                    information.current_user
                      .source
                  }
                </Text>
              </Card>
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
