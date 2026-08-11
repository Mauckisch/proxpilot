import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
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
  IconBrandDiscord,
  IconCheck,
  IconDeviceFloppy,
  IconMail,
  IconPlugConnected,
  IconTrash,
} from '@tabler/icons-react';
import {
  useEffect,
  useState,
} from 'react';

import { api } from '../api';


type NotificationEvent = {
  event_key: string;
  email_enabled: boolean;
  discord_enabled: boolean;
};


type NotificationSettings = {
  email_enabled: boolean;

  smtp_host: string | null;
  smtp_port: number;
  smtp_security:
    | 'none'
    | 'starttls'
    | 'tls';
  smtp_username: string | null;
  smtp_password_configured: boolean;

  email_from: string | null;
  email_recipients: string[];

  discord_enabled: boolean;
  discord_webhook_configured: boolean;

  events: NotificationEvent[];
};


const EVENT_LABELS: Record<
  string,
  {
    label: string;
    description: string;
  }
> = {
  NODE_OFFLINE: {
    label: 'Node offline',
    description:
      'A Proxmox node becomes unavailable.',
  },

  NODE_ONLINE: {
    label: 'Node online',
    description:
      'A previously unavailable node becomes reachable again.',
  },

  UPDATES_AVAILABLE: {
    label: 'Updates available',
    description:
      'Package updates are detected on a node.',
  },

  UPDATE_INSTALL_SUCCESS: {
    label: 'Update installation successful',
    description:
      'Package updates were installed successfully.',
  },

  UPDATE_INSTALL_FAILED: {
    label: 'Update installation failed',
    description:
      'Installing package updates failed.',
  },

  PACKAGE_CLEANUP_SUCCESS: {
    label: 'Package cleanup successful',
    description:
      'Package cleanup completed successfully.',
  },

  PACKAGE_CLEANUP_FAILED: {
    label: 'Package cleanup failed',
    description:
      'Package cleanup could not be completed.',
  },

  REBOOT_REQUIRED: {
    label: 'Reboot required',
    description:
      'A node requires a reboot after updates.',
  },

  GUEST_BACKUP_SUCCESS: {
    label: 'Guest backup successful',
    description:
      'A VM or container backup completed successfully.',
  },

  GUEST_BACKUP_FAILED: {
    label: 'Guest backup failed',
    description:
      'A VM or container backup failed.',
  },

  SNAPSHOT_SUCCESS: {
    label: 'Snapshot successful',
    description:
      'A guest snapshot was created successfully.',
  },

  SNAPSHOT_FAILED: {
    label: 'Snapshot failed',
    description:
      'Creating a guest snapshot failed.',
  },

  SCHEDULED_TASK_SUCCESS: {
    label: 'Scheduled task successful',
    description:
      'A scheduled ProxPilot task completed successfully.',
  },

  SCHEDULED_TASK_FAILED: {
    label: 'Scheduled task failed',
    description:
      'A scheduled ProxPilot task failed.',
  },
};


function getErrorMessage(
  error: unknown,
): string {
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
      'Notification settings could not be saved.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return (
    'Notification settings could not be saved.'
  );
}


