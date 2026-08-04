import {
  Alert,
  Button,
  Center,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import {
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';

import { api } from '../api';
import App from '../App';
import { LoginPage } from './LoginPage';

type AuthStatus = {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
};

type AuthState =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export function AuthGate() {
  const [state, setState] =
    useState<AuthState>('loading');

  const [error, setError] =
    useState<string | null>(null);

  async function checkSession() {
    setState('loading');
    setError(null);

    try {
      const response =
        await api.get<AuthStatus>(
          '/auth/status',
        );

      setState(
        response.data.authenticated
          ? 'authenticated'
          : 'unauthenticated',
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Authentication status could not be loaded.';

      setError(message);
      setState('error');
    }
  }

  useEffect(() => {
    void checkSession();

    function handleAuthenticationRequired() {
      setState('unauthenticated');
    }

    window.addEventListener(
      'proxpilot-auth-required',
      handleAuthenticationRequired,
    );

    return () => {
      window.removeEventListener(
        'proxpilot-auth-required',
        handleAuthenticationRequired,
      );
    };
  }, []);

  if (state === 'loading') {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="sm">
          <Loader size="lg" />

          <Text c="dimmed">
            Checking authentication...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (state === 'error') {
    return (
      <Center mih="100vh" p="md">
        <Alert
          color="red"
          icon={
            <IconAlertCircle size={20} />
          }
          title="Unable to connect"
          maw={520}
        >
          <Stack gap="md">
            <Text size="sm">
              {error}
            </Text>

            <Button
              variant="light"
              leftSection={
                <IconRefresh size={16} />
              }
              onClick={() =>
                void checkSession()
              }
            >
              Try again
            </Button>
          </Stack>
        </Alert>
      </Center>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <LoginPage
        onAuthenticated={() =>
          setState('authenticated')
        }
      />
    );
  }

  return <App />;
}
