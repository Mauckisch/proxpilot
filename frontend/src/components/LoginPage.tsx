import {
  Alert,
  Button,
  Card,
  Center,
  Image,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconAlertCircle,
  IconLock,
  IconUser,
} from '@tabler/icons-react';

import { api } from '../api';

type LoginPageProps = {
  onAuthenticated: () => void;
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
      'Login failed.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Login failed.';
}

export function LoginPage({
  onAuthenticated,
}: LoginPageProps) {
  const [username, setUsername] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function submitLogin() {
    if (!username.trim() || !password) {
      setError(
        'Please enter username and password.',
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post('/auth/login', {
        username: username.trim(),
        password,
      });

      setPassword('');
      onAuthenticated();
    } catch (loginError) {
      setError(
        getErrorMessage(loginError),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100vh" p="md">
      <Card
        withBorder
        radius="lg"
        padding="xl"
        w="100%"
        maw={420}
        shadow="md"
      >
        <Stack gap="lg">
          <Stack align="center" gap="sm">
            <Image
              src="/branding/proxpilot-icon.svg"
              alt="ProxPilot"
              w={86}
              h={86}
              fit="contain"
            />

            <Title order={2}>
              Prox
              <Text
                component="span"
                inherit
                c="blue.5"
              >
                Pilot
              </Text>
            </Title>

            <Text
              size="sm"
              c="dimmed"
              ta="center"
            >
              Sign in to manage your Proxmox cluster.
            </Text>
          </Stack>

          {error && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={18} />
              }
              title="Login failed"
            >
              {error}
            </Alert>
          )}

          <Stack gap="md">
            <TextInput
              label="Username"
              placeholder="Username"
              leftSection={
                <IconUser size={17} />
              }
              value={username}
              disabled={loading}
              autoComplete="username"
              onChange={(event) =>
                setUsername(
                  event.currentTarget.value,
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void submitLogin();
                }
              }}
            />

            <PasswordInput
              label="Password"
              placeholder="Password"
              leftSection={
                <IconLock size={17} />
              }
              value={password}
              disabled={loading}
              autoComplete="current-password"
              onChange={(event) =>
                setPassword(
                  event.currentTarget.value,
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void submitLogin();
                }
              }}
            />

            <Button
              fullWidth
              loading={loading}
              onClick={() =>
                void submitLogin()
              }
            >
              Sign in
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Center>
  );
}