export function NotificationSettingsCard() {
  const [
    settings,
    setSettings,
  ] = useState<NotificationSettings | null>(
    null,
  );

  const [
    smtpPassword,
    setSmtpPassword,
  ] = useState('');

  const [
    discordWebhook,
    setDiscordWebhook,
  ] = useState('');

  const [
    recipients,
    setRecipients,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingEmail,
    setSavingEmail,
  ] = useState(false);

  const [
    savingDiscord,
    setSavingDiscord,
  ] = useState(false);

  const [
    savingEvents,
    setSavingEvents,
  ] = useState(false);

  const [
    testingEmail,
    setTestingEmail,
  ] = useState(false);

  const [
    testingDiscord,
    setTestingDiscord,
  ] = useState(false);

  const [
    loadError,
    setLoadError,
  ] = useState<string | null>(null);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);

      try {
        const response =
          await api.get<NotificationSettings>(
            '/notifications/settings',
          );

        if (!cancelled) {
          setSettings(response.data);

          setRecipients(
            response.data.email_recipients.join(
              '\n',
            ),
          );
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


  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }


  function updateSetting<
    K extends keyof NotificationSettings,
  >(
    key: K,
    value: NotificationSettings[K],
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

    clearMessages();
  }


  function updateEvent(
    eventKey: string,
    channel: 'email' | 'discord',
    enabled: boolean,
  ) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        events: current.events.map(
          (event) =>
            event.event_key === eventKey
              ? {
                  ...event,
                  [
                    channel === 'email'
                      ? 'email_enabled'
                      : 'discord_enabled'
                  ]: enabled,
                }
              : event,
        ),
      };
    });

    clearMessages();
  }


  function parsedRecipients(): string[] {
    return recipients
      .split(/[\n,;]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }


  async function toggleDiscord(
    enabled: boolean,
  ) {
    if (!settings) {
      return;
    }

    const previous =
      settings.discord_enabled;

    setSettings((current) =>
      current
        ? {
            ...current,
            discord_enabled: enabled,
          }
        : current,
    );

    setSavingDiscord(true);
    clearMessages();

    try {
      const response =
        await api.patch<NotificationSettings>(
          '/notifications/settings/discord',
          {
            enabled,
            webhook_url: null,
          },
        );

      setSettings(response.data);

      setSuccessMessage(
        enabled
          ? 'Discord notifications enabled.'
          : 'Discord notifications disabled.',
      );
    } catch (error) {
      setSettings((current) =>
        current
          ? {
              ...current,
              discord_enabled: previous,
            }
          : current,
      );

      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingDiscord(false);
    }
  }


  async function toggleEmail(
    enabled: boolean,
  ) {
    if (!settings) {
      return;
    }

    const previous =
      settings.email_enabled;

    setSettings((current) =>
      current
        ? {
            ...current,
            email_enabled: enabled,
          }
        : current,
    );

    setSavingEmail(true);
    clearMessages();

    try {
      const response =
        await api.patch<NotificationSettings>(
          '/notifications/settings/email',
          {
            enabled,

            smtp_host:
              settings.smtp_host?.trim() ||
              null,

            smtp_port:
              settings.smtp_port,

            smtp_security:
              settings.smtp_security,

            smtp_username:
              settings.smtp_username?.trim() ||
              null,

            smtp_password: null,

            email_from:
              settings.email_from?.trim() ||
              null,

            email_recipients:
              parsedRecipients(),
          },
        );

      setSettings(response.data);

      setRecipients(
        response.data.email_recipients.join(
          '\n',
        ),
      );

      setSuccessMessage(
        enabled
          ? 'Email notifications enabled.'
          : 'Email notifications disabled.',
      );
    } catch (error) {
      setSettings((current) =>
        current
          ? {
              ...current,
              email_enabled: previous,
            }
          : current,
      );

      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingEmail(false);
    }
  }


  async function saveDiscord() {
    if (!settings) {
      return;
    }

    setSavingDiscord(true);
    clearMessages();

    try {
      const response =
        await api.patch<NotificationSettings>(
          '/notifications/settings/discord',
          {
            enabled:
              settings.discord_enabled,
            webhook_url:
              discordWebhook.trim() ||
              null,
          },
        );

      setSettings(response.data);
      setDiscordWebhook('');

      setSuccessMessage(
        'Discord settings saved successfully.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingDiscord(false);
    }
  }


  async function saveEmail() {
    if (!settings) {
      return;
    }

    setSavingEmail(true);
    clearMessages();

    try {
      const response =
        await api.patch<NotificationSettings>(
          '/notifications/settings/email',
          {
            enabled:
              settings.email_enabled,

            smtp_host:
              settings.smtp_host?.trim() ||
              null,

            smtp_port:
              settings.smtp_port,

            smtp_security:
              settings.smtp_security,

            smtp_username:
              settings.smtp_username?.trim() ||
              null,

            smtp_password:
              smtpPassword.trim() ||
              null,

            email_from:
              settings.email_from?.trim() ||
              null,

            email_recipients:
              parsedRecipients(),
          },
        );

      setSettings(response.data);

      setRecipients(
        response.data.email_recipients.join(
          '\n',
        ),
      );

      setSmtpPassword('');

      setSuccessMessage(
        'Email settings saved successfully.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingEmail(false);
    }
  }


  async function saveEvents() {
    if (!settings) {
      return;
    }

    setSavingEvents(true);
    clearMessages();

    try {
      const response =
        await api.patch<NotificationSettings>(
          '/notifications/settings/events',
          {
            events: settings.events,
          },
        );

      setSettings(response.data);

      setSuccessMessage(
        'Notification events saved successfully.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingEvents(false);
    }
  }


  async function testDiscord() {
    setTestingDiscord(true);
    clearMessages();

    try {
      await api.post(
        '/notifications/test',
        {
          channel: 'discord',
          webhook_url:
            discordWebhook.trim() ||
            null,
        },
      );

      setSuccessMessage(
        'Discord test notification sent successfully.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setTestingDiscord(false);
    }
  }


  async function testEmail() {
    if (!settings) {
      return;
    }

    setTestingEmail(true);
    clearMessages();

    try {
      await api.post(
        '/notifications/test',
        {
          channel: 'email',

          smtp_host:
            settings.smtp_host?.trim() ||
            null,

          smtp_port:
            settings.smtp_port,

          smtp_security:
            settings.smtp_security,

          smtp_username:
            settings.smtp_username?.trim() ||
            null,

          smtp_password:
            smtpPassword.trim() ||
            null,

          email_from:
            settings.email_from?.trim() ||
            null,

          email_recipients:
            parsedRecipients(),
        },
      );

      setSuccessMessage(
        'Email test notification sent successfully.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setTestingEmail(false);
    }
  }


  async function deleteDiscord() {
    setSavingDiscord(true);
    clearMessages();

    try {
      const response =
        await api.delete<NotificationSettings>(
          '/notifications/settings/discord',
        );

      setSettings(response.data);
      setDiscordWebhook('');

      setSuccessMessage(
        'Discord configuration removed.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingDiscord(false);
    }
  }


  async function deleteEmail() {
    setSavingEmail(true);
    clearMessages();

    try {
      const response =
        await api.delete<NotificationSettings>(
          '/notifications/settings/email',
        );

      setSettings(response.data);
      setSmtpPassword('');
      setRecipients('');

      setSuccessMessage(
        'Email configuration removed.',
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setSavingEmail(false);
    }
  }


  return (
    <Stack gap="lg">
      {loading && (
        <Text c="dimmed">
          Loading notification settings...
        </Text>
      )}

      {loadError && (
        <Alert
          color="red"
          icon={
            <IconAlertCircle size={18} />
          }
          title={
            'Notification settings could not be loaded'
          }
        >
          {loadError}
        </Alert>
      )}

      {errorMessage && (
        <Alert
          color="red"
          icon={
            <IconAlertCircle size={18} />
          }
          title="Notification operation failed"
        >
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert
          color="green"
          icon={<IconCheck size={18} />}
          title="Notification settings"
        >
          {successMessage}
        </Alert>
      )}

      {settings && !loading && (
        <>
          <Card
            withBorder
            radius="lg"
            p="lg"
          >
            <Stack gap="lg">
              <Group justify="space-between">
                <Group>
                  <ThemeIcon
                    variant="light"
                    size="lg"
                  >
                    <IconBrandDiscord
                      size={20}
                    />
                  </ThemeIcon>

                  <div>
                    <Text fw={600}>
                      Discord
                    </Text>

                    <Text
                      size="sm"
                      c="dimmed"
                    >
                      Send notifications to a
                      Discord webhook.
                    </Text>
                  </div>
                </Group>

                <Switch
                  checked={
                    settings.discord_enabled
                  }
                  disabled={savingDiscord}
                  label={
                    settings.discord_enabled
                      ? 'Enabled'
                      : 'Disabled'
                  }
                  onChange={(event) =>
                    void toggleDiscord(
                      event.currentTarget.checked,
                    )
                  }
                />
              </Group>

              <PasswordInput
                label="Webhook URL"
                description={
                  settings
                    .discord_webhook_configured
                    ? (
                        'A webhook is already stored. ' +
                        'Leave this field empty to keep it unchanged.'
                      )
                    : (
                        'Discord webhook URL used for notifications.'
                      )
                }
                placeholder={
                  settings
                    .discord_webhook_configured
                    ? 'Webhook already configured'
                    : 'https://discord.com/api/webhooks/...'
                }
                value={discordWebhook}
                disabled={savingDiscord}
                onChange={(event) => {
                  setDiscordWebhook(
                    event.currentTarget.value,
                  );
                  clearMessages();
                }}
              />

              <Group justify="flex-start">
                <Button
                  color="red"
                  variant="light"
                  leftSection={
                    <IconTrash size={17} />
                  }
                  disabled={
                    savingDiscord ||
                    !settings
                      .discord_webhook_configured
                  }
                  onClick={() =>
                    void deleteDiscord()
                  }
                >
                  Delete configuration
                </Button>

                <Button
                  variant="light"
                  leftSection={
                    <IconPlugConnected
                      size={17}
                    />
                  }
                  loading={testingDiscord}
                  disabled={savingDiscord}
                  onClick={() =>
                    void testDiscord()
                  }
                >
                  Send test
                </Button>

                <Button
                  leftSection={
                    <IconDeviceFloppy
                      size={17}
                    />
                  }
                  loading={savingDiscord}
                  disabled={testingDiscord}
                  onClick={() =>
                    void saveDiscord()
                  }
                >
                  Save Discord settings
                </Button>
              </Group>
            </Stack>
          </Card>


          <Card
            withBorder
            radius="lg"
            p="lg"
          >
            <Stack gap="lg">
              <Group justify="space-between">
                <Group>
                  <ThemeIcon
                    variant="light"
                    size="lg"
                  >
                    <IconMail size={20} />
                  </ThemeIcon>

                  <div>
                    <Text fw={600}>
                      Email
                    </Text>

                    <Text
                      size="sm"
                      c="dimmed"
                    >
                      Send notifications through
                      an SMTP server.
                    </Text>
                  </div>
                </Group>

                <Switch
                  checked={
                    settings.email_enabled
                  }
                  disabled={savingEmail}
                  label={
                    settings.email_enabled
                      ? 'Enabled'
                      : 'Disabled'
                  }
                  onChange={(event) =>
                    void toggleEmail(
                      event.currentTarget.checked,
                    )
                  }
                />
              </Group>

              <SimpleGrid
                cols={{
                  base: 1,
                  md: 2,
                }}
                spacing="md"
                verticalSpacing="md"
                style={{
                  alignItems: 'start',
                }}
              >
                <TextInput
                  label="SMTP server"
                  placeholder="smtp.example.com"
                  value={
                    settings.smtp_host ?? ''
                  }
                  disabled={savingEmail}
                  onChange={(event) =>
                    updateSetting(
                      'smtp_host',
                      event.currentTarget.value,
                    )
                  }
                />

                <NumberInput
                  label="SMTP port"
                  value={
                    settings.smtp_port
                  }
                  min={1}
                  max={65535}
                  allowDecimal={false}
                  disabled={savingEmail}
                  onChange={(value) =>
                    updateSetting(
                      'smtp_port',
                      typeof value === 'number'
                        ? value
                        : 587,
                    )
                  }
                />

                <Select
                  label="Security"
                  value={
                    settings.smtp_security
                  }
                  allowDeselect={false}
                  disabled={savingEmail}
                  data={[
                    {
                      label: 'None',
                      value: 'none',
                    },
                    {
                      label: 'STARTTLS',
                      value: 'starttls',
                    },
                    {
                      label: 'TLS',
                      value: 'tls',
                    },
                  ]}
                  onChange={(value) =>
                    updateSetting(
                      'smtp_security',
                      value === 'none'
                        ? 'none'
                        : value === 'tls'
                          ? 'tls'
                          : 'starttls',
                    )
                  }
                />

                <TextInput
                  label="SMTP username"
                  value={
                    settings.smtp_username ??
                    ''
                  }
                  disabled={savingEmail}
                  onChange={(event) =>
                    updateSetting(
                      'smtp_username',
                      event.currentTarget.value,
                    )
                  }
                />

                <PasswordInput
                  label="SMTP password"
                  description={
                    settings
                      .smtp_password_configured
                      ? (
                          'A password is already stored. ' +
                          'Leave empty to keep it unchanged.'
                        )
                      : 'SMTP account password'
                  }
                  placeholder={
                    settings
                      .smtp_password_configured
                      ? 'Password already configured'
                      : 'SMTP password'
                  }
                  value={smtpPassword}
                  disabled={savingEmail}
                  onChange={(event) => {
                    setSmtpPassword(
                      event.currentTarget.value,
                    );
                    clearMessages();
                  }}
                />

                <TextInput
                  label="Sender"
                  description="Email address used as the message sender."
                  placeholder="proxpilot@example.com"
                  value={
                    settings.email_from ?? ''
                  }
                  disabled={savingEmail}
                  onChange={(event) =>
                    updateSetting(
                      'email_from',
                      event.currentTarget.value,
                    )
                  }
                />
              </SimpleGrid>

              <TextInput
                label="Recipients"
                description={
                  'Separate multiple addresses with commas, ' +
                  'semicolons or line breaks.'
                }
                placeholder={
                  'admin@example.com, operations@example.com'
                }
                value={recipients}
                disabled={savingEmail}
                onChange={(event) => {
                  setRecipients(
                    event.currentTarget.value,
                  );
                  clearMessages();
                }}
              />

              <Group justify="flex-start">
                <Button
                  color="red"
                  variant="light"
                  leftSection={
                    <IconTrash size={17} />
                  }
                  disabled={
                    savingEmail ||
                    (
                      !settings
                        .smtp_password_configured &&
                      !settings.smtp_host
                    )
                  }
                  onClick={() =>
                    void deleteEmail()
                  }
                >
                  Delete configuration
                </Button>

                <Button
                  variant="light"
                  leftSection={
                    <IconPlugConnected
                      size={17}
                    />
                  }
                  loading={testingEmail}
                  disabled={savingEmail}
                  onClick={() =>
                    void testEmail()
                  }
                >
                  Send test
                </Button>

                <Button
                  leftSection={
                    <IconDeviceFloppy
                      size={17}
                    />
                  }
                  loading={savingEmail}
                  disabled={testingEmail}
                  onClick={() =>
                    void saveEmail()
                  }
                >
                  Save email settings
                </Button>
              </Group>
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
                  <IconCheck size={20} />
                </ThemeIcon>

                <div>
                  <Text fw={600}>
                    Events
                  </Text>

                  <Text
                    size="sm"
                    c="dimmed"
                  >
                    Select which events are sent
                    through each notification
                    channel.
                  </Text>
                </div>
              </Group>

              <Divider />

              <SimpleGrid
                cols={{
                  base: 1,
                  md: 2,
                }}
                spacing="md"
              >
                {settings.events.map(
                  (event) => {
                    const metadata =
                      EVENT_LABELS[
                        event.event_key
                      ];

                    return (
                      <Card
                        key={
                          event.event_key
                        }
                        withBorder
                        radius="md"
                        p="md"
                      >
                        <Stack gap="sm">
                          <div>
                            <Text fw={500}>
                              {metadata?.label ??
                                event.event_key}
                            </Text>

                            <Text
                              size="xs"
                              c="dimmed"
                            >
                              {metadata
                                ?.description ??
                                event.event_key}
                            </Text>
                          </div>

                          <Group>
                            <Checkbox
                              label="Email"
                              checked={
                                event
                                  .email_enabled
                              }
                              disabled={
                                savingEvents
                              }
                              onChange={(
                                changeEvent,
                              ) =>
                                updateEvent(
                                  event.event_key,
                                  'email',
                                  changeEvent
                                    .currentTarget
                                    .checked,
                                )
                              }
                            />

                            <Checkbox
                              label="Discord"
                              checked={
                                event
                                  .discord_enabled
                              }
                              disabled={
                                savingEvents
                              }
                              onChange={(
                                changeEvent,
                              ) =>
                                updateEvent(
                                  event.event_key,
                                  'discord',
                                  changeEvent
                                    .currentTarget
                                    .checked,
                                )
                              }
                            />
                          </Group>
                        </Stack>
                      </Card>
                    );
                  },
                )}
              </SimpleGrid>

              <Group justify="flex-start">
                <Button
                  leftSection={
                    <IconDeviceFloppy
                      size={17}
                    />
                  }
                  loading={savingEvents}
                  onClick={() =>
                    void saveEvents()
                  }
                >
                  Save event settings
                </Button>
              </Group>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
