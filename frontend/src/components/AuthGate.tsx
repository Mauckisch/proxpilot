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
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';

import { api } from '../api';
import {
  type AuthUser,
  AuthProvider,
} from '../auth';
import App from '../App';
import { ConsolePage } from '../pages/ConsolePage';
import { LoginPage } from './LoginPage';

type AuthStatus = {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
  role: 'admin' | 'viewer' | null;
  source: 'local' | 'ldap' | null;
};

type AuthState =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

function isConsolePage(): boolean {
  return (
    window.location.pathname === '/console' ||
    window.location.pathname === '/console/'
  );
}

function ConsoleAccessDenied() {
  return (
    <Center
      mih="100vh"
      p="md"
      style={{
        background: '#111111',
      }}
    >
      <Alert
        color="red"
        icon={<IconLock size={20} />}
        title="Administrator permissions required"
        maw={520}
      >
        <Stack gap="md">
          <Text size="sm">
            Only administrators can open virtual
            machine consoles.
          </Text>

          <Button
            variant="light"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Return to ProxPilot
          </Button>
        </Stack>
      </Alert>
    </Center>
  );
}

export function AuthGate() {
  const [state, setState] =
    useState<AuthState>('loading');

  const [user, setUser] =
    useState<AuthUser | null>(null);

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

      if (
        response.data.authenticated &&
        response.data.username &&
        response.data.role &&
        response.data.source
      ) {
        setUser({
          username: response.data.username,
          role: response.data.role,
          source: response.data.source,
        });

        setState('authenticated');
      } else {
        setUser(null);
        setState('unauthenticated');
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Authentication status could not be loaded.';

      setUser(null);
      setError(message);
      setState('error');
    }
  }

  useEffect(() => {
    void checkSession();

    function handleAuthenticationRequired() {
      setUser(null);
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
          void checkSession()
        }
      />
    );
  }

  if (user === null) {
    return null;
  }

  const consolePage = isConsolePage();

  return (
    <AuthProvider user={user}>
      {consolePage ? (
        user.role === 'admin' ? (
          <ConsolePage />
        ) : (
          <ConsoleAccessDenied />
        )
      ) : (
        <App />
      )}
    </AuthProvider>
  );
}
