import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconDeviceFloppy,
  IconNetwork,
  IconPlugConnected,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { api } from '../api';

type LdapRole = 'admin' | 'operator' | 'viewer';

type LdapSettings = {
  enabled: boolean;
  server: string;
  port: number;
  use_ssl: boolean;
  start_tls: boolean;
  verify_ssl: boolean;
  bind_dn: string;
  bind_password_configured: boolean;
  base_dn: string;
  user_filter: string;
  admin_group_dn: string;
  operator_group_dn: string;
  viewer_group_dn: string;
  default_role: LdapRole;
};

type LdapSettingsUpdate = Omit<
  LdapSettings,
  'bind_password_configured'
> & {
  bind_password?: string;
};

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
      'LDAP settings could not be saved.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'LDAP settings could not be saved.';
}

export function LdapSettingsCard() {
  const [settings, setSettings] =
    useState<LdapSettings | null>(null);

  const [bindPassword, setBindPassword] =
    useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [saveError, setSaveError] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] =
    useState<string | null>(null);
  const [testError, setTestError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);

      try {
        const response =
          await api.get<LdapSettings>(
            '/settings/ldap',
          );

        if (!cancelled) {
          setSettings(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateSetting<K extends keyof LdapSettings>(
    key: K,
    value: LdapSettings[K],
  ) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });

    setSuccessMessage(null);
    setSaveError(null);
  }

  async function saveSettings() {
    if (!settings) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    const payload: LdapSettingsUpdate = {
      enabled: settings.enabled,
      server: settings.server.trim(),
      port: settings.port,
      use_ssl: settings.use_ssl,
      start_tls: settings.start_tls,
      verify_ssl: settings.verify_ssl,
      bind_dn: settings.bind_dn.trim(),
      base_dn: settings.base_dn.trim(),
      user_filter: settings.user_filter.trim(),
      admin_group_dn:
        settings.admin_group_dn.trim(),
      operator_group_dn:
        settings.operator_group_dn.trim(),
      viewer_group_dn:
        settings.viewer_group_dn.trim(),
      default_role: settings.default_role,
    };

    if (bindPassword.length > 0) {
      payload.bind_password = bindPassword;
    }

    try {
      await api.put(
        '/settings/ldap',
        payload,
      );

      setBindPassword('');

      setSettings((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          bind_password_configured:
            current.bind_password_configured ||
            bindPassword.length > 0,
        };
      });

      setSuccessMessage(
        'LDAP settings saved successfully.',
      );
    } catch (error) {
      setSaveError(
        getErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestMessage(null);
    setTestError(null);

    try {
      if (!settings) {
        return;
      }

      const payload: LdapSettingsUpdate = {
        enabled: settings.enabled,
        server: settings.server.trim(),
        port: settings.port,
        use_ssl: settings.use_ssl,
        start_tls: settings.start_tls,
        verify_ssl: settings.verify_ssl,
        bind_dn: settings.bind_dn.trim(),
        base_dn: settings.base_dn.trim(),
        user_filter: settings.user_filter.trim(),
        admin_group_dn:
          settings.admin_group_dn.trim(),
        operator_group_dn:
          settings.operator_group_dn.trim(),
        viewer_group_dn:
          settings.viewer_group_dn.trim(),
        default_role: settings.default_role,
      };

      if (bindPassword.length > 0) {
        payload.bind_password = bindPassword;
      }

      const response = await api.post<{
        ok: boolean;
        server: string;
        port: number;
        encrypted: boolean;
        bind_used: boolean;
        base_dn: string;
        message: string;
      }>(
        '/settings/ldap/test',
        payload,
      );

      const result = response.data;

      setTestMessage(
        `${result.message} Server: ${result.server}:${result.port}. `
        + `Encryption: ${result.encrypted ? 'yes' : 'no'}. `
        + `Bind account: ${result.bind_used ? 'used' : 'not used'}.`,
      );
    } catch (error) {
      setTestError(
        getErrorMessage(error),
      );
    } finally {
      setTesting(false);
    }
  }


  return (
    <Card withBorder radius="lg" p="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group>
            <ThemeIcon
              variant="light"
              size="lg"
            >
              <IconNetwork size={20} />
            </ThemeIcon>

            <div>
              <Text fw={600}>
                LDAP authentication
              </Text>

              <Text size="sm" c="dimmed">
                Configure optional LDAP or Active
                Directory authentication.
              </Text>
            </div>
          </Group>

          {settings && (
            <Switch
              checked={settings.enabled}
              disabled={loading || saving}
              label={
                settings.enabled
                  ? 'Enabled'
                  : 'Disabled'
              }
              onChange={(event) =>
                updateSetting(
                  'enabled',
                  event.currentTarget.checked,
                )
              }
            />
          )}
        </Group>

        {loading && (
          <Text c="dimmed">
            Loading LDAP settings...
          </Text>
        )}

        {loadError && (
          <Alert
            color="red"
            icon={
              <IconAlertCircle size={18} />
            }
            title="LDAP settings could not be loaded"
          >
            {loadError}
          </Alert>
        )}

        {settings && !loading && (
          <>
            {saveError && (
              <Alert
                color="red"
                icon={
                  <IconAlertCircle size={18} />
                }
                title="LDAP settings could not be saved"
              >
                {saveError}
              </Alert>
            )}

            {successMessage && (
              <Alert
                color="green"
                icon={<IconCheck size={18} />}
                title="Settings saved"
              >
                {successMessage}
              </Alert>
            )}

            <SimpleGrid
              cols={{
                base: 1,
                md: 2,
              }}
            >
              <TextInput
                label="LDAP server"
                description="Hostname or IP address without ldap:// or ldaps://"
                placeholder="dc01.example.local"
                value={settings.server}
                disabled={saving}
                onChange={(event) =>
                  updateSetting(
                    'server',
                    event.currentTarget.value,
                  )
                }
              />

              <NumberInput
                label="Port"
                description="LDAP service port"
                value={settings.port}
                min={1}
                max={65535}
                allowDecimal={false}
                disabled={saving}
                onChange={(value) =>
                  updateSetting(
                    'port',
                    typeof value === 'number'
                      ? value
                      : 389,
                  )
                }
              />
            </SimpleGrid>

            <SimpleGrid
              cols={{
                base: 1,
                md: 3,
              }}
            >
              <Checkbox
                label="Use LDAPS"
                description="Encrypted connection from the beginning"
                checked={settings.use_ssl}
                disabled={
                  saving ||
                  settings.start_tls
                }
                onChange={(event) =>
                  updateSetting(
                    'use_ssl',
                    event.currentTarget.checked,
                  )
                }
              />

              <Checkbox
                label="Use StartTLS"
                description="Upgrade a normal LDAP connection"
                checked={settings.start_tls}
                disabled={
                  saving ||
                  settings.use_ssl
                }
                onChange={(event) =>
                  updateSetting(
                    'start_tls',
                    event.currentTarget.checked,
                  )
                }
              />

              <Checkbox
                label="Verify TLS certificate"
                description="Recommended for production environments"
                checked={settings.verify_ssl}
                disabled={saving}
                onChange={(event) =>
                  updateSetting(
                    'verify_ssl',
                    event.currentTarget.checked,
                  )
                }
              />
            </SimpleGrid>

            <TextInput
              label="Base DN"
              placeholder="DC=example,DC=local"
              value={settings.base_dn}
              disabled={saving}
              onChange={(event) =>
                updateSetting(
                  'base_dn',
                  event.currentTarget.value,
                )
              }
            />

            <TextInput
              label="Bind DN"
              description="Optional service account used to search the directory"
              placeholder="CN=svc-proxpilot,OU=Service Accounts,DC=example,DC=local"
              value={settings.bind_dn}
              disabled={saving}
              onChange={(event) =>
                updateSetting(
                  'bind_dn',
                  event.currentTarget.value,
                )
              }
            />

            <PasswordInput
              label="Bind password"
              description={
                settings.bind_password_configured
                  ? 'A password is already stored. Leave this field empty to keep it unchanged.'
                  : 'Enter the password for the LDAP bind account.'
              }
              placeholder={
                settings.bind_password_configured
                  ? 'Password already configured'
                  : 'Bind password'
              }
              value={bindPassword}
              disabled={saving}
              onChange={(event) =>
                setBindPassword(
                  event.currentTarget.value,
                )
              }
            />

            <TextInput
              label="User filter"
              description="The filter must contain the placeholder {username}."
              value={settings.user_filter}
              disabled={saving}
              onChange={(event) =>
                updateSetting(
                  'user_filter',
                  event.currentTarget.value,
                )
              }
            />

            <Select
              label="Default role"
              description="Role assigned to new LDAP users when no group mapping matches"
              value={settings.default_role}
              disabled={saving}
              allowDeselect={false}
              data={[
                {
                  label: 'Viewer',
                  value: 'viewer',
                },
                {
                  label: 'Operator',
                  value: 'operator',
                },
                {
                  label: 'Administrator',
                  value: 'admin',
                },
              ]}
              onChange={(value) =>
                updateSetting(
                  'default_role',
                  value === 'admin'
                    ? 'admin'
                    : value === 'operator'
                      ? 'operator'
                      : 'viewer',
                )
              }
            />

            <SimpleGrid
              cols={{
                base: 1,
                md: 3,
              }}
            >
              <TextInput
                label="Administrator group DN"
                description="Optional"
                placeholder="CN=ProxPilot-Admins,OU=Groups,DC=example,DC=local"
                value={settings.admin_group_dn}
                disabled={saving}
                onChange={(event) =>
                  updateSetting(
                    'admin_group_dn',
                    event.currentTarget.value,
                  )
                }
              />

              <TextInput
                label="Operator group DN"
                description="Optional"
                placeholder="CN=ProxPilot-Operators,OU=Groups,DC=example,DC=local"
                value={settings.operator_group_dn}
                disabled={saving}
                onChange={(event) =>
                  updateSetting(
                    'operator_group_dn',
                    event.currentTarget.value,
                  )
                }
              />

              <TextInput
                label="Viewer group DN"
                description="Optional"
                placeholder="CN=ProxPilot-Viewers,OU=Groups,DC=example,DC=local"
                value={settings.viewer_group_dn}
                disabled={saving}
                onChange={(event) =>
                  updateSetting(
                    'viewer_group_dn',
                    event.currentTarget.value,
                  )
                }
              />
            </SimpleGrid>

            {testMessage && (
              <Alert
                color="green"
                icon={<IconCheck size={18} />}
                title="LDAP connection successful"
              >
                {testMessage}
              </Alert>
            )}

            {testError && (
              <Alert
                color="red"
                icon={<IconAlertCircle size={18} />}
                title="LDAP connection failed"
              >
                {testError}
              </Alert>
            )}

            <Alert
              color="blue"
              icon={<IconNetwork size={18} />}
              title="Local login remains available"
            >
              LDAP is an additional authentication method.
              Existing local ProxPilot users remain usable,
              including the local administrator account.
            </Alert>

            <Group justify="flex-end">
              <Button
                variant="light"
                leftSection={
                  <IconPlugConnected size={17} />
                }
                loading={testing}
                disabled={saving}
                onClick={() =>
                  void testConnection()
                }
              >
                Test connection
              </Button>

              <Button
                leftSection={
                  <IconDeviceFloppy
                    size={17}
                  />
                }
                loading={saving}
                disabled={testing}
                onClick={() =>
                  void saveSettings()
                }
              >
                Save LDAP settings
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
